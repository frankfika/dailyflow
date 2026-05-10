import { motion } from 'motion/react';
import { X, Loader2, Folder, Check, AlertCircle, Github } from 'lucide-react';
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
  const [isEditingWorkspace, setIsEditingWorkspace] = useState(false);
  const [newWorkspacePath, setNewWorkspacePath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [isValidatingGithub, setIsValidatingGithub] = useState(false);
  const [githubValidationResult, setGithubValidationResult] = useState<{ valid: boolean; error?: string; repoName?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  useEffect(() => {
    if (config?.githubRepo) {
      setGithubRepo(config.githubRepo);
    }
  }, [config]);

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

  const handleValidateWorkspace = async () => {
    if (!newWorkspacePath.trim()) {
      setValidationError(language === 'zh' ? '请输入工作区路径' : 'Please enter workspace path');
      return;
    }

    setIsValidating(true);
    setValidationError('');

    try {
      const response = await fetch('/api/config/validate-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newWorkspacePath }),
      });

      const result = await response.json();
      if (!result.valid) {
        setValidationError(language === 'zh' ? '路径无效或不存在' : 'Path is invalid or does not exist');
      }
    } catch (e) {
      setValidationError(language === 'zh' ? '验证失败' : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSaveWorkspace = async () => {
    if (!config || !newWorkspacePath.trim()) return;

    setIsSaving(true);
    try {
      await configApi.update({
        ...config,
        workspaceRoot: newWorkspacePath,
      });
      setIsEditingWorkspace(false);
      setNewWorkspacePath('');
      await loadConfig();
      // Reload the app to apply new workspace
      window.location.reload();
    } catch (e) {
      console.error('Failed to save workspace', e);
      setValidationError(language === 'zh' ? '保存失败' : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      await configApi.update({
        ...config,
        githubRepo: githubRepo || undefined,
      });
      onClose();
    } catch (e) {
      console.error('Failed to save config', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleValidateGithub = async () => {
    if (!githubRepo.trim()) {
      setGithubValidationResult({ valid: false, error: language === 'zh' ? '请输入 GitHub 仓库链接' : 'Please enter GitHub repository URL' });
      return;
    }

    setIsValidatingGithub(true);
    setGithubValidationResult(null);

    try {
      const response = await fetch('/api/config/validate-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubRepo }),
      });

      const result = await response.json();
      setGithubValidationResult(result);
    } catch (e) {
      setGithubValidationResult({ valid: false, error: language === 'zh' ? '验证失败' : 'Validation failed' });
    } finally {
      setIsValidatingGithub(false);
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

            {/* Workspace Path */}
            {config && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {language === 'zh' ? '工作区路径' : 'Workspace Path'}
                </label>
                {isEditingWorkspace ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newWorkspacePath}
                        onChange={e => setNewWorkspacePath(e.target.value)}
                        placeholder={config.workspaceRoot}
                        className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
                      />
                      <button
                        onClick={handleValidateWorkspace}
                        disabled={isValidating}
                        className="px-4 py-3 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {isValidating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {validationError && (
                      <div className="flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle className="w-4 h-4" />
                        {validationError}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveWorkspace}
                        disabled={isSaving || !newWorkspacePath.trim() || !!validationError}
                        className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                      >
                        {language === 'zh' ? '保存' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingWorkspace(false);
                          setNewWorkspacePath('');
                          setValidationError('');
                        }}
                        className="flex-1 py-2 rounded-xl bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
                      >
                        {language === 'zh' ? '取消' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <div className="flex-1 bg-accent/5 rounded-xl px-4 py-3 text-sm font-mono text-muted-foreground break-all">
                      {config.workspaceRoot}
                    </div>
                    <button
                      onClick={() => {
                        setIsEditingWorkspace(true);
                        setNewWorkspacePath(config.workspaceRoot);
                      }}
                      className="px-4 py-3 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors flex items-center gap-2"
                    >
                      <Folder className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* GitHub Repository */}
            {config && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  {language === 'zh' ? 'GitHub 仓库' : 'GitHub Repository'}
                </label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={githubRepo}
                      onChange={e => setGithubRepo(e.target.value)}
                      placeholder="https://github.com/username/repo"
                      className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
                    />
                    <button
                      onClick={handleValidateGithub}
                      disabled={isValidatingGithub}
                      className="px-4 py-3 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isValidatingGithub ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Github className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {githubValidationResult && (
                    <div className={`flex items-center gap-2 text-sm ${githubValidationResult.valid ? 'text-green-600' : 'text-red-600'}`}>
                      {githubValidationResult.valid ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>{githubValidationResult.repoName || (language === 'zh' ? '仓库验证成功' : 'Repository verified')}</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          <span>{githubValidationResult.error}</span>
                        </>
                      )}
                    </div>
                  )}
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
