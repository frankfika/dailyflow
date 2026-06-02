/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Bot, Zap } from 'lucide-react';
import { ModelLibrary } from './ModelLibrary';
import { SkillManager } from './SkillManager';

interface ChatSettingsPanelProps {
  language: 'en' | 'zh';
  onClose: () => void;
}

export function ChatSettingsPanel({ language, onClose }: ChatSettingsPanelProps) {
  const [tab, setTab] = useState<'providers' | 'skills'>('providers');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-surface w-full max-w-3xl h-[80vh] rounded-lg shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-heading">
            {language === 'zh' ? 'AI 设置' : 'AI Settings'}
          </h3>
          <button onClick={onClose} className="p-1 text-text-muted hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-2 flex items-center gap-1 border-b border-border">
          <button
            onClick={() => setTab('providers')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
              tab === 'providers' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            {language === 'zh' ? '模型供应商' : 'Providers'}
          </button>
          <button
            onClick={() => setTab('skills')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
              tab === 'skills' ? 'border-accent text-accent' : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            {language === 'zh' ? 'Skills (提示词)' : 'Skills'}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
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
