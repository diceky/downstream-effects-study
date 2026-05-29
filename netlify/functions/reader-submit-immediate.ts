import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

interface Body {
  reader_id?: string;
  reading_started_at?: string;
  reading_ended_at?: string;
  reading_duration_seconds?: number;
  immediate_answers_json?: Record<string, unknown>;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const {
    reader_id,
    reading_started_at,
    reading_ended_at,
    reading_duration_seconds,
    immediate_answers_json,
  } = parseBody<Body>(event.body);
  if (!reader_id || !immediate_answers_json) {
    return jsonResponse(400, { error: "未回答の必須項目があります。" });
  }

  const supabase = getSupabase();
  const now = new Date();
  const delayedFrom = new Date(now.getTime() + FOURTEEN_DAYS_MS);
  const { error } = await supabase
    .from("readers")
    .update({
      reading_started_at: reading_started_at ?? null,
      reading_ended_at: reading_ended_at ?? null,
      reading_duration_seconds: reading_duration_seconds ?? null,
      immediate_answers_json,
      immediate_submitted_at: now.toISOString(),
      delayed_available_from: delayedFrom.toISOString(),
      status: "started",
      updated_at: now.toISOString(),
    })
    .eq("reader_id", reader_id);
  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  return jsonResponse(200, { ok: true });
};
