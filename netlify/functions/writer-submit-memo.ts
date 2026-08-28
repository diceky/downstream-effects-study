import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

interface Body {
  writer_id?: string;
  memo_id?: string;
  final_memo_text?: string;
  task_duration_seconds?: number;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id, memo_id, final_memo_text, task_duration_seconds } = parseBody<Body>(event.body);
  if (!writer_id || !memo_id || typeof final_memo_text !== "string") {
    return jsonResponse(400, { error: "未回答の必須項目があります。入力内容を確認してください。" });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  // Atomic claim: only succeeds when (writer_id, memo_id) matches the row started for
  // this writer AND task_ended_at is still null. Prevents overwrite via client-supplied
  // memo_id and prevents double-submit races. `condition` is trusted from the DB, not
  // the client body.
  const { data: claimed, error: claimErr } = await supabase
    .from("writers")
    .update({
      task_ended_at: now,
      task_duration_seconds: task_duration_seconds ?? null,
      updated_at: now,
    })
    .eq("writer_id", writer_id)
    .eq("current_memo_id", memo_id)
    .is("task_ended_at", null)
    .select("condition");

  if (claimErr) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  if (!claimed || claimed.length === 0) {
    return jsonResponse(200, { ok: true, already_submitted: true });
  }

  const trustedCondition = claimed[0].condition;
  if (!trustedCondition) {
    return jsonResponse(409, { error: "条件が割り当てられていません。研究担当者（Dice）までご連絡ください。" });
  }

  const { error: memoError } = await supabase.from("memos").insert({
    memo_id,
    writer_id,
    condition: trustedCondition,
    final_memo_text,
    submitted_at: now,
    updated_at: now,
  });
  if (memoError) {
    // Best-effort rollback of the claim so the writer can retry.
    await supabase
      .from("writers")
      .update({ task_ended_at: null, task_duration_seconds: null, updated_at: now })
      .eq("writer_id", writer_id)
      .eq("current_memo_id", memo_id);
    return jsonResponse(500, { error: "メモの保存中にエラーが発生しました。" });
  }

  return jsonResponse(200, { ok: true });
};
