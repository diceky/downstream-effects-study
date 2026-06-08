import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { reader_id, consent_version } = parseBody<{
    reader_id?: string;
    consent_version?: string;
  }>(event.body);
  if (!reader_id || !consent_version) {
    return jsonResponse(400, { error: "未回答の必須項目があります。" });
  }
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("readers")
    .update({
      consent_given: true,
      consent_timestamp: now,
      consent_version,
      status: "started",
      immediate_started_at: now,
      updated_at: now,
    })
    .eq("reader_id", reader_id)
    .is("consent_given", false);
  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  return jsonResponse(200, { ok: true });
};
