import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { adminCall, getAdminPassword, setAdminPassword } from "../lib/adminClient";
import Icon from "../components/Icon";
import MarkdownRenderer from "../components/MarkdownRenderer";

const REFLECTION_SLOTS = 12;

const DEFAULT_ACTIVITY_TITLES: string[] = [
  "Gemini/Google AI Studioをひとまず触ってみる",
  "会話に潜む認知バイアスを意識してみよう！",
  "AIのアウトプットを裏取りしてみよう！",
  "AIコールセンターに電話してみよう！",
  "褒めるAIと厳しいAI、どっちがいい？",
  "答えが欲しい？問いかけが欲しい？",
  "理想的なクレーム対応を完全再現してみよう！",
  "組織の独自情報を組み込んでみよう！",
  "身の回りの困りごとを解消するアプリを作ってみよう！",
  "自分ならこう読ませる！",
  "理想のAIお問い合わせ窓口をゼロから組んでみよう！",
  "ラスト・フリカエリ",
];

type Condition = "human_only" | "ai_mediated";

interface WriterRow {
  writer_id: string;
  email: string;
  name: string | null;
  condition: Condition;
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

interface WriterDraft {
  writer_id: string;
  email: string;
  name: string;
  condition: Condition;
  program_overview_pdf_url: string;
  reflections: { title: string; text: string }[];
}

interface ReaderDraft {
  reader_id: string;
  email: string;
  assigned_memo_id: string;
}

function emptyReflections() {
  return Array.from({ length: REFLECTION_SLOTS }, (_, i) => ({
    title: DEFAULT_ACTIVITY_TITLES[i] ?? "",
    text: "",
  }));
}

function emptyWriterDraft(): WriterDraft {
  return {
    writer_id: "",
    email: "",
    name: "",
    condition: "human_only",
    program_overview_pdf_url: "",
    reflections: emptyReflections(),
  };
}

function emptyReaderDraft(): ReaderDraft {
  return {
    reader_id: "",
    email: "",
    assigned_memo_id: "",
  };
}

function reflectionsToDraft(json: ReflectionEntry[] | null): { title: string; text: string }[] {
  const slots = emptyReflections();
  if (!Array.isArray(json)) return slots;
  for (const entry of json) {
    const idx = entry.activity_number ?? -1;
    if (idx >= 0 && idx < REFLECTION_SLOTS) {
      slots[idx] = { title: entry.title ?? "", text: entry.text ?? "" };
    }
  }
  return slots;
}

function reflectionsFromDraft(slots: { title: string; text: string }[]): ReflectionEntry[] {
  const out: ReflectionEntry[] = [];
  slots.forEach((slot, i) => {
    if (slot.title.trim() || slot.text.trim()) {
      out.push({
        activity_number: i,
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

  type Tab = "writers" | "readers" | "memos";
  const [tab, setTab] = useState<Tab>("writers");
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());

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

  const memoOptions = useMemo(
    () =>
      memos.map((m) => ({
        value: m.memo_id,
        label: `${m.memo_id} (writer ${m.writer_id})`,
      })),
    [memos]
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
  }

  function startEditWriter(w: WriterRow) {
    setEditingWriterId(w.writer_id);
    setWriterDraft({
      writer_id: w.writer_id,
      email: w.email,
      name: w.name ?? "",
      condition: w.condition,
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
        name: writerDraft.name.trim() || null,
        condition: writerDraft.condition,
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
              <th style={cellStyle}>name</th>
              <th style={cellStyle}>condition</th>
              <th style={cellStyle}>status</th>
              <th style={cellStyle}>PDF URL</th>
              <th style={cellStyle}>reflections</th>
              <th style={cellStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {writers.map((w) => (
              <tr key={w.writer_id}>
                <td style={cellStyle}>{w.writer_id}</td>
                <td style={cellStyle}>{w.email}</td>
                <td style={cellStyle}>{w.name ?? "—"}</td>
                <td style={cellStyle}>{w.condition}</td>
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
                <td style={cellStyle} colSpan={8}>
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
              name
              <input
                type="text"
                value={writerDraft.name}
                onChange={(e) => setWriterDraft({ ...writerDraft, name: e.target.value })}
                style={{ width: "100%", padding: 6 }}
              />
            </label>
            <label>
              condition
              <select
                value={writerDraft.condition}
                onChange={(e) =>
                  setWriterDraft({
                    ...writerDraft,
                    condition: e.target.value as Condition,
                  })
                }
                style={{ width: "100%", padding: 6 }}
              >
                <option value="human_only">human_only</option>
                <option value="ai_mediated">ai_mediated</option>
              </select>
            </label>
            <label>
              program_overview_pdf_url
              <input
                type="text"
                value={writerDraft.program_overview_pdf_url}
                onChange={(e) =>
                  setWriterDraft({
                    ...writerDraft,
                    program_overview_pdf_url: e.target.value,
                  })
                }
                placeholder="/program-overview.pdf など"
                style={{ width: "100%", padding: 6 }}
              />
            </label>
          </div>

          <h4 style={{ marginTop: 16 }}>振り返り (12 件)</h4>
          <p style={{ fontSize: 12, color: "#555" }}>
            空欄の枠は保存時に無視されます。タイトルか本文のどちらかが入力されている枠のみ保存されます。
          </p>
          <div style={{ display: "grid", gap: 12 }}>
            {writerDraft.reflections.map((r, i) => (
              <div
                key={i}
                style={{ border: "1px solid #eee", padding: 8, borderRadius: 4 }}
              >
                <div style={{ fontWeight: "bold", marginBottom: 4 }}>Activity {i}</div>
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
            {readers.map((r) => (
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
              assigned_memo_id
              <input
                type="text"
                list="memo-options"
                value={readerDraft.assigned_memo_id}
                onChange={(e) =>
                  setReaderDraft({ ...readerDraft, assigned_memo_id: e.target.value })
                }
                required
                style={{ width: "100%", padding: 6 }}
              />
              <datalist id="memo-options">
                {memoOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </datalist>
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
                          style={{
                            padding: "4px 10px",
                            border: "1px solid #d1d5db",
                            borderRadius: 4,
                            background: "#fff",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          {isOpen ? "隠す" : "表示"}
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
    </div>
  );
}
