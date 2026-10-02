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

// Fires before Netlify Functions' 30 s wall-clock limit so we can emit a
// graceful timeout frame instead of being killed mid-stream.
const SELF_TIMEOUT_MS = 28_000;

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";

const SYSTEM_INSTRUCTION =
  "あなたは社内のAI研修プログラムの学びをまとめる支援アシスタントです。日本語での簡潔なメモのドラフト作成を支援してください。";

const NDJSON_HEADERS: HeadersInit = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

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
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(geminiKey)}`;

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
      signal: req.signal,
    });
  } catch (e) {
    console.error("[ai-generate] network error", e);
    return jsonError(
      502,
      "AIへの通信に失敗しました。時間をおいて再度お試しください。"
    );
  }

  if (!upstream.ok || !upstream.body) {
    try {
      const errText = await upstream.text();
      console.error(
        "[ai-generate] upstream non-2xx",
        upstream.status,
        errText.slice(0, 500)
      );
    } catch {
      console.error("[ai-generate] upstream non-2xx", upstream.status);
    }
    return jsonError(
      502,
      "AIドラフトの生成に失敗しました。時間をおいて再度お試しください。"
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const upstreamBody = upstream.body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };

      let accumulated = "";
      let finishReason: string | undefined;
      let sseBuffer = "";
      let streamErrored = false;
      let timedOut = false;
      let chunksSeen = 0;

      const reader = upstreamBody.getReader();
      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        reader.cancel().catch(() => {
          /* ignore */
        });
      }, SELF_TIMEOUT_MS);
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });
          // Normalize CRLF so `\n\n` frame separator matches regardless of upstream.
          sseBuffer = sseBuffer.replace(/\r\n/g, "\n");

          // SSE frames are separated by blank lines; concatenate multiple
          // `data:` lines within a single frame.
          let sepIdx: number;
          while ((sepIdx = sseBuffer.indexOf("\n\n")) !== -1) {
            const rawFrame = sseBuffer.slice(0, sepIdx);
            sseBuffer = sseBuffer.slice(sepIdx + 2);

            const dataLines: string[] = [];
            for (const line of rawFrame.split("\n")) {
              if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).replace(/^\s/, ""));
              }
            }
            if (dataLines.length === 0) continue;
            const payload = dataLines.join("\n");
            if (!payload || payload === "[DONE]") continue;

            let parsed: any;
            try {
              parsed = JSON.parse(payload);
            } catch (e) {
              console.error("[ai-generate] failed to parse SSE payload", e, payload.slice(0, 200));
              continue;
            }

            chunksSeen += 1;
            const delta = extractTextFromChunk(parsed);
            const fr = extractFinishReason(parsed);
            if (fr) finishReason = fr;

            if (delta) {
              accumulated += delta;
              write({ type: "delta", text: delta });
            } else if (chunksSeen <= 2) {
              console.log(
                "[ai-generate] chunk without text",
                JSON.stringify(parsed).slice(0, 500)
              );
            }
          }
        }
      } catch (e) {
        if (timedOut) {
          console.error("[ai-generate] self-imposed timeout fired", {
            chunksSeen,
            accumulatedLen: accumulated.length,
          });
          streamErrored = true;
          write({
            type: "error",
            error:
              "AIの応答がタイムアウトになりました。もう一度お試しください。",
          });
        } else {
          console.error("[ai-generate] stream read error", e);
          streamErrored = true;
          write({
            type: "error",
            error:
              "AIからの応答が途中で切断されました。時間をおいて再度お試しください。",
          });
        }
      } finally {
        clearTimeout(timeoutHandle);
        try {
          reader.releaseLock();
        } catch {
          /* ignore */
        }
      }

      if (streamErrored) {
        controller.close();
        return;
      }

      if (!accumulated) {
        console.error(
          "[ai-generate] AI returned empty text",
          { finishReason, chunksSeen, bufferTail: sseBuffer.slice(-200) }
        );
        if (
          finishReason === "SAFETY" ||
          finishReason === "BLOCKLIST" ||
          finishReason === "RECITATION"
        ) {
          write({
            type: "error",
            error:
              "依頼内容がAIの安全フィルターによりブロックされました。表現を変えて再度お試しください。",
          });
        } else {
          write({
            type: "error",
            error:
              "AIから有効な応答が得られませんでした。時間をおいて再度お試しください。",
          });
        }
        controller.close();
        return;
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

      write({
        type: "done",
        full_text: accumulated,
        pdf_attached_to_model: !!pdfPart,
        pdf_fetch_failed: pdfFetchFailed,
        finish_reason: finishReason ?? null,
        notice:
          finishReason === "MAX_TOKENS"
            ? "AIの回答内容が長すぎたため中断しました。"
            : null,
      });
      controller.close();
    },
  });

  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
};
