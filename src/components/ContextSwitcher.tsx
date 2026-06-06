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
      className="relative flex bg-surface rounded-lg p-1 border border-border"
    >
      {/* Sliding pill background */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-accent rounded-md shadow-sm"
        style={{ left: activeContext === 'work' ? 4 : 'calc(50%)' }}
      />

      <button
        onClick={() => onChange('work')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-sans font-bold transition-colors ${
          activeContext === 'work' ? 'text-white' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Briefcase className="w-3 h-3" />
        <span className="hidden sm:inline">{t.work}</span>
      </button>
      <button
        onClick={() => onChange('life')}
        className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-sans font-bold transition-colors ${
          activeContext === 'life' ? 'text-white' : 'text-text-muted hover:text-text-main'
        }`}
      >
        <Heart className="w-3 h-3" />
        <span className="hidden sm:inline">{t.life}</span>
      </button>
    </motion.div>
  );
}
