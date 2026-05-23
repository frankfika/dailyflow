import { motion } from 'motion/react';
import { Briefcase, Heart } from 'lucide-react';

interface ContextSwitcherProps {
  activeContext: 'work' | 'life';
  onChange: (context: 'work' | 'life') => void;
  language: 'en' | 'zh';
}

export function ContextSwitcher({ activeContext, onChange, language }: ContextSwitcherProps) {
  const t = {
    work: language === 'zh' ? '工作' : 'Work',
    life: language === 'zh' ? '生活' : 'Life',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex bg-surface rounded p-1 border border-border"
    >
      <button
        onClick={() => onChange('work')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-sans  font-bold transition-all ${
          activeContext === 'work'
            ? 'bg-accent text-white shadow-sm'
            : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Briefcase className="w-3 h-3" />
        <span className="hidden sm:inline">{t.work}</span>
      </button>
      <button
        onClick={() => onChange('life')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-sans  font-bold transition-all ${
          activeContext === 'life'
            ? 'bg-accent text-white shadow-sm'
            : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Heart className="w-3 h-3" />
        <span className="hidden sm:inline">{t.life}</span>
      </button>
    </motion.div>
  );
}
