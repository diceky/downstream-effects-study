import type { Context } from "@netlify/functions";
import {
  getSupabase,
  signStudyMaterialUrl,
} from "./_supabase";

interface HistoryEntry {
  role?: "user" | "model";
  text?: string;
}

interface Body {
  writer_id?: string;
  memo_id?: string;
  prompt_text?: string;
  pdf_attached?: boolean;
  history?: HistoryEntry[];
}

const MAX_HISTORY_MESSAGES = 50;

// Abort the Gemini call before Netlify Functions' 30 s wall-clock limit so we
// can return a clean timeout error instead of being killed.
const SELF_TIMEOUT_MS = 28_000;

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const SYSTEM_INSTRUCTION =
  "あなたは社内のAI研修プログラムの学びをまとめるアシスタントです。日本語での簡潔なメモのドラフト作成を支援してください。";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchPdfAsBase64(
  pdfUrl: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "application/pdf";
    const buf = await res.arrayBuffer();
    const data = Buffer.from(buf).toString("base64");
    return { data, mimeType };
  } catch {
    return null;
  }
}

async function parseBody(req: Request): Promise<Body> {
  try {
    return (await req.json()) as Body;
  } catch {
    return {};
  }
}

function extractTextFromChunk(chunk: any): string {
  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  let out = "";
  for (const p of parts) {
    if (typeof p?.text === "string") out += p.text;
  }
  return out;
}

function extractFinishReason(chunk: any): string | undefined {
  return chunk?.candidates?.[0]?.finishReason;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const { writer_id, memo_id, prompt_text, pdf_attached, history } =
    await parseBody(req);

  if (!writer_id || !memo_id || !prompt_text) {
    return jsonError(
      400,
      "未回答の必須項目があります。入力内容を確認してください。"
    );
  }

  const supabase = getSupabase();

  // Ownership + eligibility guard: the (writer_id, memo_id) pair must match this
  // writer's active session, the writing task must not have ended, and only
  // ai_mediated writers may invoke Gemini.
  const { data: writerRow, error: lookupErr } = await supabase
    .from("writers")
    .select("condition, current_memo_id, task_ended_at, program_overview_pdf_url")
    .eq("writer_id", writer_id)
    .maybeSingle();
  if (lookupErr) {
    return jsonError(500, "送信中にエラーが発生しました。");
  }
  if (!writerRow || writerRow.current_memo_id !== memo_id) {
    return jsonError(403, "セッションが一致しません。");
  }
  if (writerRow.task_ended_at) {
    return jsonError(409, "タスクは既に終了しています。");
  }
  if (writerRow.condition !== "ai_mediated") {
    return jsonError(403, "AIアシスタントはこの条件では利用できません。");
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error("[ai-generate] GEMINI_API_KEY is not configured");
    return jsonError(
      503,
      "AIサービスが利用できません。研究担当者（Dice）までご連絡ください。"
    );
  }

  let pdfPart: GeminiPart | null = null;
  let pdfFetchFailed = false;
  if (pdf_attached) {
    const rawPath = writerRow.program_overview_pdf_url as string | null;
    const signedUrl = await signStudyMaterialUrl(rawPath);
    if (signedUrl) {
      const fetched = await fetchPdfAsBase64(signedUrl);
      if (fetched) {
        pdfPart = { inlineData: fetched };
      } else {
        pdfFetchFailed = true;
      }
    } else {
      pdfFetchFailed = true;
    }
  }

  const parts: GeminiPart[] = [];
  if (pdfPart) parts.push(pdfPart);
  parts.push({ text: prompt_text });

  const sanitizedHistory = (history ?? [])
    .filter(
      (h): h is { role: "user" | "model"; text: string } =>
        !!h &&
        (h.role === "user" || h.role === "model") &&
        typeof h.text === "string" &&
        h.text.length > 0
    )
    .slice(-MAX_HISTORY_MESSAGES);

  const contents = [
    ...sanitizedHistory.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    })),
    { role: "user", parts },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

  // Abort before Netlify's 30 s wall-clock limit (or if the client disconnects)
  // so we can return a clean timeout error instead of being killed.
  const ac = new AbortController();
  const onParentAbort = () => ac.abort();
  req.signal.addEventListener("abort", onParentAbort);
  const timeoutHandle = setTimeout(() => ac.abort(), SELF_TIMEOUT_MS);
  const cleanup = () => {
    clearTimeout(timeoutHandle);
    req.signal.removeEventListener("abort", onParentAbort);
  };

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          topP: 0.95,
          topK: 64,
          candidateCount: 1,
          maxOutputTokens: 2048,
          responseMimeType: "text/plain",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: ac.signal,
    });
  } catch (e) {
    cleanup();
    if (ac.signal.aborted) {
      console.error("[ai-generate] request aborted (timeout)", e);
      return jsonError(
        504,
        "AIの応答がタイムアウトになりました。もう一度お試しください。"
      );
    }
    console.error("[ai-generate] network error", e);
    return jsonError(
      502,
      "AIへの通信に失敗しました。再度お試しください。問題が続く場合は、研究担当者（Dice）までご連絡ください。"
    );
  }

  let bodyJson: any = null;
  try {
    bodyJson = await upstream.json();
  } catch (e) {
    cleanup();
    console.error("[ai-generate] failed to parse upstream JSON", e);
    return jsonError(
      502,
      "AIドラフトの生成に失敗しました。再度お試しください。問題が続く場合は、研究担当者（Dice）までご連絡ください。"
    );
  }
  cleanup();

  if (!upstream.ok) {
    console.error(
      "[ai-generate] upstream non-2xx",
      upstream.status,
      JSON.stringify(bodyJson).slice(0, 500)
    );
    return jsonError(
      502,
      "AIドラフトの生成に失敗しました。再度お試しください。問題が続く場合は、研究担当者（Dice）までご連絡ください。"
    );
  }

  const accumulated = extractTextFromChunk(bodyJson);
  const finishReason = extractFinishReason(bodyJson);

  if (!accumulated) {
    console.error("[ai-generate] AI returned empty text", {
      finishReason,
      body: JSON.stringify(bodyJson).slice(0, 500),
    });
    if (
      finishReason === "SAFETY" ||
      finishReason === "BLOCKLIST" ||
      finishReason === "RECITATION"
    ) {
      return jsonError(
        422,
        "依頼内容がAIの安全フィルターによりブロックされました。表現を変えて再度お試しください。"
      );
    }
    return jsonError(
      502,
      "AIから有効な応答が得られませんでした。再度お試しください。問題が続く場合は、研究担当者（Dice）までご連絡ください。"
    );
  }

  try {
    await supabase.from("ai_logs").insert({
      writer_id,
      memo_id,
      prompt_text,
      pdf_attached: !!pdf_attached,
      ai_response_text: accumulated,
    });
  } catch (e) {
    console.error("[ai-generate] ai_logs insert failed", e);
  }

  return new Response(
    JSON.stringify({
      full_text: accumulated,
      pdf_attached_to_model: !!pdfPart,
      pdf_fetch_failed: pdfFetchFailed,
      finish_reason: finishReason ?? null,
      notice:
        finishReason === "MAX_TOKENS"
          ? "AIの回答内容が長すぎたため中断しました。"
          : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
