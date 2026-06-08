import type { Handler } from "@netlify/functions";
import { randomUUID } from "node:crypto";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id } = parseBody<{ writer_id?: string }>(event.body);
  if (!writer_id) {
    return jsonResponse(400, { error: "writer_id is required" });
  }

  const supabase = getSupabase();

  // Idempotent: if the writer has already started (task_started_at set and
  // current ids persisted) return the existing ids so a refresh / crash
  // resumes the same memo and preserves the original timer.
  const { data: existing, error: lookupErr } = await supabase
    .from("writers")
    .select("task_started_at, current_memo_id, current_session_id")
    .eq("writer_id", writer_id)
    .maybeSingle();

  if (lookupErr) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }
  if (!existing) {
    return jsonResponse(404, { error: "Writer not found" });
  }

  if (existing.task_started_at && existing.current_memo_id && existing.current_session_id) {
    return jsonResponse(200, {
      memo_id: existing.current_memo_id,
      session_id: existing.current_session_id,
      task_started_at: existing.task_started_at,
      resumed: true,
    });
  }

  const memo_id = randomUUID();
  const session_id = randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("writers")
    .update({
      task_started_at: now,
      current_memo_id: memo_id,
      current_session_id: session_id,
      updated_at: now,
    })
    .eq("writer_id", writer_id);

  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }

  return jsonResponse(200, {
    memo_id,
    session_id,
    task_started_at: now,
    resumed: false,
  });
};
