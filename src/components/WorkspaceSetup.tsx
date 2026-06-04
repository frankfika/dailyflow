import { motion } from 'motion/react';
import { Folder, Check, AlertCircle, Loader2, FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { configApi } from '../api/client';

interface WorkspaceSetupProps {
  onComplete: () => void;
  language: 'en' | 'zh';
}

export function WorkspaceSetup({ onComplete, language }: WorkspaceSetupProps) {
  const [workspacePath, setWorkspacePath] = useState('');
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const t = {
    title: language === 'zh' ? '欢迎使用 DailyFlow' : 'Welcome to DailyFlow',
    subtitle: language === 'zh'
      ? '选一个文件夹放笔记和任务，AI 配置稍后在「模型 & Skills」里加'
      : 'Pick a folder for your notes and tasks. AI providers can be added later in Models & Skills.',
    pathLabel: language === 'zh' ? '工作区目录' : 'Workspace Directory',
    pickFolderBtn: language === 'zh' ? '选择文件夹…' : 'Choose Folder…',
    noFolderPicked: language === 'zh' ? '尚未选择文件夹' : 'No folder selected',
    pathHint: language === 'zh'
      ? '点击按钮在 Finder 中选择或新建一个文件夹'
      : 'Click the button to select or create a folder in Finder',
    exampleTitle: language === 'zh' ? '小贴士：' : 'Tips:',
    tip1: language === 'zh'
      ? '工作区是一个普通文件夹，你可以随时用任何编辑器打开里面的 .md 文件'
      : 'The workspace is a plain folder. You can open .md files with any editor anytime.',
    tip2: language === 'zh'
      ? 'AI 模型支持稍后在 AI Chat → 模型 & Skills 中配置（DeepSeek / Kimi / MiniMax / GLM 等）'
      : 'AI models can be configured later via AI Chat → Models & Skills (DeepSeek / Kimi / MiniMax / GLM, etc.)',
    continueBtn: language === 'zh' ? '开始' : 'Get Started',
    invalidPath: language === 'zh' ? '路径无效或无法创建' : 'Path is invalid or cannot be created',
    missingPath: language === 'zh' ? '请选择一个工作区文件夹' : 'Please choose a workspace folder',
  };

  const handlePickFolder = async () => {
    setIsPickingFolder(true);
    setError('');
    try {
      const res = await fetch('/api/config/choose-folder');
      // 400 = user cancelled the dialog. Silently dismiss; not an error.
      if (res.status === 400) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to pick folder');
      }
      const data = await res.json();
      if (data.path) {
        setWorkspacePath(data.path);
      }
    } catch (e: any) {
      setError(e.message || t.invalidPath);
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleValidate = async () => {
    if (!workspacePath.trim()) {
      setError(t.missingPath);
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const response = await fetch(`/api/config/validate-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, create: true }),
      });

      if (!response.ok) throw new Error('Validation failed');

      const result = await response.json();
      if (!result.valid) {
        setError(t.invalidPath);
      }
    } catch (e) {
      setError(t.invalidPath);
    } finally {
      setIsValidating(false);
    }
  };

  const handleContinue = async () => {
    if (!workspacePath.trim()) {
      setError(t.missingPath);
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await configApi.update({
        workspaceRoot: workspacePath,
        dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
        rolloverTrigger: 'manual',
        rolloverSkipTags: ['no-rollover'],
      });
      onComplete();
    } catch (e) {
      setError(language === 'zh' ? '保存失败，请重试' : 'Failed to save, please try again');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-accent/5 via-background to-accent/10 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-background rounded-md border border-border w-full max-w-lg p-8 shadow-sm"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-md bg-accent/10 mb-4">
            <Folder className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.subtitle}</p>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Workspace Path */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t.pathLabel}</label>

            {/* Primary: Choose Folder button */}
            <button
              onClick={handlePickFolder}
              disabled={isPickingFolder}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md border border-dashed border-border hover:border-accent hover:bg-accent/5 transition-all text-sm font-medium text-text-heading disabled:opacity-50"
            >
              {isPickingFolder ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderOpen className="w-4 h-4" />
              )}
              {workspacePath ? (
                <span className="truncate max-w-[280px]">{workspacePath}</span>
              ) : (
                t.pickFolderBtn
              )}
            </button>

            {/* Fallback: manual path input (small, below) */}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={workspacePath}
                onChange={e => setWorkspacePath(e.target.value)}
                placeholder={t.noFolderPicked}
                className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs outline-none focus:border-accent transition-colors font-mono text-text-muted"
              />
              <button
                onClick={handleValidate}
                disabled={isValidating}
                className="px-2 py-1.5 rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 flex items-center gap-1 text-xs font-bold "
              >
                {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {language === 'zh' ? '验证' : 'Check'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-muted">{t.pathHint}</p>
          </div>

          {/* Tips */}
          <div className="bg-accent/5 rounded-md p-4 space-y-1.5">
            <p className="text-sm font-medium">{t.exampleTitle}</p>
            <ul className="text-xs text-text-muted space-y-1">
              <li>• {t.tip1}</li>
              <li>• {t.tip2}</li>
            </ul>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Continue Button */}
          <button
            onClick={handleContinue}
            disabled={isSaving || !workspacePath.trim()}
            className="w-full py-3 rounded-md bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {language === 'zh' ? '保存中…' : 'Saving…'}
              </>
            ) : (
              t.continueBtn
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
