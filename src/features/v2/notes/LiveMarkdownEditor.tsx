import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Bold, Braces, Code2, Heading1, Heading2, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';

export interface LiveMarkdownEditorHandle {
  focus: () => void;
  setMarkdown: (markdown: string) => void;
}

interface LiveMarkdownEditorProps {
  initialMarkdown: string;
  placeholder: string;
  onChange: (markdown: string) => void;
}

export const LiveMarkdownEditor = forwardRef<LiveMarkdownEditorHandle, LiveMarkdownEditorProps>(
  function LiveMarkdownEditor({ initialMarkdown, placeholder, onChange }, forwardedRef) {
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const extensions = useMemo(() => [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, linkOnPaste: true },
        heading: { levels: [1, 2, 3, 4] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        indentation: { style: 'space', size: 2 },
        markedOptions: { gfm: true, breaks: false },
      }),
    ], [placeholder]);
    const editor = useEditor({
      extensions,
      content: initialMarkdown,
      contentType: 'markdown',
      immediatelyRender: true,
      editorProps: {
        attributes: {
          class: 'note-live-markdown ProseMirror min-h-[60vh] w-full py-7 text-[16px] leading-8 text-text-heading outline-none sm:py-8',
          'data-testid': 'note-body',
          'aria-label': placeholder,
        },
      },
      onUpdate: ({ editor: current }) => onChangeRef.current(current.getMarkdown()),
    });

    useImperativeHandle(forwardedRef, () => ({
      focus: () => editor?.commands.focus(),
      setMarkdown: (markdown: string) => {
        editor?.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
      },
    }), [editor]);

    if (!editor) return null;

    return (
      <div className="relative min-h-full" data-testid="note-live-markdown-editor">
        <BubbleMenu
          editor={editor}
          options={{ placement: 'top', offset: 8 }}
          className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-elevated p-1 shadow-xl"
          aria-label="Text formatting"
        >
          <FormatButton label="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></FormatButton>
          <FormatButton label="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></FormatButton>
          <span className="mx-0.5 h-5 w-px bg-border" />
          <FormatButton label="Bold" onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={15} /></FormatButton>
          <FormatButton label="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={15} /></FormatButton>
          <FormatButton label="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={15} /></FormatButton>
          <FormatButton label="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}><Code2 size={15} /></FormatButton>
          <span className="mx-0.5 h-5 w-px bg-border" />
          <FormatButton label="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={15} /></FormatButton>
          <FormatButton label="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></FormatButton>
          <FormatButton label="Quote" onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={15} /></FormatButton>
          <FormatButton label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Braces size={15} /></FormatButton>
        </BubbleMenu>
        <EditorContent editor={editor} />
      </div>
    );
  },
);

function FormatButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-heading"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
