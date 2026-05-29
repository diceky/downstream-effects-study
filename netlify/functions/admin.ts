import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, normaliseEmail, parseBody } from "./_supabase";

interface Body {
  action?: string;
  payload?: Record<string, any>;
}

// Whitelist of columns that can be set via admin endpoints.
// Note: status is intentionally excluded — the app manages it.
const WRITER_FIELDS = [
  "writer_id",
  "email",
  "condition",
  "program_overview_pdf_url",
  "reflections_json",
];
const READER_FIELDS = [
  "reader_id",
  "email",
  "assigned_memo_id",
  "assigned_writer_id",
];

function pick<T extends Record<string, any>>(obj: T, keys: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function authorised(event: any): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const headers = event.headers ?? {};
  const got = headers["x-admin-password"] ?? headers["X-Admin-Password"];
  return typeof got === "string" && got === expected;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();

  if (!process.env.ADMIN_PASSWORD) {
    return jsonResponse(500, {
      error: "ADMIN_PASSWORD is not configured on the server.",
    });
  }
  if (!authorised(event)) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const { action, payload = {} } = parseBody<Body>(event.body);
  const supabase = getSupabase();
  const now = new Date().toISOString();

  try {
    switch (action) {
      case "list": {
        const [writersRes, readersRes, memosRes] = await Promise.all([
          supabase
            .from("writers")
            .select(
              "writer_id, email, condition, status, program_overview_pdf_url, reflections_json, created_at"
            )
            .order("created_at", { ascending: true }),
          supabase
            .from("readers")
            .select(
              "reader_id, email, assigned_memo_id, assigned_writer_id, status, immediate_submitted_at, delayed_submitted_at, created_at"
            )
            .order("created_at", { ascending: true }),
          supabase
            .from("memos")
            .select("memo_id, writer_id, condition, submitted_at")
            .order("submitted_at", { ascending: false }),
        ]);
        if (writersRes.error) throw writersRes.error;
        if (readersRes.error) throw readersRes.error;
        if (memosRes.error) throw memosRes.error;
        return jsonResponse(200, {
          writers: writersRes.data ?? [],
          readers: readersRes.data ?? [],
          memos: memosRes.data ?? [],
        });
      }

      case "upsert_writer": {
        const data = pick(payload, WRITER_FIELDS);
        if (!data.writer_id || !data.email || !data.condition) {
          return jsonResponse(400, { error: "writer_id, email, condition are required" });
        }
        data.email = normaliseEmail(data.email);
        if (!["human_only", "ai_mediated"].includes(data.condition)) {
          return jsonResponse(400, { error: "condition must be human_only or ai_mediated" });
        }
        data.updated_at = now;
        const { error } = await supabase
          .from("writers")
          .upsert(data, { onConflict: "writer_id" });
        if (error) throw error;
        return jsonResponse(200, { ok: true });
      }

      case "delete_writer": {
        const { writer_id } = payload;
        if (!writer_id) return jsonResponse(400, { error: "writer_id required" });
        const { error } = await supabase.from("writers").delete().eq("writer_id", writer_id);
        if (error) throw error;
        return jsonResponse(200, { ok: true });
      }

      case "upsert_reader": {
        const data = pick(payload, READER_FIELDS);
        if (!data.reader_id || !data.email || !data.assigned_memo_id || !data.assigned_writer_id) {
          return jsonResponse(400, {
            error: "reader_id, email, assigned_memo_id, assigned_writer_id are required",
          });
        }
        data.email = normaliseEmail(data.email);
        data.updated_at = now;
        const { error } = await supabase
          .from("readers")
          .upsert(data, { onConflict: "reader_id" });
        if (error) throw error;
        return jsonResponse(200, { ok: true });
      }

      case "delete_reader": {
        const { reader_id } = payload;
        if (!reader_id) return jsonResponse(400, { error: "reader_id required" });
        const { error } = await supabase.from("readers").delete().eq("reader_id", reader_id);
        if (error) throw error;
        return jsonResponse(200, { ok: true });
      }

      case "reset_writer": {
        const { writer_id } = payload;
        if (!writer_id) return jsonResponse(400, { error: "writer_id required" });
        const { error } = await supabase
          .from("writers")
          .update({
            status: "not_started",
            consent_given: false,
            consent_timestamp: null,
            consent_version: null,
            task_started_at: null,
            task_ended_at: null,
            task_duration_seconds: null,
            survey_answers_json: null,
            survey_submitted_at: null,
            updated_at: now,
          })
          .eq("writer_id", writer_id);
        if (error) throw error;
        return jsonResponse(200, { ok: true });
      }

      case "reset_reader": {
        const { reader_id } = payload;
        if (!reader_id) return jsonResponse(400, { error: "reader_id required" });
        const { error } = await supabase
          .from("readers")
          .update({
            status: "not_started",
            consent_given: false,
            consent_timestamp: null,
            consent_version: null,
            immediate_started_at: null,
            reading_started_at: null,
            reading_ended_at: null,
            reading_duration_seconds: null,
            immediate_answers_json: null,
            immediate_submitted_at: null,
            delayed_available_from: null,
            delayed_answers_json: null,
            delayed_submitted_at: null,
            updated_at: now,
          })
          .eq("reader_id", reader_id);
        if (error) throw error;
        return jsonResponse(200, { ok: true });
      }

      default:
        return jsonResponse(400, { error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    return jsonResponse(500, { error: e?.message ?? "Admin action failed" });
  }
};
