import type { Handler } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

type Condition = "human_only" | "ai_mediated";

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

  // Idempotent consent claim: only the first call flips consent_given.
  const { error: consentErr } = await supabase
    .from("writers")
    .update({
      consent_given: true,
      consent_timestamp: now,
      consent_version,
      status: "started",
      updated_at: now,
    })
    .eq("writer_id", writer_id)
    .is("consent_given", false);
  if (consentErr) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }

  // Assign condition (50/50) if not yet assigned. Guarded so a concurrent
  // duplicate consent submission can't overwrite an already-assigned value.
  const picked: Condition = Math.random() < 0.5 ? "human_only" : "ai_mediated";
  const { data: assigned, error: assignErr } = await supabase
    .from("writers")
    .update({ condition: picked, updated_at: now })
    .eq("writer_id", writer_id)
    .is("condition", null)
    .select("condition")
    .maybeSingle();
  if (assignErr) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
  }

  let condition: Condition | null = (assigned?.condition as Condition | null) ?? null;
  if (!condition) {
    const { data: existing, error: readErr } = await supabase
      .from("writers")
      .select("condition")
      .eq("writer_id", writer_id)
      .maybeSingle();
    if (readErr || !existing?.condition) {
      return jsonResponse(500, { error: "送信中にエラーが発生しました。" });
    }
    condition = existing.condition as Condition;
  }

  return jsonResponse(200, { ok: true, condition });
};
