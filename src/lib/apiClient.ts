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
      `送信中にエラーが発生しました（endpoint: ${endpoint}）。研究担当者までご連絡ください。`
    );
  }

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    throw new Error(data?.error || "送信中にエラーが発生しました。時間をおいて再度お試しください。問題が続く場合は、研究担当者までご連絡ください。");
  }
  return data as T;
}
