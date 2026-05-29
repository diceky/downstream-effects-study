import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id, survey_answers_json } = parseBody<{
    writer_id?: string;
    survey_answers_json?: Record<string, unknown>;
  }>(event.body);
  if (!writer_id || !survey_answers_json) {
    return jsonResponse(400, { error: "未回答の必須項目があります。入力内容を確認してください。" });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("writers")
    .update({
      survey_answers_json,
      survey_submitted_at: now,
      status: "completed",
      updated_at: now,
    })
    .eq("writer_id", writer_id);

  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  return jsonResponse(200, { ok: true });
};
