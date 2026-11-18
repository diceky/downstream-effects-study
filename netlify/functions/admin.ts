import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, normaliseEmail, parseBody } from "./_supabase";

interface Body {
  action?: string;
  payload?: Record<string, any>;
}

// Whitelist of columns that can be set via admin endpoints.
// Note: status is intentionally excluded — the app manages it.
// condition is intentionally excluded — it is randomly assigned by writer-lookup on first login.
const WRITER_FIELDS = [
  "writer_id",
  "email",
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

// In-place Fisher-Yates; used to present scoring pairs in a randomised order
// (scoring must be blind to condition and order must not leak anything).
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
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
            .select("memo_id, writer_id, condition, submitted_at, final_memo_text")
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
        if (!data.writer_id || !data.email) {
          return jsonResponse(400, { error: "writer_id, email are required" });
        }
        data.email = normaliseEmail(data.email);
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
            current_memo_id: null,
            current_session_id: null,
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
            scoring: null,
            updated_at: now,
          })
          .eq("reader_id", reader_id);
        if (error) throw error;
        return jsonResponse(200, { ok: true });
      }

      case "scoring_list": {
        // Blinded scoring view: intentionally returns NO condition, email, or
        // writer_id information, and presents pairs in randomised order.
        const [readersRes, writersRes] = await Promise.all([
          supabase
            .from("readers")
            .select("reader_id, assigned_writer_id, immediate_answers_json, scoring")
            .in("status", ["started", "completed"])
            .order("created_at", { ascending: true }),
          supabase
            .from("writers")
            .select("writer_id, survey_answers_json")
            .eq("status", "completed")
            .order("created_at", { ascending: true }),
        ]);
        if (readersRes.error) throw readersRes.error;
        if (writersRes.error) throw writersRes.error;

        const writerIntentById = new Map<string, string>();
        for (const w of writersRes.data ?? []) {
          if (w.writer_id.toUpperCase().includes("TEST")) continue; // skip test accounts
          const intent = (w.survey_answers_json as any)?.key_takeaway;
          if (typeof intent === "string" && intent.trim()) {
            writerIntentById.set(w.writer_id, intent);
          }
        }

        const pairs: Array<{
          reader_id: string;
          writer_intent: string;
          reader_intents: string[];
          scoring: any;
        }> = [];
        for (const r of readersRes.data ?? []) {
          if (r.reader_id.toUpperCase().includes("TEST")) continue; // skip test accounts
          const writerIntent = writerIntentById.get(r.assigned_writer_id);
          if (!writerIntent) continue;
          const mainPoint = (r.immediate_answers_json as any)?.main_point;
          const readerIntents = Array.isArray(mainPoint)
            ? mainPoint
                .filter((t: any) => typeof t === "string" && t.trim())
                .map((t: any) => t.trim())
            : [];
          if (readerIntents.length === 0) continue;
          pairs.push({
            reader_id: r.reader_id,
            writer_intent: writerIntent,
            reader_intents: readerIntents,
            scoring: (r as any).scoring?.alignment ?? null,
          });
        }

        return jsonResponse(200, { pairs: shuffle(pairs) });
      }

      case "scoring_save": {
        const { reader_id, scores } = payload;
        if (!reader_id || typeof reader_id !== "string") {
          return jsonResponse(400, { error: "reader_id is required" });
        }
        if (!Array.isArray(scores) || scores.length < 1 || scores.length > 3) {
          return jsonResponse(400, { error: "scores must be an array of 1-3 entries" });
        }
        const normalised = scores.map((s: any) => ({
          text: typeof s?.text === "string" ? s.text.trim() : "",
          score: s?.score,
        }));
        for (const s of normalised) {
          if (!s.text) {
            return jsonResponse(400, { error: "Each score entry needs non-empty text" });
          }
          if (s.score !== 0 && s.score !== 1 && s.score !== 2) {
            return jsonResponse(400, { error: "Each score must be 0, 1 or 2" });
          }
        }

        // Guard: the scored texts must be exactly this reader's own submitted
        // main_point answers (prevents scoring fabricated text).
        const { data: readerRow, error: readerErr } = await supabase
          .from("readers")
          .select("reader_id, immediate_answers_json, scoring")
          .eq("reader_id", reader_id)
          .maybeSingle();
        if (readerErr) throw readerErr;
        if (!readerRow) return jsonResponse(404, { error: "Reader not found" });
        const mainPoint = (readerRow.immediate_answers_json as any)?.main_point;
        const expected = Array.isArray(mainPoint)
          ? mainPoint
              .filter((t: any) => typeof t === "string" && t.trim())
              .map((t: any) => t.trim())
          : [];
        const submitted = normalised.map((s: any) => s.text);
        if (
          expected.length !== submitted.length ||
          expected.some((t: string) => !submitted.includes(t))
        ) {
          return jsonResponse(400, { error: "Scored answers must match the reader's submitted answers" });
        }

        // Final alignment score = highest individual score, computed server-side.
        const finalScore = Math.max(...normalised.map((s: any) => s.score as number));
        // Stored nested under "alignment" so delayed recall results can coexist
        // in the same jsonb column (merged, never overwriting each other).
        const existing = (readerRow as any).scoring ?? {};
        const scoring = { ...existing, alignment: { scores: normalised, final_score: finalScore, scored_at: now } };
        const { error } = await supabase
          .from("readers")
          .update({ scoring, updated_at: now })
          .eq("reader_id", reader_id);
        if (error) throw error;
        return jsonResponse(200, { ok: true, final_score: finalScore });
      }

      case "recall_list": {
        // Delayed recall view: reader's delayed remembered_points vs the writer's
        // original memo. Inclusion: writers completed, readers completed.
        // TEST ids are intentionally NOT filtered here (kept for debugging).
        const [readersRes, memosRes, writersRes] = await Promise.all([
          supabase
            .from("readers")
            .select("reader_id, assigned_memo_id, delayed_answers_json, scoring")
            .eq("status", "completed")
            .order("created_at", { ascending: true }),
          supabase
            .from("memos")
            .select("memo_id, writer_id, final_memo_text")
            .order("submitted_at", { ascending: false }),
          supabase
            .from("writers")
            .select("writer_id")
            .eq("status", "completed"),
        ]);
        if (readersRes.error) throw readersRes.error;
        if (memosRes.error) throw memosRes.error;
        if (writersRes.error) throw writersRes.error;

        const completedWriterIds = new Set((writersRes.data ?? []).map((w) => w.writer_id));
        const memoById = new Map<string, string>();
        for (const m of memosRes.data ?? []) {
          const text = typeof m.final_memo_text === "string" ? m.final_memo_text.trim() : "";
          if (text && completedWriterIds.has(m.writer_id)) {
            memoById.set(m.memo_id, text);
          }
        }

        const pairs: Array<{
          reader_id: string;
          memo_text: string;
          reader_points: string[];
          recall: any;
        }> = [];
        for (const r of readersRes.data ?? []) {
          const memoText = memoById.get(r.assigned_memo_id);
          if (!memoText) continue;
          const points = (r.delayed_answers_json as any)?.remembered_points;
          const readerPoints = Array.isArray(points)
            ? points
                .filter((t: any) => typeof t === "string" && t.trim())
                .map((t: any) => t.trim())
            : [];
          if (readerPoints.length === 0) continue;
          pairs.push({
            reader_id: r.reader_id,
            memo_text: memoText,
            reader_points: readerPoints,
            recall: (r as any).scoring?.recall ?? null,
          });
        }

        return jsonResponse(200, { pairs: shuffle(pairs) });
      }

      case "recall_save": {
        const { reader_id, scores } = payload;
        if (!reader_id || typeof reader_id !== "string") {
          return jsonResponse(400, { error: "reader_id is required" });
        }
        if (!Array.isArray(scores) || scores.length < 1 || scores.length > 3) {
          return jsonResponse(400, { error: "scores must be an array of 1-3 entries" });
        }
        const normalised = scores.map((s: any) => ({
          text: typeof s?.text === "string" ? s.text.trim() : "",
          score: s?.score,
        }));
        for (const s of normalised) {
          if (!s.text) {
            return jsonResponse(400, { error: "Each score entry needs non-empty text" });
          }
          if (s.score !== 0 && s.score !== 1 && s.score !== 2) {
            return jsonResponse(400, { error: "Each score must be 0, 1 or 2" });
          }
        }

        // Guard: the scored points must be exactly this reader's own submitted
        // delayed remembered_points (prevents scoring fabricated text).
        const { data: readerRow, error: readerErr } = await supabase
          .from("readers")
          .select("reader_id, delayed_answers_json, scoring")
          .eq("reader_id", reader_id)
          .maybeSingle();
        if (readerErr) throw readerErr;
        if (!readerRow) return jsonResponse(404, { error: "Reader not found" });
        const points = (readerRow.delayed_answers_json as any)?.remembered_points;
        const expected = Array.isArray(points)
          ? points
              .filter((t: any) => typeof t === "string" && t.trim())
              .map((t: any) => t.trim())
          : [];
        const submitted = normalised.map((s: any) => s.text);
        if (
          expected.length !== submitted.length ||
          expected.some((t: string) => !submitted.includes(t))
        ) {
          return jsonResponse(400, { error: "Scored points must match the reader's submitted delayed answers" });
        }

        // Delayed recall score = sum of all recalled claims, computed server-side.
        const totalScore = normalised.reduce((sum: number, s: any) => sum + (s.score as number), 0);
        const recall = { scores: normalised, total_score: totalScore, scored_at: now };
        // Append under "recall", preserving any existing alignment results.
        const existing = (readerRow as any).scoring ?? {};
        const scoring = { ...existing, recall };
        const { error } = await supabase
          .from("readers")
          .update({ scoring, updated_at: now })
          .eq("reader_id", reader_id);
        if (error) throw error;
        return jsonResponse(200, { ok: true, total_score: totalScore });
      }

      default:
        return jsonResponse(400, { error: `Unknown action: ${action}` });
    }
  } catch (e: any) {
    return jsonResponse(500, { error: e?.message ?? "Admin action failed" });
  }
};
