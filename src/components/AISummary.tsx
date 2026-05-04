import { motion } from 'motion/react';
import { X, Loader2, Calendar } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface AISummaryProps {
  isOpen: boolean;
  onClose: () => void;
  summary: string | null;
  isLoading: boolean;
  period: '7days' | '30days' | 'all';
  onPeriodChange: (period: '7days' | '30days' | 'all') => void;
  language: 'en' | 'zh';
}

export function AISummary({
  isOpen,
  onClose,
  summary,
  isLoading,
  period,
  onPeriodChange,
  language,
}: AISummaryProps) {
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
        className="bg-background rounded-2xl border border-border w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold">
              {language === 'zh' ? 'AI 工作摘要' : 'AI Work Summary'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Period Selector */}
        <div className="px-6 pt-4 flex gap-2">
          {(['7days', '30days', 'all'] as const).map(p => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                period === p
                  ? 'bg-accent text-white'
                  : 'bg-accent/10 text-accent hover:bg-accent/20'
              }`}
            >
              {p === '7days'
                ? language === 'zh' ? '近7天' : 'Last 7 days'
                : p === '30days'
                  ? language === 'zh' ? '近30天' : 'Last 30 days'
                  : language === 'zh' ? '全部' : 'All time'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
              <span className="ml-2 text-muted-foreground">
                {language === 'zh' ? '正在生成摘要...' : 'Generating summary...'}
              </span>
            </div>
          ) : summary ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              {language === 'zh'
                ? '暂无摘要内容'
                : 'No summary available'}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
