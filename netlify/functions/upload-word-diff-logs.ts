import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

interface LogEntry {
  timestamp?: string;
  session_id?: string;
  writer_id?: string;
  memo_id?: string;
  condition?: string;
  surface_key?: string;
  location?: string;
  target_key?: string;
  source?: string;
  added_words?: number;
  removed_words?: number;
  metadata_json?: Record<string, unknown>;
}

interface Body {
  writer_id?: string;
  memo_id?: string;
  session_id?: string;
  logs?: LogEntry[];
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id, memo_id, session_id, logs } = parseBody<Body>(event.body);
  if (!writer_id || !memo_id || !session_id || !Array.isArray(logs)) {
    return jsonResponse(400, { error: "Invalid payload" });
  }
  if (logs.length === 0) return jsonResponse(200, { inserted: 0 });

  const supabase = getSupabase();

  // Ownership guard: the (writer_id, memo_id, session_id) triple must match the row
  // written by writer-start. Blocks arbitrary clients from polluting the log table
  // with rows attributed to another participant.
  const { data: writerRow, error: lookupErr } = await supabase
    .from("writers")
    .select("current_memo_id, current_session_id")
    .eq("writer_id", writer_id)
    .maybeSingle();
  if (lookupErr) {
    return jsonResponse(500, { error: "Failed to verify session" });
  }
  if (
    !writerRow ||
    writerRow.current_memo_id !== memo_id ||
    writerRow.current_session_id !== session_id
  ) {
    return jsonResponse(403, { error: "Session mismatch" });
  }

  const rows = logs.map((l) => ({
    session_id,
    writer_id,
    memo_id,
    condition: l.condition ?? null,
    surface_key: l.surface_key ?? null,
    location: l.location ?? null,
    target_key: l.target_key ?? null,
    source: l.source ?? null,
    added_words: l.added_words ?? 0,
    removed_words: l.removed_words ?? 0,
    metadata_json: l.metadata_json ?? {},
    created_at: l.timestamp ?? new Date().toISOString(),
  }));

  const { error } = await supabase.from("word_diff_logs").insert(rows);
  if (error) {
    return jsonResponse(500, { error: "Failed to insert logs" });
  }
  return jsonResponse(200, { inserted: rows.length });
};
