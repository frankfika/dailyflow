import React from 'react';
import { motion } from 'motion/react';
import { FileText, Mic, Sparkles, Clock, Trash2, Edit2, Users, Link } from 'lucide-react';
import type { NoteData } from '../api/client';
import { getTagColor } from '../utils/tagColors';

interface NoteCardProps {
  note: NoteData;
  language: 'en' | 'zh';
  compact?: boolean;
  activeContext?: 'work' | 'life';
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  onMentionClick?: (mention: string) => void;
}

const typeConfigWork = {
  note: { icon: FileText, label: 'Note', labelZh: '笔记', color: 'bg-stone-50 text-stone-600 border-stone-200' },
  meeting_note: { icon: Mic, label: 'Meeting', labelZh: '会议', color: 'bg-surface text-text-main border-transparent' },
  summary: { icon: Sparkles, label: 'Summary', labelZh: '总结', color: 'bg-surface text-text-main border-transparent' },
};

const typeConfigLife = {
  note: { icon: FileText, label: 'Note', labelZh: '笔记', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  meeting_note: { icon: Mic, label: 'Meeting', labelZh: '会议', color: 'bg-surface text-text-main border-transparent' },
  summary: { icon: Sparkles, label: 'Summary', labelZh: '总结', color: 'bg-surface text-text-main border-transparent' },
};

function renderBodyWithMentions(body: string, onMentionClick?: (m: string) => void) {
  // Remove markdown heading lines
  const cleanBody = body.split('\n').filter(l => !l.startsWith('# ')).join('\n').trim();
  if (!cleanBody) return null;

  // Truncate to ~200 chars for preview
  const preview = cleanBody.length > 200 ? cleanBody.slice(0, 200) + '...' : cleanBody;

  // Split by @mentions and render with highlighting
  const parts = preview.split(/(@[\w一-龥-]+)/g);
  return (
    <span className="text-[13px] text-text-muted/80 leading-relaxed">
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const name = part.slice(1);
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onMentionClick?.(name); }}
              className="text-accent font-bold hover:underline"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  language,
  compact = false,
  activeContext = 'work',
  onEdit,
  onDelete,
  onClick,
  onMentionClick,
}) => {
  const config = (activeContext === 'life' ? typeConfigLife : typeConfigWork)[note.type];
  const TypeIcon = config.icon;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onClick}
        className="group flex items-center gap-3 px-4 py-3 rounded-md bg-surface-white border border-border/60 hover:border-accent/30 cursor-pointer transition-all hover:shadow-sm"
      >
        <TypeIcon className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        <span className="font-sans text-sm text-text-heading truncate flex-1">{note.title}</span>
        {note.time && (
          <span className="text-xs text-text-muted font-mono">{note.time}</span>
        )}
        {note.mentions.length > 0 && (
          <span className="text-xs text-accent font-bold">
            @{note.mentions[0]}{note.mentions.length > 1 && ` +${note.mentions.length - 1}`}
          </span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      whileHover={{ scale: 1.005 }}
      onClick={onClick}
      className="group relative floating-card rounded-md p-5 cursor-pointer"
    >
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center border ${config.color}`}>
          <TypeIcon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 pr-16">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-sans text-lg text-text-heading truncate">{note.title}</h3>
          </div>

          {note.type === 'meeting_note' && note.participants && note.participants.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2 text-[11px] text-text-muted">
              <Users className="w-3 h-3" />
              <span>{note.participants.join(', ')}</span>
            </div>
          )}

          {!compact && (
            <div className="mt-2 mb-1 line-clamp-3">
              {renderBodyWithMentions(note.body, onMentionClick)}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2">
            {note.time && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface text-xs text-text-muted font-mono border border-border/50">
                <Clock className="w-2.5 h-2.5" />
                {note.time}{note.endTime && `–${note.endTime}`}
              </span>
            )}

            <span className={`px-2 py-0.5 rounded-md text-xs font-bold  border ${config.color}`}>
              {language === 'zh' ? config.labelZh : config.label}
            </span>

            {note.mentions.map(mention => (
              <button
                key={mention}
                onClick={(e) => { e.stopPropagation(); onMentionClick?.(mention); }}
                className="px-2 py-0.5 rounded text-xs font-bold bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                @{mention}
              </button>
            ))}

            {note.tags.filter(t => !['work', 'life'].includes(t)).map(tag => (
              <span key={tag} className={`px-2 py-0.5 rounded-md text-xs font-bold  border ${getTagColor(tag)}`}>
                #{tag}
              </span>
            ))}

            {note.linkedTaskIds.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface text-xs text-text-muted border border-border/50">
                <Link className="w-2.5 h-2.5" />
                {note.linkedTaskIds.length} {language === 'zh' ? '任务' : 'tasks'}
              </span>
            )}
          </div>
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1.5 text-text-muted hover:text-accent transition-colors rounded-md"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 text-text-muted hover:text-stone-500 transition-colors rounded-md"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="absolute top-5 right-5 group-hover:opacity-0 transition-opacity text-xs text-text-muted font-mono pointer-events-none">
        {note.date}
      </div>
    </motion.div>
  );
};
