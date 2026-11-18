import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { adminCall, getAdminPassword, setAdminPassword } from "../lib/adminClient";
import Icon from "../components/Icon";
import MarkdownRenderer from "../components/MarkdownRenderer";

const PROGRAM_OVERVIEW_PDF_OPTIONS: string[] = [
  "DHC01 - AI_Prototyping Program.pdf",
  "DHC02 - AI_Prototyping Program.pdf",
  "DHC03 - AI_Prototyping Program.pdf",
  "DHC04 - AI_Prototyping Program.pdf",
  "DHC05 - AI_Prototyping Program.pdf",
  "DHC06 - AI_Prototyping Program.pdf",
];

// Activity 5 (答えが欲しい？問いかけが欲しい？) was an irregular one-off; most cohorts have 11 activities.
const DEFAULT_ACTIVITY_TEMPLATE: { activity_number: number; title: string }[] = [
  { activity_number: 0, title: "Gemini/Google AI Studioをひとまず触ってみる" },
  { activity_number: 1, title: "会話に潜む認知バイアスを意識してみよう！" },
  { activity_number: 2, title: "AIのアウトプットを裏取りしてみよう！" },
  { activity_number: 3, title: "AIコールセンターに電話してみよう！" },
  { activity_number: 4, title: "褒めるAIと厳しいAI、どっちがいい？" },
  { activity_number: 5, title: "理想的なクレーム対応を完全再現してみよう！" },
  { activity_number: 6, title: "組織の独自情報を組み込んでみよう！" },
  { activity_number: 7, title: "身の回りの困りごとを解消するアプリを作ってみよう！" },
  { activity_number: 8, title: "自分ならこう読ませる！" },
  { activity_number: 9, title: "理想のAIお問い合わせ窓口をゼロから組んでみよう！" },
  { activity_number: 10, title: "ラスト・フリカエリ" },
];

type Condition = "human_only" | "ai_mediated";

interface WriterRow {
  writer_id: string;
  email: string;
  condition: Condition | null;
  status: string;
  program_overview_pdf_url: string | null;
  reflections_json: ReflectionEntry[] | null;
  created_at: string;
}

interface ReaderRow {
  reader_id: string;
  email: string;
  assigned_memo_id: string;
  assigned_writer_id: string;
  status: string;
  immediate_submitted_at: string | null;
  delayed_submitted_at: string | null;
  created_at: string;
}

interface MemoRow {
  memo_id: string;
  writer_id: string;
  condition: string;
  submitted_at: string | null;
  final_memo_text: string | null;
}

interface ReflectionEntry {
  activity_number: number;
  title: string;
  text: string;
}

interface ScoringScoreEntry {
  text: string;
  score: number;
}

interface ScoringResult {
  scores: ScoringScoreEntry[];
  final_score: number;
  scored_at: string;
}

// Blinded scoring pair: no condition, email, or writer_id is ever included.
interface ScoringPair {
  reader_id: string;
  writer_intent: string;
  reader_intents: string[];
  scoring: ScoringResult | null;
}

// Alignment scoring rubric (0-2), applied per reader-assumed-intent.
const SCORING_RUBRIC: { score: number; label: string; desc: string }[] = [
  {
    score: 0,
    label: "No match / incorrect",
    desc: "The reader's key takeaways do not correspond to, are too vague to map, or contradicts the writer's intended message.",
  },
  {
    score: 1,
    label: "Partial / vague match",
    desc: "The reader's key takeaways are related to the writer's intended message, but is incomplete, overly general, distorted, or missing the key detail.",
  },
  {
    score: 2,
    label: "Clear match",
    desc: "The reader's key takeaways accurately capture the gist of the writer's intended message, even if the verbatim wording differs from the original memo.",
  },
];

interface RecallResult {
  scores: ScoringScoreEntry[];
  total_score: number;
  scored_at: string;
}

// Delayed recall pair: the writer's original memo vs the reader's recalled points.
interface RecallPair {
  reader_id: string;
  memo_text: string;
  reader_points: string[];
  recall: RecallResult | null;
}

// Delayed recall rubric (0-2), applied per recalled point.
const RECALL_RUBRIC: { score: number; label: string; desc: string }[] = [
  {
    score: 0,
    label: "No match / incorrect",
    desc: "The recalled statement does not correspond to any identifiable statement in the memo, is too vague to map to a specific statement, or contradicts the memo.",
  },
  {
    score: 1,
    label: "Partial / vague match",
    desc: "The recalled statement is related to a memo point, but is incomplete, overly general, distorted, or missing the key detail.",
  },
  {
    score: 2,
    label: "Clear match",
    desc: "The recalled statement accurately captures the gist of a specific memo point, even if the verbatim wording differs from the original memo.",
  },
];

