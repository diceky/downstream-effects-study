import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { reader_id, delayed_answers_json } = parseBody<{
    reader_id?: string;
    delayed_answers_json?: Record<string, unknown>;
  }>(event.body);
  if (!reader_id || !delayed_answers_json) {
    return jsonResponse(400, { error: "未回答の必須項目があります。" });
  }
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("readers")
    .update({
      delayed_answers_json,
      delayed_submitted_at: now,
      status: "completed",
      updated_at: now,
    })
    .eq("reader_id", reader_id);
  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  return jsonResponse(200, { ok: true });
};
