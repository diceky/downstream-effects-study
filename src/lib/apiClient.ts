export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/.netlify/functions/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("通信エラーが発生しました。インターネット接続を確認し、再度お試しください。");
  }

  // Guard against the SPA fallback in `public/_redirects` accidentally serving
  // `index.html` (HTML, status 200) when a function name is mistyped or a
  // function is missing in this environment. Without this, the JSON parse below
  // succeeds with `{}` and we silently treat HTML as a valid success response.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `送信中にエラーが発生しました（endpoint: ${endpoint}）。研究担当者（Dice）までご連絡ください。`
    );
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new Error(data?.error || "送信中にエラーが発生しました。時間をおいて再度お試しください。問題が続く場合は、研究担当者（Dice）までご連絡ください。");
  }
  return data as T;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

export interface StreamResult<TMeta = Record<string, unknown>> {
  full: string;
  meta: TMeta;
}

// POSTs JSON and reads an NDJSON stream of `{type:"delta"|"done"|"error", ...}`
// frames. Resolves on "done"; throws on "error", non-2xx JSON body, or the
// SPA HTML fallback.
export async function apiPostStream<TMeta = Record<string, unknown>>(
  endpoint: string,
  body: unknown,
  handlers: StreamHandlers
): Promise<StreamResult<TMeta>> {
  let res: Response;
  try {
    res = await fetch(`/.netlify/functions/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: handlers.signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    throw new Error("通信エラーが発生しました。インターネット接続を確認し、再度お試しください。");
  }

  const contentType = res.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    // Single-shot error path from the function's validation guards.
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    throw new Error(
      data?.error ||
        "送信中にエラーが発生しました。時間をおいて再度お試しください。問題が続く場合は、研究担当者（Dice）までご連絡ください。"
    );
  }

  if (!contentType.includes("application/x-ndjson")) {
    throw new Error(
      `送信中にエラーが発生しました（endpoint: ${endpoint}）。研究担当者（Dice）までご連絡ください。`
    );
  }

  if (!res.body) {
    throw new Error("AIからの応答を取得できませんでした。時間をおいて再度お試しください。");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let meta: TMeta | null = null;
  let doneSignal = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nlIdx: number;
      while ((nlIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);
        if (!line) continue;

        let frame: any;
        try {
          frame = JSON.parse(line);
        } catch {
          continue;
        }

        if (frame?.type === "delta" && typeof frame.text === "string") {
          full += frame.text;
          handlers.onDelta(frame.text);
        } else if (frame?.type === "done") {
          if (typeof frame.full_text === "string") full = frame.full_text;
          const { type: _t, full_text: _f, ...rest } = frame;
          meta = rest as TMeta;
          doneSignal = true;
        } else if (frame?.type === "error") {
          throw new Error(
            frame?.error ||
              "AIドラフトの生成に失敗しました。時間をおいて再度お試しください。"
          );
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (!doneSignal) {
    throw new Error("AIからの応答が途中で切断されました。時間をおいて再度お試しください。");
  }

  return { full, meta: (meta ?? ({} as TMeta)) };
}
