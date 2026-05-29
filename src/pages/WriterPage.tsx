import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmailEntry from "../components/EmailEntry";
import ConsentScreen from "../components/ConsentScreen";
import Timer from "../components/Timer";
import SourceMaterials, { Reflection } from "../components/SourceMaterials";
import WriterSurvey from "../components/WriterSurvey";
import MarkdownEditor from "../components/MarkdownEditor";
import MarkdownRenderer from "../components/MarkdownRenderer";
import Spinner from "../components/Spinner";
import { apiPost } from "../lib/apiClient";
import { createWordDiffLogger, WordDiffLogger } from "../lib/wordDiffLogger";
import { marked } from "marked";
import DOMPurify from "dompurify";

function markdownToSafeHtml(src: string): string {
  const raw = marked.parse(src || "", { async: false }) as string;
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "s", "strike", "del", "u",
      "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre", "hr", "a",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
  });
}

const CONSENT_VERSION = "v1_mvp";
const TASK_DURATION_SECONDS = 15 * 60;

type Step =
  | "email"
  | "consent"
  | "intro"
  | "writing"
  | "memo_submitted"
  | "survey"
  | "thanks"
  | "already_completed";

interface WriterLookup {
  writer_id: string;
  condition: "human_only" | "ai_mediated";
  status: "not_started" | "started" | "completed";
  program_overview_pdf_url: string | null;
  reflections_json: Reflection[];
}

