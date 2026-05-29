const STORAGE_KEY = "admin_password";

export function getAdminPassword(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminPassword(pw: string | null) {
  try {
    if (pw === null) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, pw);
  } catch {
    /* ignore */
  }
}

export async function adminCall<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
  const pw = getAdminPassword();
  if (!pw) throw new Error("管理者パスワードが未設定です。");
  let res: Response;
  try {
    res = await fetch("/.netlify/functions/admin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": pw,
      },
      body: JSON.stringify({ action, payload }),
    });
  } catch {
    throw new Error("通信エラーが発生しました。");
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (res.status === 401) {
    setAdminPassword(null);
    throw new Error("認証に失敗しました。パスワードを再入力してください。");
  }
  if (!res.ok) {
    throw new Error(data?.error || "操作に失敗しました。");
  }
  return data as T;
}
