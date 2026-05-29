import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

interface Body {
  writer_id?: string;
  memo_id?: string;
  condition?: string;
  final_memo_text?: string;
  task_duration_seconds?: number;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id, memo_id, condition, final_memo_text, task_duration_seconds } = parseBody<Body>(event.body);
  if (!writer_id || !memo_id || !condition || typeof final_memo_text !== "string") {
    return jsonResponse(400, { error: "未回答の必須項目があります。入力内容を確認してください。" });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { error: memoError } = await supabase.from("memos").upsert(
    {
      memo_id,
      writer_id,
      condition,
      final_memo_text,
      submitted_at: now,
      updated_at: now,
    },
    { onConflict: "memo_id" }
  );
  if (memoError) {
    return jsonResponse(500, { error: "メモの保存中にエラーが発生しました。" });
  }

  const { error: writerError } = await supabase
    .from("writers")
    .update({
      task_ended_at: now,
      task_duration_seconds: task_duration_seconds ?? null,
      updated_at: now,
    })
    .eq("writer_id", writer_id);
  if (writerError) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }

  return jsonResponse(200, { ok: true });
};
