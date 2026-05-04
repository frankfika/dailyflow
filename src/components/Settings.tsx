import { motion } from 'motion/react';
import { X, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { configApi } from '../api/client';
import type { ConfigData } from '../types/task';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  language: 'en' | 'zh';
  onLanguageChange: (lang: 'en' | 'zh') => void;
  syncInterval: number;
  onSyncIntervalChange: (interval: number) => void;
}

export function Settings({
  isOpen,
  onClose,
  language,
  onLanguageChange,
  syncInterval,
  onSyncIntervalChange,
}: SettingsProps) {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const data = await configApi.get();
      setConfig(data);
    } catch (e) {
      console.error('Failed to load config', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      await configApi.update(config);
      onClose();
    } catch (e) {
      console.error('Failed to save config', e);
    } finally {
      setIsSaving(false);
    }
  };

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
        className="bg-background rounded-2xl border border-border w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Language */}
            <div>
              <label className="block text-sm font-medium mb-2">Language</label>
              <select
                value={language}
                onChange={e => onLanguageChange(e.target.value as 'en' | 'zh')}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>

            {/* Sync Interval */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Auto-sync Interval (minutes)
              </label>
              <select
                value={syncInterval}
                onChange={e => onSyncIntervalChange(Number(e.target.value))}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
              >
                <option value="0">Disabled</option>
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="30">30 minutes</option>
              </select>
            </div>

            {/* Workspace Path (read-only) */}
            {config && (
              <div>
                <label className="block text-sm font-medium mb-2">Workspace</label>
                <div className="bg-accent/5 rounded-xl px-4 py-3 text-sm font-mono text-muted-foreground break-all">
                  {config.workspaceRoot}
                </div>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
