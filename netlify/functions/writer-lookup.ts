import type { Handler } from "@netlify/functions";
import {
  getSupabase,
  jsonResponse,
  methodNotAllowed,
  normaliseEmail,
  parseBody,
  signStudyMaterialUrl,
  WRITER_PIS_PATH,
} from "./_supabase";

type Condition = "human_only" | "ai_mediated";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { email } = parseBody<{ email?: string }>(event.body);
  const normalised = normaliseEmail(email);
  if (!normalised) {
    return jsonResponse(400, { error: "メールアドレスを入力してください。" });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("writers")
    .select(
      "writer_id, condition, status, program_overview_pdf_url, reflections_json, task_started_at, task_ended_at, current_memo_id, current_session_id"
    )
    .eq("email", normalised)
    .maybeSingle();

  if (error) {
    return jsonResponse(500, { error: "送信中にエラーが発生しました。時間をおいて再度お試しください。問題が続く場合は、研究担当者（Dice）までご連絡ください。" });
  }
  if (!data) {
    return jsonResponse(404, {
      error:
        "このメールアドレスは、メモ作成タスクの対象者として登録されていません。会社のメールアドレスが正しく入力されているか確認してください。問題が続く場合は、研究担当者（Dice）までご連絡ください。",
    });
  }

  return jsonResponse(200, {
    writer_id: data.writer_id,
    condition: (data.condition as Condition | null) ?? null,
    status: data.status,
    program_overview_pdf_url: await signStudyMaterialUrl(data.program_overview_pdf_url),
    pis_signed_url: await signStudyMaterialUrl(WRITER_PIS_PATH),
    reflections_json: data.reflections_json ?? [],
    task_started_at: data.task_started_at ?? null,
    task_ended_at: data.task_ended_at ?? null,
    current_memo_id: data.current_memo_id ?? null,
    current_session_id: data.current_session_id ?? null,
  });
};
