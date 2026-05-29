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
