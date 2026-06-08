import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
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
  title: string;
  run: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
}

const ACTIONS: ToolbarAction[] = [
  {
    icon: "format_bold",
    title: "太字 (Ctrl+B)",
    run: (e) => e.chain().focus().toggleBold().run(),
    isActive: (e) => e.isActive("bold"),
  },
  {
    icon: "format_italic",
    title: "斜体 (Ctrl+I)",
    run: (e) => e.chain().focus().toggleItalic().run(),
    isActive: (e) => e.isActive("italic"),
  },
  {
    icon: "format_strikethrough",
    title: "取り消し線",
    run: (e) => e.chain().focus().toggleStrike().run(),
    isActive: (e) => e.isActive("strike"),
  },
  {
    icon: "format_underlined",
    title: "下線 (Ctrl+U)",
    run: (e) => e.chain().focus().toggleUnderline().run(),
    isActive: (e) => e.isActive("underline"),
  },
  {
    icon: "format_list_bulleted",
    title: "箇条書き",
    run: (e) => e.chain().focus().toggleBulletList().run(),
    isActive: (e) => e.isActive("bulletList"),
  },
  {
    icon: "format_list_numbered",
    title: "番号付きリスト",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    isActive: (e) => e.isActive("orderedList"),
  },
];

export default function MarkdownEditor({
  value,
  onChange,
  disabled,
  placeholder,
  minHeight = 320,
}: Props) {
  const lastEmittedRef = useRef<string>(value || "");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Markdown.configure({
        html: false,
        breaks: true,
        linkify: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "markdown-preview tiptap-editor",
        style: `min-height: ${minHeight}px; padding: 12px; outline: none;`,
      },
    },
    onUpdate: ({ editor }) => {
      const md = (editor.storage as any).markdown.getMarkdown() as string;
      lastEmittedRef.current = md;
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value || "";
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  const showPlaceholder = !!editor && editor.isEmpty && !!placeholder;

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
        {ACTIONS.map((a) => {
          const active = !!editor && a.isActive(editor);
          return (
            <button
              key={a.icon}
              type="button"
              title={a.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor && a.run(editor)}
              disabled={disabled || !editor}
              className={`icon-btn${active ? " is-active" : ""}`}
              style={{ padding: "4px 8px" }}
            >
              <Icon name={a.icon} size={18} />
            </button>
          );
        })}
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
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
