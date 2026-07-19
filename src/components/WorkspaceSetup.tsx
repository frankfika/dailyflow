import { motion } from 'motion/react';
import { AlertCircle, Loader2, FolderOpen, ShieldCheck, Search } from 'lucide-react';
import { useState } from 'react';
import { workspacesApi } from '../api/client';

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
  const [isValid, setIsValid] = useState(false);

  const t = {
    title: language === 'zh' ? '每天，只承诺三件事' : 'Commit to three things a day',
    subtitle: language === 'zh'
      ? 'DailyFlow 帮你把不断增长的待办，收敛成今天真正值得完成的三件事。'
      : 'DailyFlow turns an endless task list into three things worth finishing today.',
    pathLabel: language === 'zh' ? '工作区目录' : 'Workspace Directory',
    pickFolderBtn: language === 'zh' ? '选择文件夹…' : 'Choose Folder…',
    noFolderPicked: language === 'zh' ? '尚未选择文件夹' : 'No folder selected',
    pathHint: language === 'zh'
      ? '点击按钮在 Finder 中选择或新建一个文件夹'
      : 'Click the button to select or create a folder in Finder',
    exampleTitle: language === 'zh' ? '你的每日节奏' : 'Your daily rhythm',
    tip1: language === 'zh'
      ? '早上：从待办中选出「今日三件事」'
      : 'Morning: choose your “Today’s Three” from the backlog.',
    tip2: language === 'zh'
      ? '过程中：只盯下一件；晚上：完成就收工，未完成再决定'
      : 'During the day: follow the next step. At night: close the loop without guilt.',
    continueBtn: language === 'zh' ? '开始' : 'Get Started',
    invalidPath: language === 'zh' ? '路径无效或无法创建' : 'Path is invalid or cannot be created',
    missingPath: language === 'zh' ? '请选择一个工作区文件夹' : 'Please choose a workspace folder',
  };

  const handlePickFolder = async () => {
    setIsPickingFolder(true);
    setError('');
    try {
      const picked = await workspacesApi.pickFolder();
      if (picked) {
        setWorkspacePath(picked);
        setIsValid(false);
      }
    } catch (e: any) {
      setError(e.message || t.invalidPath);
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleValidate = async (): Promise<boolean> => {
    if (!workspacePath.trim()) {
      setError(t.missingPath);
      return false;
    }

    setIsValidating(true);
    setError('');

    try {
      const response = await fetch(`/api/config/validate-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath, create: true }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      const result = await response.json();
      if (!result.valid) {
        setIsValid(false);
        setError(result.error || t.invalidPath);
        return false;
      }
      setIsValid(true);
      setError('');
      return true;
    } catch (e: any) {
      setIsValid(false);
      setError(e?.message ? `${t.invalidPath}: ${e.message}` : t.invalidPath);
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleContinue = async () => {
    if (!workspacePath.trim()) {
      setError(t.missingPath);
      return;
    }

    const valid = isValid || (await handleValidate());
    if (!valid) return;

    setIsSaving(true);
    setError('');

    try {
      const name = workspacePath.split('/').filter(Boolean).pop() || 'Workspace';
      await workspacesApi.create(name, workspacePath);
      onComplete();
    } catch (e: any) {
      setError(e.message || (language === 'zh' ? '保存失败，请重试' : 'Failed to save, please try again'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-accent/5 via-background to-accent/10 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-surface-elevated/90 backdrop-blur-2xl rounded-2xl border border-border-strong w-full max-w-lg p-8 shadow-xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent text-white mb-5 shadow-[var(--shadow-accent-glow)]">
            <span className="text-xl font-semibold">3</span>
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
                onChange={e => { setWorkspacePath(e.target.value); setIsValid(false); }}
                placeholder={t.noFolderPicked}
                className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs outline-none focus:border-accent transition-colors font-mono text-text-muted"
              />
              <button
                onClick={handleValidate}
                disabled={isValidating || !workspacePath.trim()}
                // Icon: idle = Search (action prompt), validating = spinner,
                // verified = ShieldCheck (filled accent). Previously used a
                // static Check icon at idle, which users read as "already done"
                // and skipped — leaving Get Started permanently disabled.
                title={isValid ? (language === 'zh' ? '路径已验证' : 'Path verified') : undefined}
                className={`px-2 py-1.5 rounded-md flex items-center gap-1 text-xs font-bold transition-colors disabled:opacity-50 ${
                  isValid
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-accent/10 text-accent hover:bg-accent/20'
                }`}
              >
                {isValidating ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isValid ? (
                  <ShieldCheck className="w-3 h-3" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
                {isValid
                  ? (language === 'zh' ? '已验证' : 'Verified')
                  : (language === 'zh' ? '验证' : 'Validate')}
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
            // !isValid removed: handleContinue re-validates if the user skipped
            // the Check button, so we don't strand them on a permanently-disabled
            // Get Started when the path is clearly filled in.
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
