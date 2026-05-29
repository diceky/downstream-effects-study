import { useEffect, useRef } from "react";
import Icon from "./Icon";

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
}

interface ToolbarAction {
  icon: string;
  cmd: string;
  title: string;
}

const ACTIONS: ToolbarAction[] = [
  { icon: "format_bold", cmd: "bold", title: "太字 (Ctrl+B)" },
  { icon: "format_italic", cmd: "italic", title: "斜体 (Ctrl+I)" },
  { icon: "format_strikethrough", cmd: "strikeThrough", title: "取り消し線" },
  { icon: "format_underlined", cmd: "underline", title: "下線 (Ctrl+U)" },
  { icon: "format_list_bulleted", cmd: "insertUnorderedList", title: "箇条書き" },
  { icon: "format_list_numbered", cmd: "insertOrderedList", title: "番号付きリスト" },
];

const SHORTCUT_MAP: Record<string, string> = {
  b: "bold",
  i: "italic",
  u: "underline",
};

function isEmptyHtml(html: string): boolean {
  if (!html) return true;
  const trimmed = html.replace(/\s+/g, "");
  return (
    trimmed === "" ||
    trimmed === "<br>" ||
    trimmed === "<p></p>" ||
    trimmed === "<p><br></p>" ||
    trimmed === "<div><br></div>"
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  disabled,
  placeholder,
  minHeight = 320,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function emitChange() {
    const el = editorRef.current;
    if (el) onChange(el.innerHTML);
  }

  function runCmd(cmd: string) {
    if (disabled) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(cmd, false);
    emitChange();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const cmd = SHORTCUT_MAP[e.key.toLowerCase()];
    if (cmd) {
      e.preventDefault();
      runCmd(cmd);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Insert as plain text so unexpected styles/formatting don't leak in.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    emitChange();
  }

  const showPlaceholder = isEmptyHtml(value) && !!placeholder;

  return (
    <div
      style={{
        border: "1px solid var(--color-border-strong)",
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: 6,
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-surface-alt)",
        }}
      >
        {ACTIONS.map((a) => (
          <button
            key={a.cmd}
            type="button"
            title={a.title}
            onMouseDown={(e) => e.preventDefault() /* keep editor focus */}
            onClick={() => runCmd(a.cmd)}
            disabled={disabled}
            className="icon-btn"
            style={{ padding: "4px 8px" }}
          >
            <Icon name={a.icon} size={18} />
          </button>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        {showPlaceholder && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: 12,
              color: "var(--color-text-muted)",
              pointerEvents: "none",
              fontSize: "0.95rem",
              lineHeight: 1.7,
            }}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="markdown-preview"
          style={{
            minHeight,
            padding: 12,
            outline: "none",
            lineHeight: 1.7,
            fontSize: "0.95rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        />
      </div>
    </div>
  );
}

