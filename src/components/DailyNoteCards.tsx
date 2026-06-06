import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, Plus } from 'lucide-react';
import type { NoteData } from '../api/client';
import { NoteCard } from './NoteCard';

interface DailyNoteCardsProps {
  notes: NoteData[];
  language: 'en' | 'zh';
  activeContext?: 'work' | 'life';
  onViewAll?: () => void;
  onMentionClick?: (mention: string) => void;
  onAddNote?: () => void;
  onNoteClick?: (note: NoteData) => void;
}

export const DailyNoteCards: React.FC<DailyNoteCardsProps> = ({
  notes,
  language,
  activeContext = 'work',
  onViewAll,
  onMentionClick,
  onAddNote,
  onNoteClick,
}) => {
  const displayNotes = notes.slice(0, 5);
  const hasMore = notes.length > 5;
  const isEmpty = notes.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-sans text-xs text-text-muted font-bold flex items-center gap-2">
          <FileText className="w-3 h-3" />
          {language === 'zh' ? '今日笔记' : "Today's Notes"}
          {!isEmpty && <span className="text-accent">({notes.length})</span>}
        </h2>
        <div className="flex items-center gap-3">
          {hasMore && onViewAll && (
            <button
              onClick={onViewAll}
              className="text-xs text-accent font-bold hover:underline"
            >
              {language === 'zh' ? '查看全部 →' : 'View all →'}
            </button>
          )}
          {onAddNote && (
            <button
              onClick={onAddNote}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-xs font-bold"
              title={language === 'zh' ? '新建笔记' : 'New note'}
            >
              <Plus className="w-3 h-3" />
              {language === 'zh' ? '笔记' : 'Note'}
            </button>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div
          onClick={onAddNote}
          className="border border-dashed border-border/60 rounded-lg py-6 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-colors"
        >
          <p className="text-xs text-text-muted opacity-70">
            {language === 'zh' ? '今天还没有笔记，点此新建' : 'No notes yet — click to add'}
          </p>
        </div>
      ) : (
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
                onClick={() => onNoteClick ? onNoteClick(note) : onViewAll?.()}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};
