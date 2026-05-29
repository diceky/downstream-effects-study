import DiffMatchPatch from "diff-match-patch";
import { apiPost } from "./apiClient";

export type Source = "human" | "ai";

export interface LogEntry {
  timestamp: string;
  session_id: string;
  writer_id: string;
  memo_id: string;
  condition: string;
  surface_key: string;
  location: string;
  target_key: string;
  source: Source;
  added_words: number;
  removed_words: number;
  metadata_json: Record<string, unknown>;
}

interface OnChangeArgs {
  newValue: string;
  source: Source;
  surfaceKey: string;
  location: string;
  targetKey: string;
  metadata?: Record<string, unknown>;
}

interface CreateOpts {
  getIds: () => {
    session_id: string;
    writer_id: string;
    memo_id: string;
    condition: string;
  } | null;
  getCurrentValueForSurface: (surfaceKey: string) => string;
  debounceMs?: number;
}

let segmenter: any = null;
if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
  try {
    segmenter = new (Intl as any).Segmenter(undefined, { granularity: "word" });
  } catch {
    segmenter = null;
  }
}

// Counts code points (Unicode characters), so surrogate pairs count as 1.
function countChars(text: string): number {
  if (!text) return 0;
  let n = 0;
  for (const _ of text) n++;
  return n;
}

function hasCJK(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
}

function countUnits(text: string): number {
  if (!text) return 0;
  if (hasCJK(text)) return countChars(text);
  if (segmenter) {
    let n = 0;
    for (const seg of segmenter.segment(text)) {
      if (seg.isWordLike) n++;
    }
    return n;
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function stripHtml(text: string): string {
  if (!text) return "";
  if (!/[<&]/.test(text)) return text;
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = text;
    return el.textContent ?? "";
  }
  return text.replace(/<[^>]+>/g, "");
}

function computeWordDiff(prev: string, curr: string) {
  const prevText = stripHtml(prev);
  const currText = stripHtml(curr);
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(prevText, currText);
  dmp.diff_cleanupSemantic(diffs);
  let addedWords = 0;
  let removedWords = 0;
  for (const [op, text] of diffs) {
    const count = countUnits(text);
    if (op === 1) addedWords += count;
    else if (op === -1) removedWords += count;
  }
  return { addedWords, removedWords };
}

export function createWordDiffLogger(opts: CreateOpts) {
  const baselineMap: Record<string, string> = {};
  const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  const logBuffer: LogEntry[] = [];
  let enabled = false;

  function enable() {
    enabled = true;
  }
  function disable() {
    enabled = false;
  }

  function resetBaseline(surfaceKey: string, value = "") {
    baselineMap[surfaceKey] = value;
  }

  function clearTimers() {
    for (const k of Object.keys(debounceTimers)) {
      clearTimeout(debounceTimers[k]);
      delete debounceTimers[k];
    }
  }

  function appendLog(args: OnChangeArgs, diff: { addedWords: number; removedWords: number }) {
    const ids = opts.getIds();
    if (!ids) return;
    logBuffer.push({
      timestamp: new Date().toISOString(),
      session_id: ids.session_id,
      writer_id: ids.writer_id,
      memo_id: ids.memo_id,
      condition: ids.condition,
      surface_key: args.surfaceKey,
      location: args.location,
      target_key: args.targetKey,
      source: args.source,
      added_words: diff.addedWords,
      removed_words: diff.removedWords,
      metadata_json: args.metadata ?? {},
    });
  }

  function onChange(args: OnChangeArgs) {
    if (!enabled) return;
    const { newValue, source, surfaceKey } = args;
    const prev = baselineMap[surfaceKey] ?? "";

    if (source === "ai") {
      const diff = computeWordDiff(prev, newValue);
      if (diff.addedWords > 0 || diff.removedWords > 0) {
        appendLog(args, diff);
        baselineMap[surfaceKey] = newValue;
      }
      return;
    }

    if (debounceTimers[surfaceKey]) {
      clearTimeout(debounceTimers[surfaceKey]);
    }
    const delay = opts.debounceMs ?? 800;
    debounceTimers[surfaceKey] = setTimeout(() => {
      if (!enabled) return;
      const latestPrev = baselineMap[surfaceKey] ?? "";
      const latestCurr = opts.getCurrentValueForSurface(surfaceKey);
      const diff = computeWordDiff(latestPrev, latestCurr);
      if (diff.addedWords > 0 || diff.removedWords > 0) {
        appendLog({ ...args, newValue: latestCurr }, diff);
        baselineMap[surfaceKey] = latestCurr;
      }
      delete debounceTimers[surfaceKey];
    }, delay);
  }

  function flush() {
    for (const surfaceKey of Object.keys(debounceTimers)) {
      clearTimeout(debounceTimers[surfaceKey]);
      delete debounceTimers[surfaceKey];
      if (!enabled) continue;
      const latestPrev = baselineMap[surfaceKey] ?? "";
      const latestCurr = opts.getCurrentValueForSurface(surfaceKey);
      const diff = computeWordDiff(latestPrev, latestCurr);
      if (diff.addedWords > 0 || diff.removedWords > 0) {
        appendLog(
          {
            newValue: latestCurr,
            source: "human",
            surfaceKey,
            location: surfaceKey,
            targetKey: surfaceKey,
          },
          diff
        );
        baselineMap[surfaceKey] = latestCurr;
      }
    }
  }

  async function upload() {
    const ids = opts.getIds();
    if (!ids) return;
    if (logBuffer.length === 0) return;
    const payload = {
      writer_id: ids.writer_id,
      memo_id: ids.memo_id,
      session_id: ids.session_id,
      logs: logBuffer.splice(0, logBuffer.length),
    };
    try {
      await apiPost("upload-word-diff-logs", payload);
    } catch (e) {
      console.error("[wordDiffLogger] upload failed", e);
      // Push back on failure so a later submit can retry.
      logBuffer.unshift(...payload.logs);
      throw e;
    }
  }

  return {
    enable,
    disable,
    onChange,
    resetBaseline,
    clearTimers,
    flush,
    upload,
    getBuffer: () => logBuffer.slice(),
    _buffer: logBuffer,
  };
}

export type WordDiffLogger = ReturnType<typeof createWordDiffLogger>;
