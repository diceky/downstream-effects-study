import type { Handler, HandlerEvent } from "@netlify/functions";
import { getSupabase, jsonResponse, methodNotAllowed, parseBody } from "./_supabase";

interface Body {
  writer_id?: string;
  memo_id?: string;
  prompt_text?: string;
  pdf_attached?: boolean;
}

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

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

async function callAi(
  prompt: string,
  pdfPart: GeminiPart | null
): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return `【スタブ応答】依頼内容に基づくAIドラフト:\n\n${prompt}\n\n(PDF添付: ${
      pdfPart ? "あり" : "なし"
    })`;
  }

  const parts: GeminiPart[] = [];
  if (pdfPart) parts.push(pdfPart);
  parts.push({ text: prompt });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(geminiKey)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.7 },
      }),
    });
    const data: any = await res.json();
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text ?? "")
      .join("")
      .trim();
    if (text) return text;
    return `【スタブ応答】${prompt}`;
  } catch {
    return `【スタブ応答】${prompt}`;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return methodNotAllowed();
  const { writer_id, memo_id, prompt_text, pdf_attached } = parseBody<Body>(
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

  const ai_response_text = await callAi(prompt_text, pdfPart);

  await supabase.from("ai_logs").insert({
    writer_id,
    memo_id,
    prompt_text,
    pdf_attached: !!pdf_attached,
    ai_response_text,
  });

  return jsonResponse(200, {
    ai_response_text,
    pdf_attached_to_model: !!pdfPart,
    pdf_fetch_failed: pdfFetchFailed,
  });
};
