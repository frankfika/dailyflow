import { motion } from 'motion/react';
import { Folder, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { configApi } from '../api/client';

interface WorkspaceSetupProps {
  onComplete: () => void;
  language: 'en' | 'zh';
}

export function WorkspaceSetup({ onComplete, language }: WorkspaceSetupProps) {
  const [workspacePath, setWorkspacePath] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const t = {
    title: language === 'zh' ? '欢迎使用 DailyFlow' : 'Welcome to DailyFlow',
    subtitle: language === 'zh'
      ? '请选择你的工作区目录，这是存储所有日记和任务的地方'
      : 'Choose your workspace directory where all notes and tasks will be stored',
    pathLabel: language === 'zh' ? '工作区路径' : 'Workspace Path',
    pathPlaceholder: language === 'zh'
      ? '例如：/Users/你的用户名/Documents/Notes'
      : 'e.g., /Users/yourname/Documents/Notes',
    browseBtn: language === 'zh' ? '浏览...' : 'Browse...',
    exampleTitle: language === 'zh' ? '示例：' : 'Examples:',
    example1: language === 'zh'
      ? 'Obsidian 目录：/Users/你的用户名/Documents/Obsidian'
      : 'Obsidian vault: /Users/yourname/Documents/Obsidian',
    example2: language === 'zh'
      ? '新建目录：/Users/你的用户名/Documents/DailyFlow'
      : 'New directory: /Users/yourname/Documents/DailyFlow',
    validateBtn: language === 'zh' ? '验证路径' : 'Validate Path',
    continueBtn: language === 'zh' ? '继续' : 'Continue',
    validPath: language === 'zh' ? '路径有效' : 'Path is valid',
    invalidPath: language === 'zh' ? '路径无效或不存在' : 'Path is invalid or does not exist',
  };

  const handleValidate = async () => {
    if (!workspacePath.trim()) {
      setError(language === 'zh' ? '请输入工作区路径' : 'Please enter workspace path');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      // 验证路径（通过后端 API）
      const response = await fetch(`http://localhost:3003/api/config/validate-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath }),
      });

      if (!response.ok) {
        throw new Error('Validation failed');
      }

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
      setError(language === 'zh' ? '请输入工作区路径' : 'Please enter workspace path');
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
        className="bg-background rounded-2xl border border-border w-full max-w-2xl p-8 shadow-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 mb-4">
            <Folder className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t.title}</h1>
          <p className="text-muted-foreground">{t.subtitle}</p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">{t.pathLabel}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workspacePath}
                onChange={e => setWorkspacePath(e.target.value)}
                placeholder={t.pathPlaceholder}
                className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={handleValidate}
                disabled={isValidating}
                className="px-4 py-3 rounded-xl bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isValidating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {t.validateBtn}
              </button>
            </div>
            {error && (
              <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>

          {/* Examples */}
          <div className="bg-accent/5 rounded-xl p-4">
            <p className="text-sm font-medium mb-2">{t.exampleTitle}</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• {t.example1}</li>
              <li>• {t.example2}</li>
            </ul>
          </div>

          {/* Continue Button */}
          <button
            onClick={handleContinue}
            disabled={isSaving || !workspacePath.trim()}
            className="w-full py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {language === 'zh' ? '保存中...' : 'Saving...'}
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
