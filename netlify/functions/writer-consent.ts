import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id, consent_version } = parseBody<{
    writer_id?: string;
    consent_version?: string;
  }>(event.body);
  if (!writer_id || !consent_version) {
    return jsonResponse(400, { error: "未回答の必須項目があります。入力内容を確認してください。" });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("writers")
    .update({
      consent_given: true,
      consent_timestamp: now,
      consent_version,
      status: "started",
      updated_at: now,
    })
    .eq("writer_id", writer_id);

  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  return jsonResponse(200, { ok: true });
};
