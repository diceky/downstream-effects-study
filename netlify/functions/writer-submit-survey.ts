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
  // Idempotency guard: only the first submission wins; retries are treated as a
  // no-op success so the client can move on without overwriting stored answers.
  const { data: updated, error } = await supabase
    .from("writers")
    .update({
      survey_answers_json,
      survey_submitted_at: now,
      status: "completed",
      updated_at: now,
    })
    .eq("writer_id", writer_id)
    .is("survey_submitted_at", null)
    .select("writer_id");

  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  if (!updated || updated.length === 0) {
    return jsonResponse(200, { ok: true, already_submitted: true });
  }
  return jsonResponse(200, { ok: true });
};
