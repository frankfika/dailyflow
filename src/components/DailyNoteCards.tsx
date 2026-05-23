import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText } from 'lucide-react';
import type { NoteData } from '../api/client';
import { NoteCard } from './NoteCard';

interface DailyNoteCardsProps {
  notes: NoteData[];
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  onViewAll?: () => void;
  onMentionClick?: (mention: string) => void;
}

export const DailyNoteCards: React.FC<DailyNoteCardsProps> = ({
  notes,
  language,
  activeContext = 'work',
  onViewAll,
  onMentionClick,
}) => {
  if (notes.length === 0) return null;

  const displayNotes = notes.slice(0, 5);
  const hasMore = notes.length > 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-xs  text-text-muted font-bold flex items-center gap-2">
          <FileText className="w-3 h-3" />
          {language === 'zh' ? '笔记' : 'Notes'}
          <span className="text-accent">({notes.length})</span>
        </h2>
        {hasMore && onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-accent font-bold  hover:underline"
          >
            {language === 'zh' ? '查看全部 →' : 'View all →'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {displayNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              language={language}
              compact
              activeContext={activeContext}
              onMentionClick={onMentionClick}
              onClick={onViewAll}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
