import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, FileText, Mic, Sparkles, Plus, Calendar, Clock, Link2, Check } from 'lucide-react';
import type { NoteData } from '../api/client';
import { getTagColor } from '../utils/tagColors';

interface AvailableTask {
  id: string;
  title: string;
}

interface AvailableProject {
  id: string;
  name: string;
}

interface NoteEditorProps {
  note?: NoteData | null;
  language: 'en' | 'zh';
  activeContext: 'work' | 'life';
  availableTasks?: AvailableTask[];
  availableProjects?: AvailableProject[];
  onSave: (data: Omit<NoteData, 'id' | 'createdAt' | 'updatedAt' | 'filePath' | 'mentions'>) => void;
  onClose: () => void;
}

const typeOptions = [
  { value: 'note' as const, icon: FileText, label: 'Note', labelZh: '笔记' },
  { value: 'meeting_note' as const, icon: Mic, label: 'Meeting', labelZh: '会议' },
  { value: 'summary' as const, icon: Sparkles, label: 'Summary', labelZh: '总结' },
];

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  language,
  activeContext,
  availableTasks = [],
  availableProjects = [],
  onSave,
  onClose,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  const [type, setType] = useState<NoteData['type']>(note?.type || 'note');
  const [title, setTitle] = useState(note?.title || '');
  const [body, setBody] = useState(note?.body || '');
  const [date, setDate] = useState(note?.date || today);
  const [time, setTime] = useState(note?.time || nowTime);
  const [endTime, setEndTime] = useState(note?.endTime || '');
  const [tags, setTags] = useState<string[]>(note?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [participants, setParticipants] = useState<string[]>(note?.participants || []);
  const [participantInput, setParticipantInput] = useState('');
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>(note?.linkedTaskIds || []);
  const [linkedProjectIds, setLinkedProjectIds] = useState<string[]>(note?.linkedProjectIds || []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleSave = () => {
    if (!title.trim()) return;
    const fullBody = body.startsWith('# ') ? body : `# ${title}\n\n${body}`;
    onSave({
      title: title.trim(),
      body: fullBody,
      type,
      date,
      time: time || undefined,
      endTime: endTime || undefined,
      context: activeContext,
      tags,
      linkedTaskIds,
      linkedProjectIds,
      participants: type === 'meeting_note' ? participants : undefined,
    });
  };

  const addTag = (value: string) => {
    const t = value.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
  };

  const addParticipant = (value: string) => {
    const p = value.trim();
    if (p && !participants.includes(p)) setParticipants([...participants, p]);
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface-white border border-border shadow-xl rounded-[32px] p-8 max-w-2xl w-full relative flex flex-col max-h-[90vh] overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-text-muted hover:text-text-heading transition-colors">
          <X className="w-5 h-5" />
        </button>

        <h2 className="font-serif text-2xl text-text-heading mb-6">
          {note ? (language === 'zh' ? '编辑笔记' : 'Edit Note') : (language === 'zh' ? '新建笔记' : 'New Note')}
        </h2>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Type selector */}
          <div className="flex gap-2">
            {typeOptions.map(opt => {
              const Icon = opt.icon;
              const active = type === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
                    active ? 'bg-accent text-white border-accent shadow-sm' : 'bg-surface text-text-muted border-border hover:border-accent/50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {language === 'zh' ? opt.labelZh : opt.label}
                </button>
              );
            })}
          </div>

          {/* Title */}
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={language === 'zh' ? '标题...' : 'Title...'}
            className="w-full bg-transparent border-b border-border focus:border-accent outline-none font-serif text-xl text-text-heading pb-2 transition-colors"
          />

          {/* Date & Time */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface text-text-muted text-xs">
              <Calendar className="w-3.5 h-3.5" />
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-transparent outline-none text-[11px] font-mono" />
            </label>
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface text-text-muted text-xs">
              <Clock className="w-3.5 h-3.5" />
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="bg-transparent outline-none text-[11px] font-mono" />
            </label>
            {type === 'meeting_note' && (
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-surface text-text-muted text-xs">
                <span className="text-[10px]">→</span>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-transparent outline-none text-[11px] font-mono" />
              </label>
            )}
          </div>

          {/* Participants (meeting only) */}
          {type === 'meeting_note' && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted">
                {language === 'zh' ? '参会人' : 'Participants'}
              </label>
              <div className="flex flex-wrap gap-2">
                {participants.map(p => (
                  <span key={p} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-600 border border-purple-200 text-[10px] font-bold">
                    @{p}
                    <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-500" onClick={() => setParticipants(participants.filter(x => x !== p))} />
                  </span>
                ))}
                <input
                  value={participantInput}
                  onChange={e => setParticipantInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && participantInput.trim()) {
                      e.preventDefault();
                      addParticipant(participantInput);
                      setParticipantInput('');
                    }
                  }}
                  placeholder={language === 'zh' ? '+ 添加参会人' : '+ Add participant'}
                  className="bg-surface border border-border rounded-full px-2.5 py-1 text-[10px] outline-none focus:border-accent w-28 transition-colors"
                />
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted">
              {language === 'zh' ? '标签' : 'Tags'}
            </label>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border ${getTagColor(tag)}`}>
                  #{tag}
                  <X className="w-2.5 h-2.5 cursor-pointer hover:text-red-500" onClick={() => setTags(tags.filter(t => t !== tag))} />
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ' ' || e.key === ',') && tagInput.trim()) {
                    e.preventDefault();
                    addTag(tagInput);
                    setTagInput('');
                  }
                }}
                placeholder={language === 'zh' ? '+ 标签' : '+ Tag'}
                className="bg-surface border border-border rounded-lg px-2.5 py-1 text-[10px] outline-none focus:border-accent w-20 transition-colors"
              />
            </div>
          </div>

          {/* Linked Tasks */}
          {availableTasks.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                <Link2 className="w-3 h-3" />
                {language === 'zh' ? '关联任务' : 'Linked Tasks'}
              </label>
              <div className="flex flex-wrap gap-2">
                {availableTasks.map(task => (
                  <button
                    key={task.id}
                    onClick={() => {
                      setLinkedTaskIds(prev =>
                        prev.includes(task.id)
                          ? prev.filter(id => id !== task.id)
                          : [...prev, task.id]
                      );
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                      linkedTaskIds.includes(task.id)
                        ? 'bg-accent/10 text-accent border-accent/30'
                        : 'bg-surface text-text-muted border-border hover:border-accent/30'
                    }`}
                  >
                    {linkedTaskIds.includes(task.id) && <Check className="w-3 h-3" />}
                    <span className="truncate max-w-[180px]">{task.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Linked Projects */}
          {availableProjects.length > 0 && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                <Link2 className="w-3 h-3" />
                {language === 'zh' ? '关联项目' : 'Linked Projects'}
              </label>
              <div className="flex flex-wrap gap-2">
                {availableProjects.map(project => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setLinkedProjectIds(prev =>
                        prev.includes(project.id)
                          ? prev.filter(id => id !== project.id)
                          : [...prev, project.id]
                      );
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                      linkedProjectIds.includes(project.id)
                        ? 'bg-accent/10 text-accent border-accent/30'
                        : 'bg-surface text-text-muted border-border hover:border-accent/30'
                    }`}
                  >
                    {linkedProjectIds.includes(project.id) && <Check className="w-3 h-3" />}
                    <span className="truncate max-w-[180px]">{project.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted">
              {language === 'zh' ? '内容' : 'Content'}
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={language === 'zh' ? '写点什么... (支持 Markdown，用 @提及人)' : 'Write something... (Markdown supported, use @ to mention)'}
              rows={8}
              className="w-full bg-surface border border-border rounded-2xl p-4 text-sm text-text-main outline-none focus:border-accent resize-none transition-colors font-mono leading-relaxed"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-5 mt-4 border-t border-border/50">
          <button
            onClick={onClose}
            className="px-5 py-2 text-text-muted hover:text-text-heading text-xs uppercase font-bold tracking-widest transition-colors"
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="px-6 py-2 bg-accent text-white rounded-xl text-xs uppercase font-bold tracking-widest hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
