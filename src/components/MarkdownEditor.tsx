import { useEffect, useRef } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-markdown';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function MarkdownEditor({ value, onChange, disabled }: MarkdownEditorProps) {
  const highlight = (code: string) => {
    return Prism.highlight(code, Prism.languages.markdown, 'markdown');
  };

  return (
    <Editor
      value={value}
      onValueChange={onChange}
      highlight={highlight}
      padding={16}
      className="font-mono text-sm leading-relaxed min-h-full"
      style={{
        fontFamily: 'var(--font-mono)',
        backgroundColor: 'transparent',
      }}
      disabled={disabled}
      textareaClassName="outline-none"
      preClassName="language-markdown"
    />
  );
}