export default function WriterPage() {
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [writer, setWriter] = useState<WriterLookup | null>(null);
  const [memoId, setMemoId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [taskStartedAt, setTaskStartedAt] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);

  // text surfaces
  const [finalMemo, setFinalMemo] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [pdfAttached, setPdfAttached] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<any[]>([]);

  // refs for surface current values (used by logger flush)
  const finalMemoRef = useRef("");
  const aiPromptRef = useRef("");
  const aiResponseRef = useRef("");
  useEffect(() => {
    finalMemoRef.current = finalMemo;
  }, [finalMemo]);
  useEffect(() => {
    aiPromptRef.current = aiPrompt;
  }, [aiPrompt]);
  useEffect(() => {
    aiResponseRef.current = aiResponse;
  }, [aiResponse]);

  const writerRef = useRef(writer);
  const memoIdRef = useRef(memoId);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => {
    writerRef.current = writer;
  }, [writer]);
  useEffect(() => {
    memoIdRef.current = memoId;
  }, [memoId]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // create logger once with ref-based id resolution
  const logger = useMemo<WordDiffLogger>(() => {
    return createWordDiffLogger({
      getIds: () => {
        const w = writerRef.current;
        const m = memoIdRef.current;
        const s = sessionIdRef.current;
        if (!w || !m || !s) return null;
        return { session_id: s, writer_id: w.writer_id, memo_id: m, condition: w.condition };
      },
      getCurrentValueForSurface: (key) => {
        if (key === "final_memo_editor") return finalMemoRef.current;
        if (key === "ai_prompt") return aiPromptRef.current;
        if (key === "ai_response") return aiResponseRef.current;
        return "";
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      logger.clearTimers();
    };
  }, [logger]);

  useEffect(() => {
    const id = setInterval(() => setDebugLogs(logger.getBuffer()), 500);
    return () => clearInterval(id);
  }, [logger]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const lookup = useCallback(async (email: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<WriterLookup>("writer-lookup", { email });
      setWriter(data);
      if (data.status === "completed") {
        setStep("already_completed");
      } else {
        setStep("consent");
      }
    } catch (e: any) {
      setError(e?.message ?? "送信中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  const consent = useCallback(async () => {
    if (!writer) return;
    setError(null);
    setLoading(true);
    try {
      await apiPost("writer-consent", {
        writer_id: writer.writer_id,
        consent_version: CONSENT_VERSION,
      });
      setStep("intro");
    } catch (e: any) {
      setError(e?.message ?? "送信中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [writer]);

  const startTask = useCallback(async () => {
    if (!writer) return;
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<{ memo_id: string; session_id: string }>("writer-start", {
        writer_id: writer.writer_id,
      });
      setMemoId(data.memo_id);
      setSessionId(data.session_id);
      setTaskStartedAt(Date.now());
      logger.resetBaseline("final_memo_editor", "");
      logger.resetBaseline("ai_prompt", "");
      logger.resetBaseline("ai_response", "");
      logger.enable();
      setStep("writing");
    } catch (e: any) {
      setError(e?.message ?? "送信中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [writer, logger]);

  const generateAi = useCallback(async () => {
    if (!writer || !memoId) return;
    if (!aiPrompt.trim()) {
      setError("AIへの依頼内容を入力してください。");
      return;
    }
    setError(null);
    setAiResponse("");
    setAiLoading(true);
    try {
      const data = await apiPost<{ ai_response_text: string }>("ai-generate", {
        writer_id: writer.writer_id,
        memo_id: memoId,
        prompt_text: aiPrompt,
        pdf_attached: pdfAttached,
      });
      setAiResponse(data.ai_response_text);
      logger.onChange({
        newValue: data.ai_response_text,
        source: "ai",
        surfaceKey: "ai_response",
        location: "ai_output_area",
        targetKey: "ai_response",
        metadata: { mode: writer.condition, eventType: "ai_response_received" },
      });
    } catch (e: any) {
      setError(e?.message ?? "AIドラフトの生成に失敗しました。");
    } finally {
      setAiLoading(false);
    }
  }, [writer, memoId, aiPrompt, pdfAttached, logger]);

  const insertAiIntoMemo = useCallback(() => {
    if (!aiResponse) return;
    const aiHtml = markdownToSafeHtml(aiResponse);
    const newMemo = finalMemo ? `${finalMemo}${aiHtml}` : aiHtml;
    setFinalMemo(newMemo);
    logger.onChange({
      newValue: newMemo,
      source: "ai",
      surfaceKey: "final_memo_editor",
      location: "memo_editor",
      targetKey: "final_memo",
      metadata: { mode: writer?.condition, eventType: "ai_insert" },
    });
  }, [aiResponse, finalMemo, logger, writer]);

  const onMemoChange = useCallback(
    (val: string) => {
      setFinalMemo(val);
      logger.onChange({
        newValue: val,
        source: "human",
        surfaceKey: "final_memo_editor",
        location: "memo_editor",
        targetKey: "final_memo",
        metadata: { mode: writer?.condition, eventType: "text_change" },
      });
    },
    [logger, writer]
  );

  const onPromptChange = useCallback(
    (val: string) => {
      setAiPrompt(val);
      logger.onChange({
        newValue: val,
        source: "human",
        surfaceKey: "ai_prompt",
        location: "ai_prompt_box",
        targetKey: "ai_prompt",
        metadata: { mode: writer?.condition, eventType: "text_change" },
      });
    },
    [logger, writer]
  );

  const submitMemo = useCallback(async () => {
    if (!writer || !memoId || !taskStartedAt) return;
    setError(null);
    setLoading(true);
    try {
      logger.flush();
      await logger.upload();
      const duration = Math.floor((Date.now() - taskStartedAt) / 1000);
      await apiPost("writer-submit-memo", {
        writer_id: writer.writer_id,
        memo_id: memoId,
        condition: writer.condition,
        final_memo_text: finalMemo,
        task_duration_seconds: duration,
      });
      logger.disable();
      setStep("memo_submitted");
    } catch (e: any) {
      setError(e?.message ?? "メモの提出に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [writer, memoId, taskStartedAt, finalMemo, logger]);

  const submitSurvey = useCallback(
    async (answers: Record<string, unknown>) => {
      if (!writer) return;
      setError(null);
      setLoading(true);
      try {
        await apiPost("writer-submit-survey", {
          writer_id: writer.writer_id,
          survey_answers_json: answers,
        });
        setStep("thanks");
      } catch (e: any) {
        setError(e?.message ?? "送信中にエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    },
    [writer]
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>メモ作成タスク</h1>

      {step === "email" && <EmailEntry onSubmit={lookup} loading={loading} error={error} />}

      {step === "already_completed" && (
        <p>このタスクはすでに完了しています。ご協力ありがとうございました。</p>
      )}

      {step === "consent" && writer && (
        <ConsentScreen role="writer" onConsent={consent} loading={loading} error={error} />
      )}

      {step === "intro" && writer && (
        <div style={{ maxWidth: 720 }}>
          <h2>メモ作成タスクの説明</h2>
          {writer.condition === "human_only" ? (
            <p style={{ whiteSpace: "pre-wrap" }}>
              {`このタスクでは、AI Prototyping Programで得た主な学びについて、同じ部署の同僚に向けた1ページのメモを作成します。

画面に表示される補足資料を参考にして構いません。補足資料には、Program Overview PDFと、あなたがプログラム中に記入した振り返り内容が含まれます。

この条件では、AIや外部ツールを使用せず、ご自身でメモを作成してください。

メモ作成時間は15分です。`}
            </p>
          ) : (
            <p style={{ whiteSpace: "pre-wrap" }}>
              {`このタスクでは、AI Prototyping Programで得た主な学びについて、同じ部署の同僚に向けた1ページのメモを作成します。

この条件では、AIアシスタントを使って最初のドラフトを作成し、その後、ご自身で内容を編集・調整して最終メモを完成させてください。

AIへの依頼時には、Program Overview PDFを手動で添付することができます。ただし、AIはあなたの個別の振り返りテキストには自動ではアクセスできません。AIに振り返り内容を使わせたい場合は、必要だと思う部分をコピーしてプロンプトに貼り付けるか、ご自身で要約して入力してください。

メモ作成時間は15分です。`}
            </p>
          )}
          {error && <p style={{ color: "crimson" }}>{error}</p>}
          <button type="button" disabled={loading} onClick={startTask} style={{ padding: "8px 16px" }}>
            15分のメモ作成を開始する
          </button>
        </div>
      )}

      {step === "writing" && writer && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
          <div>
            <div style={{ marginBottom: 12 }}>
              <Timer
                startedAt={taskStartedAt}
                durationSeconds={TASK_DURATION_SECONDS}
                onExpire={() => setTimeExpired(true)}
              />
              {timeExpired && (
                <p style={{ color: "crimson" }}>
                  作成時間が終了しました。現在の内容を確認し、メモを提出してください。
                </p>
              )}
            </div>

            {writer.condition === "ai_mediated" && (
              <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 4, marginBottom: 16 }}>
                <h3>AIドラフト作成アシスタント</h3>
                <p>
                  AIアシスタントに依頼してメモの初期ドラフトを作成できます。AIが使えるのは、あなたがプロンプトに入力した内容と、手動で添付したProgram
                  Overview PDFのみです。
                </p>
                <label>
                  AIへの依頼内容
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => onPromptChange(e.target.value)}
                    disabled={timeExpired}
                    placeholder="作成したいメモの内容や、含めたいポイントを入力してください。"
                    style={{ width: "100%", minHeight: 100, marginTop: 4 }}
                  />
                </label>
                <div style={{ marginTop: 8 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={pdfAttached}
                      onChange={(e) => setPdfAttached(e.target.checked)}
                      disabled={timeExpired}
                    />
                    <span style={{ marginLeft: 6 }}>Program Overview PDFをAIへの依頼に添付する</span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={generateAi}
                  disabled={aiLoading || timeExpired}
                  style={{ marginTop: 8, padding: "6px 12px" }}
                >
                  {aiLoading ? (
                    <>
                      <Spinner size={14} /> AIドラフトを生成しています...
                    </>
                  ) : (
                    "AIドラフトを生成する"
                  )}
                </button>
                {aiLoading && !aiResponse && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 16,
                      border: "1px dashed var(--color-border-strong)",
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-surface-alt)",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <Spinner size={18} />
                    <span>AIがドラフトを作成しています。しばらくお待ちください。</span>
                  </div>
                )}
                {aiResponse && (
                  <div style={{ marginTop: 12 }}>
                    <label>AI生成結果</label>
                    <MarkdownRenderer
                      source={aiResponse}
                      style={{
                        marginTop: 4,
                        padding: 12,
                        minHeight: 120,
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        background: "var(--color-surface-alt)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={insertAiIntoMemo}
                      disabled={timeExpired}
                      style={{ marginTop: 6 }}
                    >
                      AI生成結果をメモに挿入する
                    </button>
                  </div>
                )}
              </section>
            )}

            <div>
              <div style={{ fontSize: "0.95rem", marginBottom: 4 }}>最終メモ</div>
              <MarkdownEditor
                value={finalMemo}
                onChange={onMemoChange}
                disabled={timeExpired}
                placeholder={
                  writer.condition === "human_only"
                    ? "ここにメモを作成してください。"
                    : "AI生成結果を参考にしながら、ここで最終メモを編集してください。"
                }
                minHeight={320}
              />
            </div>

            {error && <p style={{ color: "crimson" }}>{error}</p>}
            <button
              type="button"
              onClick={submitMemo}
              disabled={loading}
              style={{ marginTop: 12, padding: "8px 16px" }}
            >
              {loading ? "送信中..." : "メモを提出する"}
            </button>
          </div>

          <SourceMaterials
            pdfUrl={writer.program_overview_pdf_url}
            reflections={writer.reflections_json ?? []}
            condition={writer.condition}
            pdfAttached={pdfAttached}
            onTogglePdfAttachment={writer.condition === "ai_mediated" ? setPdfAttached : undefined}
          />
        </div>
      )}

      {step === "memo_submitted" && writer && (
        <div>
          <p>メモを提出しました。続いて、短いアンケートに回答してください。</p>
          <button
            type="button"
            onClick={() => setStep("survey")}
            style={{ padding: "8px 16px" }}
          >
            アンケートに進む
          </button>
        </div>
      )}

      {step === "survey" && writer && (
        <WriterSurvey
          condition={writer.condition}
          onSubmit={submitSurvey}
          loading={loading}
          error={error}
        />
      )}

      {step === "thanks" && (
        <div>
          <h2>ありがとうございました</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`メモ作成タスクは完了しました。

ご協力ありがとうございました。回答は正常に送信されました。`}
          </p>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 200,
          width: debugOpen ? 420 : "auto",
          maxHeight: debugOpen ? "60vh" : "auto",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          className="icon-btn"
          onClick={() => setDebugOpen((v) => !v)}
          style={{ fontSize: "0.75rem", border: "none", borderRadius: 0, justifyContent: "space-between" }}
        >
          <span>debug logs ({debugLogs.length || logger.getBuffer().length})</span>
          <span>{debugOpen ? "✕" : "▲"}</span>
        </button>
        {debugOpen && (
          <div style={{ overflow: "auto", padding: 8, borderTop: "1px solid var(--color-border)" }}>
            {debugLogs.length === 0 ? (
              <p className="muted" style={{ fontSize: "0.75rem", margin: 0 }}>
                No buffered logs yet. They will appear as you type, then get uploaded on submit.
              </p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.72rem", lineHeight: 1.5 }}>
                {debugLogs.map((l, i) => (
                  <li key={i} style={{ marginBottom: 6, fontFamily: "monospace" }}>
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {new Date(l.timestamp).toLocaleTimeString()}
                    </span>{" "}
                    <strong>{l.surface_key}</strong>{" "}
                    <span style={{ color: l.source === "ai" ? "var(--color-success)" : "var(--color-text)" }}>
                      [{l.source}]
                    </span>{" "}
                    <span style={{ color: "var(--color-success)" }}>+{l.added_words}</span>{" "}
                    <span style={{ color: "var(--color-danger)" }}>-{l.removed_words}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
