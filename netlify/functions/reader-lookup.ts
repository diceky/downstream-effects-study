import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, normaliseEmail, parseBody } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { email } = parseBody<{ email?: string }>(event.body);
  const normalised = normaliseEmail(email);
  if (!normalised) {
    return jsonResponse(400, { error: "メールアドレスを入力してください。" });
  }

  const supabase = getSupabase();
  const { data: rows, error } = await supabase
    .from("readers")
    .select(
      "reader_id, assigned_memo_id, assigned_writer_id, status, immediate_submitted_at, delayed_submitted_at, delayed_available_from"
    )
    .eq("email", normalised);

  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  if (!rows || rows.length === 0) {
    return jsonResponse(404, {
      error:
        "このメールアドレスは、本研究のメモ閲覧タスクに割り当てられていません。会社のメールアドレスが正しく入力されているか確認してください。問題が続く場合は、研究担当者までご連絡ください。",
    });
  }
  if (rows.length > 1) {
    return jsonResponse(409, {
      error: "このメールアドレスに複数の研究タスクが割り当てられています。研究担当者までご連絡ください。",
    });
  }

  const reader = rows[0];

  if (!reader.immediate_submitted_at) {
    const { data: memo, error: memoErr } = await supabase
      .from("memos")
      .select("final_memo_text")
      .eq("memo_id", reader.assigned_memo_id)
      .maybeSingle();
    if (memoErr || !memo) {
      return jsonResponse(500, { error: "メモを読み込めませんでした。研究担当者までご連絡ください。" });
    }
    const { data: writer } = await supabase
      .from("writers")
      .select("name, email")
      .eq("writer_id", reader.assigned_writer_id)
      .maybeSingle();
    return jsonResponse(200, {
      route: "immediate",
      reader_id: reader.reader_id,
      assigned_memo_id: reader.assigned_memo_id,
      assigned_writer_id: reader.assigned_writer_id,
      status: reader.status,
      memo_text: memo.final_memo_text,
      writer_name: writer?.name ?? null,
      writer_email: writer?.email ?? null,
    });
  }

  if (reader.immediate_submitted_at && !reader.delayed_submitted_at) {
    return jsonResponse(200, {
      route: "delayed",
      reader_id: reader.reader_id,
      assigned_memo_id: reader.assigned_memo_id,
      assigned_writer_id: reader.assigned_writer_id,
      delayed_available_from: reader.delayed_available_from,
    });
  }

  return jsonResponse(200, { route: "completed" });
};
