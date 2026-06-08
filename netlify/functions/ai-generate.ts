import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

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

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

const SYSTEM_INSTRUCTION =
  "あなたは社内のAI研修プログラムの学びをまとめる支援アシスタントです。日本語で簡潔なメモのドラフトを作成してください。";

function resolveAbsoluteUrl(
  maybeUrl: string,
  event: HandlerEvent
): string | null {
  if (!maybeUrl) return null;
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
  const envBase = process.env.URL || process.env.DEPLOY_URL;
  if (envBase) {
    return new URL(maybeUrl, envBase).toString();
  }
  const proto =
    (event.headers["x-forwarded-proto"] as string | undefined) || "http";
  const host = event.headers["host"];
  if (!host) return null;
  return new URL(maybeUrl, `${proto}://${host}`).toString();
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

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

type AiResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

async function callAi(
  prompt: string,
  pdfPart: GeminiPart | null,
  history: HistoryEntry[]
): Promise<AiResult> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.error("[ai-generate] GEMINI_API_KEY is not configured");
    return {
      ok: false,
      status: 503,
      error: "AIサービスが利用できません。研究担当者までご連絡ください。",
    };
  }

  const parts: GeminiPart[] = [];
  if (pdfPart) parts.push(pdfPart);
  parts.push({ text: prompt });

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

  let res: Response;
  try {
    res = await fetch(url, {
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
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    });
  } catch (e) {
    console.error("[ai-generate] network error", e);
    return {
      ok: false,
      status: 502,
      error: "AIへの通信に失敗しました。時間をおいて再度お試しください。",
    };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch (e) {
    console.error("[ai-generate] invalid JSON from AI", e);
    return {
      ok: false,
      status: 502,
      error: "AIからの応答を解釈できませんでした。時間をおいて再度お試しください。",
    };
  }

  if (!res.ok) {
    console.error("[ai-generate] AI returned non-2xx", res.status, data);
    return {
      ok: false,
      status: 502,
      error: "AIドラフトの生成に失敗しました。時間をおいて再度お試しください。",
    };
  }

  const candidate = data?.candidates?.[0];
  const text: string = candidate?.content?.parts
    ?.map((p: any) => p?.text ?? "")
    .join("")
    .trim() ?? "";

  if (!text) {
    const finishReason = candidate?.finishReason;
    console.error(
      "[ai-generate] AI returned empty text",
      { finishReason, promptFeedback: data?.promptFeedback }
    );
    if (finishReason === "SAFETY" || finishReason === "BLOCKLIST" || finishReason === "RECITATION") {
      return {
        ok: false,
        status: 422,
        error:
          "依頼内容がAIの安全フィルターによりブロックされました。表現を変えて再度お試しください。",
      };
    }
    return {
      ok: false,
      status: 502,
      error: "AIから有効な応答が得られませんでした。時間をおいて再度お試しください。",
    };
  }

  return { ok: true, text };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id, memo_id, prompt_text, pdf_attached, history } = parseBody<Body>(
    event.body
  );
  if (!writer_id || !memo_id || !prompt_text) {
    return jsonResponse(400, {
      error: "未回答の必須項目があります。入力内容を確認してください。",
    });
  }

  const supabase = getSupabase();

  let pdfPart: GeminiPart | null = null;
  let pdfFetchFailed = false;
  if (pdf_attached) {
    const { data: writerRow } = await supabase
      .from("writers")
      .select("program_overview_pdf_url")
      .eq("writer_id", writer_id)
      .maybeSingle();
    const rawUrl = writerRow?.program_overview_pdf_url as string | null;
    const absUrl = rawUrl ? resolveAbsoluteUrl(rawUrl, event) : null;
    if (absUrl) {
      const fetched = await fetchPdfAsBase64(absUrl);
      if (fetched) {
        pdfPart = { inlineData: fetched };
      } else {
        pdfFetchFailed = true;
      }
    } else {
      pdfFetchFailed = true;
    }
  }

  const result = await callAi(prompt_text, pdfPart, history ?? []);

  if (!result.ok) {
    return jsonResponse(result.status, { error: result.error });
  }

  await supabase.from("ai_logs").insert({
    writer_id,
    memo_id,
    prompt_text,
    pdf_attached: !!pdf_attached,
    ai_response_text: result.text,
  });

  return jsonResponse(200, {
    ai_response_text: result.text,
    pdf_attached_to_model: !!pdfPart,
    pdf_fetch_failed: pdfFetchFailed,
  });
};
