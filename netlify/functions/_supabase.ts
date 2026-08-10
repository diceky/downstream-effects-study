import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export const STUDY_MATERIALS_BUCKET = "study-materials";
export const WRITER_PIS_PATH = "02 PIS - Memo Writers - JP.pdf";
export const READER_PIS_PATH = "06 PIS - Downstream Readers - JP.pdf";
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function normaliseEmail(email: unknown): string {
  if (typeof email !== "string") return "";
  return email.trim().toLowerCase();
}

export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function methodNotAllowed() {
  return jsonResponse(405, { error: "Method not allowed" });
}

export function parseBody<T = any>(raw: string | null): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

// Returns a signed URL for a file in the private study-materials bucket, or
// null if no path is provided or signing fails. Legacy absolute URLs are
// passed through unchanged so old DB rows keep working during migration.
export async function signStudyMaterialUrl(
  path: string | null | undefined,
  expiresIn = DEFAULT_SIGNED_URL_EXPIRY_SECONDS
): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await getSupabase()
    .storage.from(STUDY_MATERIALS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