interface WriterDraft {
  writer_id: string;
  email: string;
  program_overview_pdf_url: string;
  reflections: { activity_number: number; title: string; text: string }[];
}

interface ReaderDraft {
  reader_id: string;
  email: string;
  writer_id: string;
  assigned_memo_id: string;
}

function emptyReflections() {
  return DEFAULT_ACTIVITY_TEMPLATE.map((entry) => ({
    activity_number: entry.activity_number,
    title: entry.title,
    text: "",
  }));
}

function emptyWriterDraft(): WriterDraft {
  return {
    writer_id: "",
    email: "",
    program_overview_pdf_url: "",
    reflections: emptyReflections(),
  };
}

function emptyReaderDraft(): ReaderDraft {
  return {
    reader_id: "",
    email: "",
    writer_id: "",
    assigned_memo_id: "",
  };
}

function memoFirstLine(text: string | null): string {
  if (!text) return "(本文なし)";
  const line =
    text
      .split("\n")
      .map((s) => s.trim())
      .find((s) => s.length > 0) ?? "";
  if (!line) return "(本文なし)";
  return line.length > 60 ? line.slice(0, 60) + "…" : line;
}

function reflectionsToDraft(
  json: ReflectionEntry[] | null
): { activity_number: number; title: string; text: string }[] {
  if (!Array.isArray(json)) return [];
  return json.map((entry) => ({
    activity_number: entry.activity_number,
    title: entry.title ?? "",
    text: entry.text ?? "",
  }));
}

function reflectionsFromDraft(
  slots: { activity_number: number; title: string; text: string }[]
): ReflectionEntry[] {
  const out: ReflectionEntry[] = [];
  slots.forEach((slot) => {
    if (slot.title.trim() || slot.text.trim()) {
      out.push({
        activity_number: slot.activity_number,
        title: slot.title.trim(),
        text: slot.text.trim(),
      });
    }
  });
  return out;
}

const sectionStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  padding: 20,
  borderRadius: 10,
  marginTop: 24,
  background: "var(--color-bg)",
  boxShadow: "var(--shadow-sm)",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginTop: 12,
  fontSize: 14,
};

const cellStyle: React.CSSProperties = {
  verticalAlign: "top",
};

