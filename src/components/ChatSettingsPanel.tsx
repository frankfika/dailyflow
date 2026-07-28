/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Bot, Zap, ArrowLeft } from 'lucide-react';
import { ModelLibrary } from './ModelLibrary';
import { SkillManager } from './SkillManager';

interface ChatSettingsPanelProps {
  language: 'en' | 'zh';
  onClose: () => void;
  initialTab?: 'providers' | 'skills';
}

export function ChatSettingsPanel({ language, onClose, initialTab = 'providers' }: ChatSettingsPanelProps) {
  const [tab, setTab] = useState<'providers' | 'skills'>(initialTab);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement;
      const isEditing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditing || e.isComposing) return;
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="absolute bottom-0 right-0 top-0 flex min-h-0 w-full max-w-2xl flex-col overflow-hidden border-l border-border bg-background shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header: back + tabs + close */}
        <div className="px-5 py-3 border-b border-border bg-surface-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-text-muted hover:text-accent transition-colors rounded-md hover:bg-surface"
              title={language === 'zh' ? '返回对话' : 'Back to chat'}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{language === 'zh' ? '返回' : 'Back'}</span>
            </button>
            <div className="w-px h-4 bg-border/50" />
            <button
              onClick={() => setTab('providers')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md transition-colors ${
                tab === 'providers' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-heading hover:bg-surface'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              {language === 'zh' ? '模型供应商' : 'Providers'}
            </button>
            <button
              onClick={() => setTab('skills')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-md transition-colors ${
                tab === 'skills' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-heading hover:bg-surface'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              {language === 'zh' ? 'Skills' : 'Skills'}
            </button>
          </div>
          <button onClick={onClose} className="p-1.5 text-text-muted hover:text-red-500 transition-colors rounded hover:bg-surface">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === 'providers' ? (
            <ModelLibrary language={language} />
          ) : (
            <SkillManager language={language} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
