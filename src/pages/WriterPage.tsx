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
const AI_PHASE_DURATION_SECONDS = 10 * 60;
const MANUAL_PHASE_DURATION_SECONDS = 5 * 60;

type WritingPhase = "ai_prompt" | "manual_edit";

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
  const [writingPhase, setWritingPhase] = useState<WritingPhase | null>(null);
  const [phaseStartedAt, setPhaseStartedAt] = useState<number | null>(null);
  const [showSwitchConfirm, setShowSwitchConfirm] = useState(false);

  // text surfaces
  const [finalMemo, setFinalMemo] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [chatHistory, setChatHistory] = useState<
    Array<{ role: "user" | "model"; text: string }>
  >([]);
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

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
      const now = Date.now();
      setTaskStartedAt(now);
      setPhaseStartedAt(now);
      setTimeExpired(false);
      setWritingPhase(writer.condition === "ai_mediated" ? "ai_prompt" : "manual_edit");
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
    setAiLoading(true);
    const sentPrompt = aiPrompt;
    try {
      const data = await apiPost<{ ai_response_text: string }>("ai-generate", {
        writer_id: writer.writer_id,
        memo_id: memoId,
        prompt_text: sentPrompt,
        pdf_attached: pdfAttached,
        history: chatHistory,
      });
      setAiResponse(data.ai_response_text);
      setChatHistory((prev) =>
        [
          ...prev,
          { role: "user" as const, text: sentPrompt },
          { role: "model" as const, text: data.ai_response_text },
        ].slice(-50)
      );
      setAiPrompt("");
      logger.resetBaseline("ai_prompt", "");
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
  }, [writer, memoId, aiPrompt, pdfAttached, chatHistory, logger]);

  const transitionToManualEdit = useCallback(
    (reason: "timer" | "user") => {
      setShowSwitchConfirm(false);
      if (writingPhase !== "ai_prompt") return;
      const seedHtml = aiResponse ? markdownToSafeHtml(aiResponse) : "";
      if (seedHtml) {
        setFinalMemo(seedHtml);
        logger.onChange({
          newValue: seedHtml,
          source: "ai",
          surfaceKey: "final_memo_editor",
          location: "memo_editor",
          targetKey: "final_memo",
          metadata: {
            mode: writer?.condition,
            eventType: "ai_seed_on_manual_phase",
            transition_reason: reason,
          },
        });
      }
      setWritingPhase("manual_edit");
      setPhaseStartedAt(Date.now());
      setTimeExpired(false);
    },
    [writingPhase, aiResponse, logger, writer]
  );

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
    <div style={{ padding: "56px 24px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, color: "#6b7280", margin: "0 0 24px" }}>
        メモ作成タスク
      </h1>

      {step === "email" && <EmailEntry onSubmit={lookup} loading={loading} error={error} />}

      {step === "already_completed" && (
        <p>このタスクはすでに完了しています。ご協力ありがとうございました。</p>
      )}

      {step === "consent" && writer && (
        <ConsentScreen role="writer" condition={writer.condition} onConsent={consent} loading={loading} error={error} />
      )}

      {step === "intro" && writer && (
        <div
          style={{
            maxWidth: 760,
            fontSize: 16,
            lineHeight: 1.8,
            color: "#1f2937",
          }}
        >
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>メモ作成タスクの説明</h2>

          <p style={{ marginBottom: 24 }}>
            本タスクでは、AIプロトタイピングプログラムでの主な学びを同僚に向けて共有する短いメモを作成していただきます。作成したメモは、ご所属部署の同僚3名に共有されます。執筆の制限時間は15分です。
          </p>
          <p style={{ marginBottom: 24 }}>
            執筆中には、補助資料としてAIプロトタイピングプログラムの概要PDF、ならびにプログラム中の全アクティビティに対するご自身の振り返り内容が表示されます。こちらはメモ作成の参考にご利用いただけます。
          </p>
          <p style={{ marginBottom: 32 }}>
            本タスクは、他者と相談・会話せずに個人で実施してください。ノートPCまたはデスクトップPCを使用し、途中で中断せず一気に進めることを推奨します。タスク開始から15分が経過すると、それ以上の編集は自動的に無効化されます。
          </p>

          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>メモに含めて頂きたいこと（必ずしもこの構成に沿う必要はありません）</h3>
          <ul style={{ marginBottom: 32, paddingLeft: 24 }}>
            <li style={{ marginBottom: 8 }}>プログラムを通した学び</li>
            <li style={{ marginBottom: 8 }}>チームにとっての気付き</li>
            <li style={{ marginBottom: 8 }}>今すぐにできること／変えられること</li>
          </ul>

          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>本条件における注意事項</h3>
          {writer.condition === "human_only" ? (
            <ul style={{ marginBottom: 32, paddingLeft: 24 }}>
              <li style={{ marginBottom: 8 }}>AIを使用せずに執筆してください。</li>
              <li style={{ marginBottom: 8 }}>
                外部のAIツールや、外部の作成支援サービスは使用しないでください。
              </li>
              <li style={{ marginBottom: 8 }}>
                提供された資料とご自身の理解のみをもとに作成してください。
              </li>
            </ul>
          ) : (
            <ul style={{ marginBottom: 32, paddingLeft: 24 }}>
              <li style={{ marginBottom: 8 }}>
                最初の10分間はAIを使用してドラフトを生成してください。
              </li>
              <li style={{ marginBottom: 8 }}>
                10分経過後はAIの利用が無効化されますが、その代わりにAIで出力した内容を直接編集できるようになります。残りの5分間は、ドラフトの編集・調整にご利用ください。
              </li>
              <li style={{ marginBottom: 8 }}>本インターフェース以外のツールは使用しないでください。</li>
              <li style={{ marginBottom: 8 }}>
                AIへのプロンプトおよびAIからの応答はログとして記録されます。
              </li>
              <li style={{ marginBottom: 8 }}>
                AIへのプロンプトに、顧客名、クライアントデータ、同僚の個人情報、機密性の高いプロジェクト情報などを入力しないでください。
              </li>
            </ul>
          )}

          {error && <p style={{ color: "crimson", marginBottom: 16 }}>{error}</p>}
          <button
            type="button"
            disabled={loading}
            onClick={startTask}
            style={{ padding: "12px 24px", fontSize: 16 }}
          >
            メモ作成タスクを開始する
          </button>
        </div>
      )}

      {step === "writing" && writer && (
        <div>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {writer.condition === "ai_mediated" && writingPhase === "ai_prompt" && (
              <>
                <Timer
                  key="ai-phase-timer"
                  startedAt={phaseStartedAt}
                  durationSeconds={AI_PHASE_DURATION_SECONDS}
                  label="AI生成フェーズ 残り時間"
                  onExpire={() => transitionToManualEdit("timer")}
                />
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  10分経過後、自動的に手動修正フェーズに移ります。
                </span>
              </>
            )}
            {writer.condition === "ai_mediated" && writingPhase === "manual_edit" && (
              <Timer
                key="manual-phase-timer"
                startedAt={phaseStartedAt}
                durationSeconds={MANUAL_PHASE_DURATION_SECONDS}
                label="手動修正フェーズ 残り時間"
                onExpire={() => setTimeExpired(true)}
              />
            )}
            {writer.condition === "human_only" && (
              <Timer
                startedAt={taskStartedAt}
                durationSeconds={TASK_DURATION_SECONDS}
                onExpire={() => setTimeExpired(true)}
              />
            )}
            {timeExpired && (
              <p style={{ color: "crimson", margin: 0 }}>
                作成時間が終了しました。メモを提出してください。
              </p>
            )}
          </div>

          {writer.condition === "ai_mediated" && writingPhase === "ai_prompt" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
              <div>
                <div
                  style={{
                    marginBottom: 12,
                    padding: "12px 16px",
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "#374151",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    メモに含めて頂きたいこと（必ずしもこの構成に沿う必要はありません）
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>プログラムを通した学び</li>
                    <li>チームにとっての気付き</li>
                    <li>今すぐにできること／変えられること</li>
                  </ul>
                </div>
              <section style={{ border: "1px solid #ddd", padding: 12, borderRadius: 4 }}>
                {/* <h3>AIドラフト作成アシスタント</h3>
                <p>
                  AIアシスタントに依頼してメモの初期ドラフトを作成できます。AIが使えるのは、あなたがプロンプトに入力した内容と、手動で添付したProgram
                  Overview PDFのみです。最後に生成されたAI出力が、次の手動修正フェーズの初期内容になります。
                </p> */}
                <label>
                  AIへの依頼内容
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => onPromptChange(e.target.value)}
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
                    />
                    <span style={{ marginLeft: 6 }}>プログラムの概要PDFをプロンプトに添付する</span>
                  </label>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={generateAi}
                    disabled={aiLoading}
                    style={{ padding: "6px 12px" }}
                  >
                    {aiLoading ? (
                      <>
                        <Spinner size={14} /> AIが回答しています...
                      </>
                    ) : (
                      "AIに送信する"
                    )}
                  </button>
                </div>
                {error && <p style={{ color: "crimson" }}>{error}</p>}
                {aiResponse && (
                  <div style={{ marginTop: 12, opacity: aiLoading ? 0.5 : 1, transition: "opacity 0.2s" }}>
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
                  </div>
                )}
                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowSwitchConfirm(true)}
                    disabled={aiLoading}
                    style={{ padding: "6px 12px" }}
                  >
                    次へ進む
                  </button>
                </div>
              </section>
              </div>

              <SourceMaterials
                pdfUrl={writer.program_overview_pdf_url}
                reflections={writer.reflections_json ?? []}
                condition={writer.condition}
                pdfAttached={pdfAttached}
                onTogglePdfAttachment={setPdfAttached}
              />
            </div>
          )}

          {(writer.condition === "human_only" || writingPhase === "manual_edit") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
              <div>
                <div
                  style={{
                    marginBottom: 12,
                    padding: "12px 16px",
                    background: "#f8fafc",
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "#374151",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>
                    メモに含めて頂きたいこと（必ずしもこの構成に沿う必要はありません）
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>プログラムを通した学び</li>
                    <li>チームにとっての気付き</li>
                    <li>今すぐにできること／変えられること</li>
                  </ul>
                </div>
                <div style={{ fontSize: "0.95rem", marginBottom: 4 }}>執筆中のメモ</div>
                <MarkdownEditor
                  value={finalMemo}
                  onChange={onMemoChange}
                  disabled={timeExpired}
                  placeholder={
                    writer.condition === "human_only"
                      ? "ここにメモを作成してください。"
                      : "AI生成結果をもとに、ここで最終メモを編集してください。"
                  }
                  minHeight={320}
                />

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
              />
            </div>
          )}

          {showSwitchConfirm && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 300,
                padding: 16,
              }}
            >
              <div
                style={{
                  background: "var(--color-bg)",
                  borderRadius: "var(--radius-md)",
                  padding: 24,
                  maxWidth: 380,
                  width: "100%",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                }}
              >
                <p style={{ marginTop: 0, fontSize: 15, lineHeight: 1.7 }}>
                  一度手動モードに進むとAI生成に戻ることはできません。
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => transitionToManualEdit("user")}
                    style={{
                      background: "var(--color-danger, #dc2626)",
                      color: "#fff",
                      border: "1px solid var(--color-danger, #dc2626)",
                      padding: "10px 16px",
                      fontWeight: 600,
                      textAlign: "center",
                      justifyContent: "center",
                    }}
                  >
                    手動修正に進む
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSwitchConfirm(false)}
                    style={{ textAlign: "center", justifyContent: "center" }}
                  >
                    AI生成を続ける
                  </button>
                </div>
              </div>
            </div>
          )}
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
          <h2>ご協力ありがとうございました！</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`回答は正常に送信されました。

これでメモ作成タスクは完了となります。全ての結果がで揃い次第、分析結果をレポートさせて頂きます。`}
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