export default function AdminPage() {
  const [authed, setAuthed] = useState(() => !!getAdminPassword());
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  const [writers, setWriters] = useState<WriterRow[]>([]);
  const [readers, setReaders] = useState<ReaderRow[]>([]);
  const [memos, setMemos] = useState<MemoRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [writerDraft, setWriterDraft] = useState<WriterDraft>(emptyWriterDraft());
  const [editingWriterId, setEditingWriterId] = useState<string | null>(null);

  const [readerDraft, setReaderDraft] = useState<ReaderDraft>(emptyReaderDraft());
  const [editingReaderId, setEditingReaderId] = useState<string | null>(null);

  type Tab = "writers" | "readers" | "memos" | "scoring" | "recall";
  const [tab, setTab] = useState<Tab>("writers");
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());
  const [reflectionsPreview, setReflectionsPreview] = useState(false);

  // Scoring tab state. Pairs arrive server-shuffled and blinded; selections are
  // keyed by reader_id as (score|null) arrays aligned with reader_intents.
  const [scoringPairs, setScoringPairs] = useState<ScoringPair[]>([]);
  const [scoringLoaded, setScoringLoaded] = useState(false);
  const [scoringLoading, setScoringLoading] = useState(false);
  const [scoringError, setScoringError] = useState<string | null>(null);
  const [scoreSelections, setScoreSelections] = useState<Record<string, (number | null)[]>>({});
  const [savingPairId, setSavingPairId] = useState<string | null>(null);
  const [savedPairIds, setSavedPairIds] = useState<Set<string>>(new Set());

  // Recall tab state. Pairs arrive server-shuffled; selections are keyed by
  // reader_id as (score|null) arrays aligned with reader_points.
  const [recallPairs, setRecallPairs] = useState<RecallPair[]>([]);
  const [recallLoaded, setRecallLoaded] = useState(false);
  const [recallLoading, setRecallLoading] = useState(false);
  const [recallError, setRecallError] = useState<string | null>(null);
  const [recallSelections, setRecallSelections] = useState<Record<string, (number | null)[]>>({});
  const [savingRecallId, setSavingRecallId] = useState<string | null>(null);
  const [savedRecallIds, setSavedRecallIds] = useState<Set<string>>(new Set());

  const toggleMemoExpanded = (memoId: string) => {
    setExpandedMemos((prev) => {
      const next = new Set(prev);
      if (next.has(memoId)) next.delete(memoId);
      else next.add(memoId);
      return next;
    });
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminCall<{
        writers: WriterRow[];
        readers: ReaderRow[];
        memos: MemoRow[];
      }>("list");
      setWriters(data.writers);
      setReaders(data.readers);
      setMemos(data.memos);
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました。");
      if (e?.message?.includes("認証")) setAuthed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) refresh();
  }, [authed, refresh]);

  // Load blinded, server-shuffled scoring pairs (lazily, on first tab visit;
  // "Shuffle" refetches for a new order and picks up any saved scores).
  const loadScoring = useCallback(async () => {
    setScoringLoading(true);
    setScoringError(null);
    try {
      const data = await adminCall<{ pairs: ScoringPair[] }>("scoring_list");
      const pairs = data.pairs ?? [];
      setScoringPairs(pairs);
      // Prefill from any previously saved scoring; otherwise leave all unset.
      setScoreSelections(
        Object.fromEntries(
          pairs.map((p) => [
            p.reader_id,
            p.reader_intents.map((text) => {
              const saved = p.scoring?.scores?.find((s) => s.text === text);
              return saved ? saved.score : null;
            }),
          ])
        )
      );
      setSavedPairIds(new Set(pairs.filter((p) => p.scoring).map((p) => p.reader_id)));
      setScoringLoaded(true);
    } catch (e: any) {
      setScoringError(e?.message ?? "読み込みに失敗しました。");
      if (e?.message?.includes("認証")) setAuthed(false);
    } finally {
      setScoringLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && tab === "scoring" && !scoringLoaded && !scoringLoading) {
      loadScoring();
    }
  }, [authed, tab, scoringLoaded, scoringLoading, loadScoring]);

  function setPairScore(readerId: string, index: number, score: number) {
    setScoreSelections((prev) => {
      const next = [...(prev[readerId] ?? [])];
      next[index] = score;
      return { ...prev, [readerId]: next };
    });
    // Any change after saving marks the pair dirty until re-saved.
    setSavedPairIds((prev) => {
      if (!prev.has(readerId)) return prev;
      const next = new Set(prev);
      next.delete(readerId);
      return next;
    });
  }

  async function saveScoringPair(pair: ScoringPair) {
    const selections = scoreSelections[pair.reader_id] ?? [];
    if (selections.some((s) => s === null)) return;
    setSavingPairId(pair.reader_id);
    setScoringError(null);
    try {
      await adminCall("scoring_save", {
        reader_id: pair.reader_id,
        scores: pair.reader_intents.map((text, i) => ({ text, score: selections[i] })),
      });
      setSavedPairIds((prev) => new Set(prev).add(pair.reader_id));
    } catch (e: any) {
      setScoringError(e?.message ?? "保存に失敗しました。");
    } finally {
      setSavingPairId(null);
    }
  }

  const loadRecall = useCallback(async () => {
    setRecallLoading(true);
    setRecallError(null);
    try {
      const data = await adminCall<{ pairs: RecallPair[] }>("recall_list");
      const pairs = data.pairs ?? [];
      setRecallPairs(pairs);
      // Prefill from any previously saved recall scoring; otherwise leave all unset.
      setRecallSelections(
        Object.fromEntries(
          pairs.map((p) => [
            p.reader_id,
            p.reader_points.map((text) => {
              const saved = p.recall?.scores?.find((s) => s.text === text);
              return saved ? saved.score : null;
            }),
          ])
        )
      );
      setSavedRecallIds(new Set(pairs.filter((p) => p.recall).map((p) => p.reader_id)));
      setRecallLoaded(true);
    } catch (e: any) {
      setRecallError(e?.message ?? "読み込みに失敗しました。");
      if (e?.message?.includes("認証")) setAuthed(false);
    } finally {
      setRecallLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && tab === "recall" && !recallLoaded && !recallLoading) {
      loadRecall();
    }
  }, [authed, tab, recallLoaded, recallLoading, loadRecall]);

  function setRecallPointScore(readerId: string, index: number, score: number) {
    setRecallSelections((prev) => {
      const next = [...(prev[readerId] ?? [])];
      next[index] = score;
      return { ...prev, [readerId]: next };
    });
    // Any change after saving marks the pair dirty until re-saved.
    setSavedRecallIds((prev) => {
      if (!prev.has(readerId)) return prev;
      const next = new Set(prev);
      next.delete(readerId);
      return next;
    });
  }

  async function saveRecallPair(pair: RecallPair) {
    const selections = recallSelections[pair.reader_id] ?? [];
    if (selections.some((s) => s === null)) return;
    setSavingRecallId(pair.reader_id);
    setRecallError(null);
    try {
      await adminCall("recall_save", {
        reader_id: pair.reader_id,
        scores: pair.reader_points.map((text, i) => ({ text, score: selections[i] })),
      });
      setSavedRecallIds((prev) => new Set(prev).add(pair.reader_id));
    } catch (e: any) {
      setRecallError(e?.message ?? "保存に失敗しました。");
    } finally {
      setSavingRecallId(null);
    }
  }

  const writerIdsWithMemos = useMemo(
    () =>
      Array.from(new Set(memos.map((m) => m.writer_id))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [memos]
  );

  const filteredMemoOptions = useMemo(
    () =>
      memos
        .filter((m) => m.writer_id === readerDraft.writer_id)
        .map((m) => ({
          value: m.memo_id,
          label: `${m.memo_id} — ${memoFirstLine(m.final_memo_text)}`,
        })),
    [memos, readerDraft.writer_id]
  );

  const sortedWriters = useMemo(
    () => [...writers].sort((a, b) => a.writer_id.localeCompare(b.writer_id)),
    [writers]
  );

  const sortedReaders = useMemo(
    () => [...readers].sort((a, b) => a.reader_id.localeCompare(b.reader_id)),
    [readers]
  );
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (!pwInput) {
      setPwError("パスワードを入力してください。");
      return;
    }
    setAdminPassword(pwInput);
    setPwInput("");
    setAuthed(true);
  }

  function handleLogout() {
    setAdminPassword(null);
    setAuthed(false);
    setWriters([]);
    setReaders([]);
    setMemos([]);
    setScoringPairs([]);
    setScoringLoaded(false);
    setScoringError(null);
    setScoreSelections({});
    setSavedPairIds(new Set());
    setRecallPairs([]);
    setRecallLoaded(false);
    setRecallError(null);
    setRecallSelections({});
    setSavedRecallIds(new Set());
  }

  function startEditWriter(w: WriterRow) {
    setEditingWriterId(w.writer_id);
    setWriterDraft({
      writer_id: w.writer_id,
      email: w.email,
      program_overview_pdf_url: w.program_overview_pdf_url ?? "",
      reflections: reflectionsToDraft(w.reflections_json),
    });
    setStatus(null);
    setError(null);
  }

  function cancelWriterEdit() {
    setEditingWriterId(null);
    setWriterDraft(emptyWriterDraft());
  }

  async function saveWriter(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      await adminCall("upsert_writer", {
        writer_id: writerDraft.writer_id.trim(),
        email: writerDraft.email.trim(),
        program_overview_pdf_url: writerDraft.program_overview_pdf_url.trim() || null,
        reflections_json: reflectionsFromDraft(writerDraft.reflections),
      });
      setStatus(editingWriterId ? "Writerを更新しました。" : "Writerを追加しました。");
      cancelWriterEdit();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function deleteWriter(writer_id: string) {
    if (!confirm(`Writer ${writer_id} を削除しますか？`)) return;
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      await adminCall("delete_writer", { writer_id });
      setStatus(`Writer ${writer_id} を削除しました。`);
      if (editingWriterId === writer_id) cancelWriterEdit();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "削除に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  function startEditReader(r: ReaderRow) {
    setEditingReaderId(r.reader_id);
    setReaderDraft({
      reader_id: r.reader_id,
      email: r.email,
      writer_id: r.assigned_writer_id,
      assigned_memo_id: r.assigned_memo_id,
    });
    setStatus(null);
    setError(null);
  }

  function cancelReaderEdit() {
    setEditingReaderId(null);
    setReaderDraft(emptyReaderDraft());
  }

  async function saveReader(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      const memoId = readerDraft.assigned_memo_id.trim();
      const memo = memos.find((m) => m.memo_id === memoId);
      if (!memo) {
        throw new Error("指定されたmemo_idが見つかりません。");
      }
      await adminCall("upsert_reader", {
        reader_id: readerDraft.reader_id.trim(),
        email: readerDraft.email.trim(),
        assigned_memo_id: memoId,
        assigned_writer_id: memo.writer_id,
      });
      setStatus(editingReaderId ? "Readerを更新しました。" : "Readerを追加しました。");
      cancelReaderEdit();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function deleteReader(reader_id: string) {
    if (!confirm(`Reader ${reader_id} を削除しますか？`)) return;
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      await adminCall("delete_reader", { reader_id });
      setStatus(`Reader ${reader_id} を削除しました。`);
      if (editingReaderId === reader_id) cancelReaderEdit();
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "削除に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  if (!authed) {
    return (
      <div style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
        <h1>管理画面</h1>
        <form onSubmit={handleLogin}>
          <label>
            管理者パスワード
            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
              autoFocus
            />
          </label>
          {pwError && <p className="danger">{pwError}</p>}
          <button type="submit" style={{ marginTop: 16 }}>
            <Icon name="login" /> ログイン
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>管理画面</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={refresh} disabled={loading}>
            <Icon name="refresh" /> 再読み込み
          </button>
          <button type="button" onClick={handleLogout}>
            <Icon name="logout" /> ログアウト
          </button>
        </div>
      </div>

      {error && <p className="danger">{error}</p>}
      {status && <p className="success">{status}</p>}

      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          marginTop: 16,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {([
          { id: "writers", label: "Writers", icon: "edit_note" },
          { id: "readers", label: "Readers", icon: "menu_book" },
          { id: "memos", label: "Memos", icon: "description" },
          { id: "scoring", label: "Writer-Reader Alignment Score", icon: "score" },
          { id: "recall", label: "Recall Score", icon: "memory" },
        ] as { id: Tab; label: string; icon: string }[]).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--color-accent)"
                  : "2px solid transparent",
                borderRadius: 0,
                padding: "10px 16px",
                color: active ? "var(--color-text)" : "var(--color-text-muted)",
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon name={t.icon} size={18} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* WRITERS */}
      {tab === "writers" && (
      <section style={sectionStyle}>
        <h2>Writers</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>writer_id</th>
              <th style={cellStyle}>email</th>
              <th style={cellStyle}>condition</th>
              <th style={cellStyle}>status</th>
              <th style={cellStyle}>PDF URL</th>
              <th style={cellStyle}>reflections</th>
              <th style={cellStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedWriters.map((w) => (
              <tr key={w.writer_id}>
                <td style={cellStyle}>{w.writer_id}</td>
                <td style={cellStyle}>{w.email}</td>
                <td style={cellStyle}>{w.condition ?? "未割当"}</td>
                <td style={cellStyle}>{w.status}</td>
                <td style={cellStyle} title={w.program_overview_pdf_url ?? ""}>
                  {w.program_overview_pdf_url
                    ? w.program_overview_pdf_url.length > 30
                      ? w.program_overview_pdf_url.slice(0, 30) + "…"
                      : w.program_overview_pdf_url
                    : "—"}
                </td>
                <td style={cellStyle}>
                  {Array.isArray(w.reflections_json) ? w.reflections_json.length : 0} 件
                </td>
                <td style={cellStyle}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className="icon-btn" onClick={() => startEditWriter(w)} title="編集">
                      <Icon name="edit" />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => deleteWriter(w.writer_id)} title="削除">
                      <Icon name="delete" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {writers.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={7}>
                  Writerは登録されていません。
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h3 style={{ marginTop: 24 }}>
          {editingWriterId ? `Writerを編集: ${editingWriterId}` : "Writerを追加"}
        </h3>
        <form onSubmit={saveWriter}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              writer_id
              <input
                type="text"
                value={writerDraft.writer_id}
                onChange={(e) =>
                  setWriterDraft({ ...writerDraft, writer_id: e.target.value })
                }
                disabled={!!editingWriterId}
                required
                style={{ width: "100%", padding: 6 }}
              />
            </label>
            <label>
              email
              <input
                type="email"
                value={writerDraft.email}
                onChange={(e) => setWriterDraft({ ...writerDraft, email: e.target.value })}
                required
                style={{ width: "100%", padding: 6 }}
              />
            </label>
            <label>
              program_overview_pdf_url
              <select
                value={writerDraft.program_overview_pdf_url}
                onChange={(e) =>
                  setWriterDraft({
                    ...writerDraft,
                    program_overview_pdf_url: e.target.value,
                  })
                }
                style={{ width: "100%", padding: 6 }}
              >
                <option value="">（未選択）</option>
                {PROGRAM_OVERVIEW_PDF_OPTIONS.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <h4 style={{ margin: 0 }}>振り返り ({writerDraft.reflections.length} 件)</h4>
            <button
              type="button"
              onClick={() => setReflectionsPreview((v) => !v)}
              title={reflectionsPreview ? "編集モードに切り替え" : "プレビューに切り替え"}
            >
              <Icon name={reflectionsPreview ? "edit" : "visibility"} />
              {reflectionsPreview ? "編集" : "プレビュー"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#555" }}>
            空欄の枠は保存時に無視されます。タイトルか本文のどちらかが入力されている枠のみ保存されます。
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {writerDraft.reflections.map((r, i) => (
              <div
                key={i}
                style={{ border: "1px solid #eee", padding: 8, borderRadius: 4 }}
              >
                <div style={{ fontWeight: "bold", marginBottom: 4 }}>Activity {r.activity_number}</div>
                {reflectionsPreview ? (
                  <>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {r.title || <span style={{ color: "#9ca3af" }}>（タイトル未入力）</span>}
                    </div>
                    {r.text ? (
                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e5e7eb",
                          borderRadius: 6,
                          padding: 12,
                        }}
                      >
                        <MarkdownRenderer source={r.text} slackFlavored />
                      </div>
                    ) : (
                      <div style={{ color: "#9ca3af", fontSize: 13 }}>（本文未入力）</div>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="タイトル"
                      value={r.title}
                      onChange={(e) => {
                        const next = [...writerDraft.reflections];
                        next[i] = { ...next[i], title: e.target.value };
                        setWriterDraft({ ...writerDraft, reflections: next });
                      }}
                      style={{ width: "100%", padding: 6, marginBottom: 4 }}
                    />
                    <textarea
                      placeholder="振り返り本文"
                      value={r.text}
                      onChange={(e) => {
                        const next = [...writerDraft.reflections];
                        next[i] = { ...next[i], text: e.target.value };
                        setWriterDraft({ ...writerDraft, reflections: next });
                      }}
                      style={{ width: "100%", padding: 6, minHeight: 60 }}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading}>
              <Icon name={editingWriterId ? "save" : "add"} />
              {editingWriterId ? "更新する" : "追加する"}
            </button>
            {editingWriterId && (
              <button type="button" onClick={cancelWriterEdit}>
                <Icon name="close" /> キャンセル
              </button>
            )}
          </div>
        </form>
      </section>
      )}

      {/* READERS */}
      {tab === "readers" && (
      <section style={sectionStyle}>
        <h2>Readers</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>reader_id</th>
              <th style={cellStyle}>email</th>
              <th style={cellStyle}>assigned_memo_id</th>
              <th style={cellStyle}>assigned_writer_id</th>
              <th style={cellStyle}>status</th>
              <th style={cellStyle}>immediate</th>
              <th style={cellStyle}>delayed</th>
              <th style={cellStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedReaders.map((r) => (
              <tr key={r.reader_id}>
                <td style={cellStyle}>{r.reader_id}</td>
                <td style={cellStyle}>{r.email}</td>
                <td style={cellStyle}>{r.assigned_memo_id}</td>
                <td style={cellStyle}>{r.assigned_writer_id}</td>
                <td style={cellStyle}>{r.status}</td>
                <td style={cellStyle}>
                  {r.immediate_submitted_at ? (
                    <Icon name="check_circle" style={{ color: "var(--color-success)" }} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={cellStyle}>
                  {r.delayed_submitted_at ? (
                    <Icon name="check_circle" style={{ color: "var(--color-success)" }} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={cellStyle}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className="icon-btn" onClick={() => startEditReader(r)} title="編集">
                      <Icon name="edit" />
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => deleteReader(r.reader_id)} title="削除">
                      <Icon name="delete" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {readers.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={8}>
                  Readerは登録されていません。
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <h3 style={{ marginTop: 24 }}>
          {editingReaderId ? `Readerを編集: ${editingReaderId}` : "Readerを追加"}
        </h3>
        <form onSubmit={saveReader}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              reader_id
              <input
                type="text"
                value={readerDraft.reader_id}
                onChange={(e) =>
                  setReaderDraft({ ...readerDraft, reader_id: e.target.value })
                }
                disabled={!!editingReaderId}
                required
                style={{ width: "100%", padding: 6 }}
              />
            </label>
            <label>
              email
              <input
                type="email"
                value={readerDraft.email}
                onChange={(e) => setReaderDraft({ ...readerDraft, email: e.target.value })}
                required
                style={{ width: "100%", padding: 6 }}
              />
            </label>
            <label>
              assigned_memo_writer
              <select
                value={readerDraft.writer_id}
                onChange={(e) =>
                  setReaderDraft({
                    ...readerDraft,
                    writer_id: e.target.value,
                    assigned_memo_id: "",
                  })
                }
                required
                style={{ width: "100%", padding: 6 }}
              >
                <option value="">（未選択）</option>
                {writerIdsWithMemos.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              assigned_memo_id
              <select
                value={readerDraft.assigned_memo_id}
                onChange={(e) =>
                  setReaderDraft({ ...readerDraft, assigned_memo_id: e.target.value })
                }
                required
                disabled={!readerDraft.writer_id}
                style={{ width: "100%", padding: 6 }}
              >
                <option value="">（未選択）</option>
                {filteredMemoOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button type="submit" disabled={loading}>
              <Icon name={editingReaderId ? "save" : "add"} />
              {editingReaderId ? "更新する" : "追加する"}
            </button>
            {editingReaderId && (
              <button type="button" onClick={cancelReaderEdit}>
                <Icon name="close" /> キャンセル
              </button>
            )}
          </div>
        </form>
      </section>
      )}

      {/* MEMOS (read-only) */}
      {tab === "memos" && (
      <section style={sectionStyle}>
        <h2>Memos (read-only)</h2>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>memo_id</th>
              <th style={cellStyle}>writer_id</th>
              <th style={cellStyle}>condition</th>
              <th style={cellStyle}>submitted_at</th>
              <th style={cellStyle}>content</th>
            </tr>
          </thead>
          <tbody>
            {memos.map((m) => {
              const isOpen = expandedMemos.has(m.memo_id);
              return (
                <Fragment key={m.memo_id}>
                  <tr>
                    <td style={cellStyle}>{m.memo_id}</td>
                    <td style={cellStyle}>{m.writer_id}</td>
                    <td style={cellStyle}>{m.condition}</td>
                    <td style={cellStyle}>{m.submitted_at ?? "—"}</td>
                    <td style={cellStyle}>
                      {m.final_memo_text ? (
                        <button
                          type="button"
                          onClick={() => toggleMemoExpanded(m.memo_id)}
                          aria-label={isOpen ? "隠す" : "表示"}
                          aria-expanded={isOpen}
                          style={{
                            padding: 2,
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            color: "var(--color-text)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon name={isOpen ? "arrow_drop_down" : "arrow_right"} size={24} />
                        </button>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && m.final_memo_text && (
                    <tr>
                      <td style={cellStyle} colSpan={5}>
                        <div
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #e5e7eb",
                            borderRadius: 6,
                            padding: 16,
                            maxHeight: 480,
                            overflowY: "auto",
                          }}
                        >
                          <MarkdownRenderer source={m.final_memo_text} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {memos.length === 0 && (
              <tr>
                <td style={cellStyle} colSpan={5}>
                  Memoはまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      )}

      {/* WRITER-READER ALIGNMENT SCORE (blinded, randomised order) */}
      {tab === "scoring" && (
      <section style={sectionStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h2 style={{ margin: 0 }}>Writer-Reader Alignment Score</h2>
          <button type="button" onClick={loadScoring} disabled={scoringLoading}>
            <Icon name="shuffle" />
            {scoringLoaded ? "Shuffle" : "再読み込み"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
          Pairs are presented in randomised order with no condition information shown.
          Score each of the reader's assumed intents (0–2); the highest score across the
          reader's answers is stored as the final intent alignment score.
        </p>

        {/* Rubric legend */}
        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            background: "#f8fafc",
          }}
        >
          {SCORING_RUBRIC.map((r) => (
            <div key={r.score} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, minWidth: 20 }}>{r.score}</span>
              <span style={{ fontWeight: 600, minWidth: 200 }}>{r.label}</span>
              <span style={{ fontSize: 13 }}>{r.desc}</span>
            </div>
          ))}
        </div>

        {scoringError && (
          <p className="danger" style={{ marginTop: 16 }}>
            {scoringError}
          </p>
        )}

        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          {scoringPairs.map((pair, idx) => {
            const selections = scoreSelections[pair.reader_id] ?? pair.reader_intents.map(() => null);
            const allAssigned = selections.every((s) => s !== null);
            const finalScore = allAssigned ? Math.max(...selections) : null;
            const isSaved = savedPairIds.has(pair.reader_id);
            const isSaving = savingPairId === pair.reader_id;
            return (
              <div
                key={pair.reader_id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: 16,
                  background: "var(--color-bg)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Pair {idx + 1}</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {finalScore !== null && (
                      <span style={{ fontSize: 13 }}>
                        Final: <b>{finalScore}</b>
                      </span>
                    )}
                    {isSaved && (
                      <span style={{ color: "var(--color-success)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="check_circle" size={18} /> Saved
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => saveScoringPair(pair)}
                      disabled={!allAssigned || isSaving}
                    >
                      <Icon name="save" /> {isSaved ? "Re-save" : "Save"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                    gap: 16,
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>
                      Writer's intent <span className="muted">(key_takeaway)</span>
                    </h3>
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 6,
                        padding: 12,
                        whiteSpace: "pre-wrap",
                        fontSize: 14,
                        background: "#f8fafc",
                      }}
                    >
                      {pair.writer_intent}
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>
                      Reader's assumed intents <span className="muted">(main_point)</span>
                    </h3>
                    <div style={{ display: "grid", gap: 10 }}>
                      {pair.reader_intents.map((intent, i) => (
                        <div
                          key={i}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 6,
                            padding: 10,
                            background: "#f8fafc",
                          }}
                        >
                          <div style={{ fontSize: 14, marginBottom: 10, whiteSpace: "pre-wrap" }}>
                            <span style={{ fontWeight: 600, marginRight: 8 }}>Answer {i + 1}</span>
                            {intent}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {SCORING_RUBRIC.map((r) => (
                              <label
                                key={r.score}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  border:
                                    selections[i] === r.score
                                      ? "1px solid var(--color-accent)"
                                      : "1px solid #e5e7eb",
                                  borderRadius: 6,
                                  padding: "4px 10px",
                                  fontSize: 13,
                                  cursor: "pointer",
                                  background:
                                    selections[i] === r.score ? "var(--color-bg)" : "transparent",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`score-${pair.reader_id}-${i}`}
                                  value={r.score}
                                  checked={selections[i] === r.score}
                                  onChange={() => setPairScore(pair.reader_id, i, r.score)}
                                />
                                {r.score} — {r.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {scoringLoaded && scoringPairs.length === 0 && (
            <p style={{ color: "#555" }}>
              スコアリング可能なペアはまだありません。
              (Readers need to have submitted main_point answers and their writers a key_takeaway.)
            </p>
          )}
        </div>
      </section>
      )}

      {/* DELAYED RECALL SCORE (randomised order) */}
      {tab === "recall" && (
      <section style={sectionStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <h2 style={{ margin: 0 }}>Recall Score</h2>
          <button type="button" onClick={loadRecall} disabled={recallLoading}>
            <Icon name="shuffle" />
            {recallLoaded ? "Shuffle" : "再読み込み"}
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
          Pairs are presented in randomised order. Score each of the reader's recalled points
          (0–2) against the writer's original memo; the total score of all recalled claims is
          stored as the reader's delayed recall score.
        </p>

        {/* Rubric legend */}
        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 16,
            background: "#f8fafc",
          }}
        >
          {RECALL_RUBRIC.map((r) => (
            <div key={r.score} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span style={{ fontWeight: 700, minWidth: 20 }}>{r.score}</span>
              <span style={{ fontWeight: 600, minWidth: 200 }}>{r.label}</span>
              <span style={{ fontSize: 13 }}>{r.desc}</span>
            </div>
          ))}
        </div>

        {recallError && (
          <p className="danger" style={{ marginTop: 16 }}>
            {recallError}
          </p>
        )}

        <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
          {recallPairs.map((pair, idx) => {
            const selections = recallSelections[pair.reader_id] ?? pair.reader_points.map(() => null);
            const allAssigned = selections.every((s) => s !== null);
            const totalScore = allAssigned
              ? selections.reduce((sum: number, s) => sum + (s as number), 0)
              : null;
            const isSaved = savedRecallIds.has(pair.reader_id);
            const isSaving = savingRecallId === pair.reader_id;
            return (
              <div
                key={pair.reader_id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  padding: 16,
                  background: "var(--color-bg)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Pair {idx + 1}</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    {totalScore !== null && (
                      <span style={{ fontSize: 13 }}>
                        Total: <b>{totalScore}</b>
                      </span>
                    )}
                    {isSaved && (
                      <span style={{ color: "var(--color-success)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="check_circle" size={18} /> Saved
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => saveRecallPair(pair)}
                      disabled={!allAssigned || isSaving}
                    >
                      <Icon name="save" /> {isSaved ? "Re-save" : "Save"}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)",
                    gap: 16,
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>
                      Writer's original memo <span className="muted">(final_memo_text)</span>
                    </h3>
                    <div
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 6,
                        padding: 12,
                        whiteSpace: "pre-wrap",
                        fontSize: 14,
                        background: "#f8fafc",
                        maxHeight: 480,
                        overflowY: "auto",
                      }}
                    >
                      {pair.memo_text}
                    </div>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>
                      Reader's recalled points <span className="muted">(remembered_points)</span>
                    </h3>
                    <div style={{ display: "grid", gap: 10 }}>
                      {pair.reader_points.map((point, i) => (
                        <div
                          key={i}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 6,
                            padding: 10,
                            background: "#f8fafc",
                          }}
                        >
                          <div style={{ fontSize: 14, marginBottom: 10, whiteSpace: "pre-wrap" }}>
                            <span style={{ fontWeight: 600, marginRight: 8 }}>Point {i + 1}</span>
                            {point}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {RECALL_RUBRIC.map((r) => (
                              <label
                                key={r.score}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  border:
                                    selections[i] === r.score
                                      ? "1px solid var(--color-accent)"
                                      : "1px solid #e5e7eb",
                                  borderRadius: 6,
                                  padding: "4px 10px",
                                  fontSize: 13,
                                  cursor: "pointer",
                                  background:
                                    selections[i] === r.score ? "var(--color-bg)" : "transparent",
                                }}
                              >
                                <input
                                  type="radio"
                                  name={`recall-${pair.reader_id}-${i}`}
                                  value={r.score}
                                  checked={selections[i] === r.score}
                                  onChange={() => setRecallPointScore(pair.reader_id, i, r.score)}
                                />
                                {r.score} — {r.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {recallLoaded && recallPairs.length === 0 && (
            <p style={{ color: "#555" }}>
              スコアリング可能なペアはまだありません。
              (Readers need to be completed with remembered_points and their writer's memo must exist.)
            </p>
          )}
        </div>
      </section>
      )}
    </div>
  );
}
