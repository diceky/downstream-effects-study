import type { Handler } from "@netlify/functions";
import { randomUUID } from "node:crypto";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id } = parseBody<{ writer_id?: string }>(event.body);
  if (!writer_id) {
    return jsonResponse(400, { error: "writer_id is required" });
  }

  const memo_id = randomUUID();
  const session_id = randomUUID();
  const now = new Date().toISOString();

  const supabase = getSupabase();
  const { error } = await supabase
    .from("writers")
    .update({ task_started_at: now, updated_at: now })
    .eq("writer_id", writer_id);

  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }

  return jsonResponse(200, { memo_id, session_id });
};
