import { motion } from 'motion/react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface BrainDumpProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
  language: 'en' | 'zh';
}

export function BrainDump({ isOpen, onClose, onSubmit, language }: BrainDumpProps) {
  const [text, setText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setIsProcessing(true);
    try {
      await onSubmit(text);
      setText('');
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-background rounded-2xl border border-border w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold">
              {language === 'zh' ? '头脑风暴' : 'Brain Dump'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {language === 'zh'
            ? '写下你脑海中的所有想法，AI 会帮你整理成任务。'
            : 'Write down everything on your mind, and AI will help organize it into tasks.'}
        </p>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={
            language === 'zh'
              ? '例如：需要给客户发邮件汇报项目进度，还要记得周五之前完成代码审查...'
              : 'e.g., Need to email the client about project progress, also remember to finish code review by Friday...'
          }
          className="w-full h-48 bg-accent/5 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/50 resize-none"
          disabled={isProcessing}
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-accent/5 transition-colors"
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || isProcessing}
            className="flex-1 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {language === 'zh' ? '处理中...' : 'Processing...'}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {language === 'zh' ? 'AI 整理' : 'Organize with AI'}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
