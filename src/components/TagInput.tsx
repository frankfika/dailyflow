import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Tag, Plus } from 'lucide-react';
import { getTagColor } from '../utils/tagColors';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  availableTags?: string[];
  language: 'en' | 'zh';
  placeholder?: string;
}

export function TagInput({ tags, onChange, availableTags, language, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredTags = (availableTags || [])
    .filter(t => !tags.includes(t))
    .filter(t => t.toLowerCase().includes(inputValue.toLowerCase()));

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    } else if ((e.key === 'Enter' || e.key === ',') && !isComposing && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const val = inputValue.trim().toLowerCase();
      if (val && !tags.includes(val)) {
        onChange([...tags, val]);
        setInputValue('');
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(t => t !== tagToRemove));
  };

  const addTag = (tag: string) => {
    if (!tags.includes(tag)) {
      onChange([...tags, tag]);
      setInputValue('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        className={`flex flex-wrap items-center gap-1.5 p-1.5 bg-surface border rounded-md transition-colors cursor-text ${
          isFocused ? 'border-accent/40 shadow-sm ring-1 ring-accent/10' : 'border-border/80'
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        <Tag className="w-3.5 h-3.5 ml-1 text-text-muted opacity-50 shrink-0" />
        {tags.map(tag => (
          <span 
            key={tag} 
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-bold border ${getTagColor(tag)}`}
          >
            {tag}
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="opacity-50 hover:opacity-100 focus:outline-none"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[100px] bg-transparent border-none outline-none text-[13px] font-medium text-text-heading placeholder:text-text-muted/60"
          placeholder={tags.length === 0 ? (placeholder || (language === 'zh' ? '添加标签...' : 'Add tags...')) : ''}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onKeyDown={handleKeyDown}
        />
      </div>

      <AnimatePresence>
        {isFocused && (filteredTags.length > 0 || inputValue.trim()) && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface-white border border-border rounded-md shadow-lg z-50 p-1 space-y-0.5"
          >
            {inputValue.trim() && !tags.includes(inputValue.trim().toLowerCase()) && !filteredTags.includes(inputValue.trim().toLowerCase()) && (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left rounded-sm hover:bg-surface text-text-heading transition-colors"
                onClick={() => addTag(inputValue.trim().toLowerCase())}
              >
                <Plus className="w-3.5 h-3.5 text-accent opacity-70" />
                <span>{language === 'zh' ? `创建 "${inputValue.trim()}"` : `Create "${inputValue.trim()}"`}</span>
              </button>
            )}
            {filteredTags.map(tag => (
              <button
                key={tag}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left rounded-sm hover:bg-surface text-text-heading transition-colors"
                onClick={() => addTag(tag)}
              >
                <span className={`w-2 h-2 rounded-full border ${getTagColor(tag).replace('text-', 'border-').replace('bg-', 'bg-')}`} />
                {tag}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
