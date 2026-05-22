/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion } from 'motion/react';
import { X, Eye, EyeOff, Loader2, Download, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { configApi, aiApi } from '../api/client';
import { API_BASE, DEFAULT_MODEL } from '../config/api';
import { checkForUpdates, type UpdateInfo } from '../api/updater';

declare const __APP_VERSION__: string;

interface SettingsModalProps {
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  language: 'en' | 'zh';
  configTab: 'general' | 'ai' | 'github' | 'about';
  setConfigTab: (tab: 'general' | 'ai' | 'github' | 'about') => void;
  workspaceRoot: string;
  setWorkspaceRoot: (v: string) => void;
  setLanguage: (v: 'en' | 'zh') => void;
  aiProvider: 'deepseek' | 'anthropic' | 'openai' | 'custom';
  setAiProvider: (v: 'deepseek' | 'anthropic' | 'openai' | 'custom') => void;
  aiApiKey: string;
  setAiApiKey: (v: string) => void;
  aiModel: string;
  setAiModel: (v: string) => void;
  aiBaseUrl: string;
  setAiBaseUrl: (v: string) => void;
  aiFormat: 'openai' | 'anthropic';
  setAiFormat: (v: 'openai' | 'anthropic') => void;
  showApiKey: boolean;
  setShowApiKey: (v: boolean) => void;
  aiVerifyStatus: 'idle' | 'loading' | 'success' | 'error';
  setAiVerifyStatus: (v: 'idle' | 'loading' | 'success' | 'error') => void;
  aiVerifyMsg: string;
  setAiVerifyMsg: (v: string) => void;
  syncInterval: number;
  setSyncInterval: (v: number) => void;
  githubRepoInput: string;
  setGithubRepoInput: (v: string) => void;
  githubToken: string;
  setGithubToken: (v: string) => void;
  showGithubToken: boolean;
  setShowGithubToken: (v: boolean) => void;
  githubVerifyStatus: 'idle' | 'loading' | 'success' | 'error';
  setGithubVerifyStatus: (v: 'idle' | 'loading' | 'success' | 'error') => void;
  githubVerifyMsg: string;
  setGithubVerifyMsg: (v: string) => void;
  setGithubRepo: (v: string | null) => void;
  setGithubConnected: (v: boolean) => void;
  setFilesMap: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  setTasks: (v: any[] | ((prev: any[]) => any[])) => void;
  setMarkdown: (v: string) => void;
  setLastSyncedMD: (v: string) => void;
  currentFileDate: string;
  verifyGithubConnection: (repoUrl: string, token: string) => Promise<boolean>;
  filesApi: { list: () => Promise<string[]>; get: (date: string) => Promise<{ content: string; tasks: any[]; date: string } | null>; };
}

export function SettingsModal({
  showSettings,
  setShowSettings,
  language,
  configTab,
  setConfigTab,
  workspaceRoot,
  setWorkspaceRoot,
  setLanguage,
  aiProvider,
  setAiProvider,
  aiApiKey,
  setAiApiKey,
  aiModel,
  setAiModel,
  aiBaseUrl,
  setAiBaseUrl,
  aiFormat,
  setAiFormat,
  showApiKey,
  setShowApiKey,
  aiVerifyStatus,
  setAiVerifyStatus,
  aiVerifyMsg,
  setAiVerifyMsg,
  syncInterval,
  setSyncInterval,
  githubRepoInput,
  setGithubRepoInput,
  githubToken,
  setGithubToken,
  showGithubToken,
  setShowGithubToken,
  githubVerifyStatus,
  setGithubVerifyStatus,
  githubVerifyMsg,
  setGithubVerifyMsg,
  setGithubRepo,
  setGithubConnected,
  setFilesMap,
  setTasks,
  setMarkdown,
  setLastSyncedMD,
  currentFileDate,
  verifyGithubConnection,
  filesApi,
}: SettingsModalProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem('df_last_update_check');
    } catch {
      return null;
    }
  });

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    try {
      const info = await checkForUpdates();
      setUpdateInfo(info);
      const now = new Date().toISOString();
      setLastCheckTime(now);
      try {
        localStorage.setItem('df_last_update_check', now);
      } catch {
        // ignore
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const formatCheckTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-white border border-border shadow-xl rounded-[24px] w-full max-w-2xl relative flex flex-col max-h-[90vh]"
      >
        {/* Header with Close Button */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <h2 className="font-serif text-2xl text-text-heading italic">
            {language === 'zh' ? '全局设置' : 'Configuration'}
          </h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-2 text-text-muted hover:text-text-heading transition-colors rounded-lg hover:bg-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          <button
            onClick={() => setConfigTab('general')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
              configTab === 'general'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            {language === 'zh' ? '通用' : 'General'}
          </button>
          <button
            onClick={() => setConfigTab('ai')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
              configTab === 'ai'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            AI
          </button>
          <button
            onClick={() => setConfigTab('github')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
              configTab === 'github'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            GitHub
          </button>
          <button
            onClick={() => setConfigTab('about')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
              configTab === 'about'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            {language === 'zh' ? '关于' : 'About'}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 space-y-5">
          {configTab === 'general' && (
            <div className="space-y-5">
              {/* Workspace Path */}
              <div>
                <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted mb-2">
                  {language === 'zh' ? '工作区路径' : 'Workspace Path'}
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={workspaceRoot}
                    onChange={e => setWorkspaceRoot(e.target.value)}
                    placeholder={language === 'zh' ? '工作区目录路径' : 'Workspace directory path'}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono"
                  />
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/config/choose-folder');
                        if (res.ok) {
                          const data = await res.json();
                          if (data.path) {
                            setWorkspaceRoot(data.path);
                          }
                        } else {
                          const error = await res.json();
                          alert(error.error || 'Failed to open folder picker');
                        }
                      } catch (e: any) {
                        alert('Failed to open folder picker: ' + e.message);
                      }
                    }}
                    className="px-3 py-2 bg-accent text-white rounded-lg text-xs uppercase font-bold tracking-widest hover:bg-accent/90 transition-colors whitespace-nowrap"
                  >
                    {language === 'zh' ? '浏览' : 'Browse'}
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-1">{language === 'zh' ? '修改后需重启应用生效' : 'Restart app after changing'}</p>
              </div>

              <hr className="border-border" />

              {/* Language */}
              <div>
                <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted mb-2">
                  {language === 'zh' ? '界面语言' : 'Language'}
                </h3>
                <div className="flex bg-surface p-1 rounded-lg shadow-inner border border-border/50 gap-1">
                  <button
                    onClick={() => setLanguage('en')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${language === 'en' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setLanguage('zh')}
                    className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${language === 'zh' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                  >
                    中文
                  </button>
                </div>
              </div>

            </div>
          )}

          {configTab === 'ai' && (
            <div className="space-y-5">
              {/* AI Configuration */}
              <div>
                <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted mb-2">
                  {language === 'zh' ? 'AI 模型配置' : 'AI Model Configuration'}
                </h3>

                {/* Provider Selection */}
                <select
                  value={aiProvider}
                  onChange={e => {
                    const provider = e.target.value as 'deepseek' | 'anthropic' | 'openai' | 'custom';
                    setAiProvider(provider);
                    // Set default models
                    if (provider === 'deepseek') setAiModel(DEFAULT_MODEL.deepseek);
                    else if (provider === 'anthropic') setAiModel('claude-3-5-sonnet-20241022');
                    else if (provider === 'openai') setAiModel(DEFAULT_MODEL.openai);
                  }}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors mb-2"
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="custom">{language === 'zh' ? '自定义' : 'Custom'}</option>
                </select>

                {/* API Key */}
                <div className="relative mb-2">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={aiApiKey}
                    onChange={e => setAiApiKey(e.target.value)}
                    placeholder={language === 'zh' ? 'API Key' : 'API Key'}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-accent transition-colors font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-heading transition-colors p-1"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Model Name */}
                <input
                  type="text"
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                  placeholder={language === 'zh' ? '模型名称 (可选)' : 'Model name (optional)'}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono mb-2"
                />

                {/* Custom Base URL */}
                {aiProvider === 'custom' && (
                  <input
                    type="text"
                    value={aiBaseUrl}
                    onChange={e => setAiBaseUrl(e.target.value)}
                    placeholder={language === 'zh' ? 'API 端点 URL' : 'API Endpoint URL'}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono mb-2"
                  />
                )}

                {/* Format Selection for Custom */}
                {aiProvider === 'custom' && (
                  <select
                    value={aiFormat}
                    onChange={e => setAiFormat(e.target.value as 'openai' | 'anthropic')}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors mb-2"
                  >
                    <option value="openai">OpenAI Format</option>
                    <option value="anthropic">Anthropic Format</option>
                  </select>
                )}

                <p className="text-xs text-text-muted mt-1">
                  {language === 'zh' ? '用于 AI 总结和 Brain Dump 功能。' : 'Used for AI Summary and Brain Dump features. '}
                  {aiProvider === 'deepseek' && (
                    <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {language === 'zh' ? '获取 DeepSeek API Key' : 'Get DeepSeek API Key'}
                    </a>
                  )}
                  {aiProvider === 'anthropic' && (
                    <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {language === 'zh' ? '获取 Anthropic API Key' : 'Get Anthropic API Key'}
                    </a>
                  )}
                  {aiProvider === 'openai' && (
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {language === 'zh' ? '获取 OpenAI API Key' : 'Get OpenAI API Key'}
                    </a>
                  )}
                </p>

                {/* AI Test Connection */}
                <button
                  disabled={!aiApiKey || aiVerifyStatus === 'loading'}
                  onClick={async () => {
                    setAiVerifyStatus('loading');
                    setAiVerifyMsg('');
                    try {
                      const isAnthropicFmt = aiProvider === 'anthropic' || (aiProvider === 'custom' && aiFormat === 'anthropic');
                      const { model: usedModel } = await aiApi.summarize({
                        provider: aiProvider,
                        apiKey: aiApiKey,
                        model: aiModel || undefined,
                        baseUrl: aiBaseUrl || undefined,
                        systemPrompt: 'Reply with OK.',
                        userPrompt: 'hi',
                        maxTokens: 5,
                        format: isAnthropicFmt ? 'anthropic' : 'openai',
                      });
                      setAiVerifyStatus('success');
                      setAiVerifyMsg(language === 'zh' ? `✓ 连接成功 (${usedModel})` : `✓ Connected (${usedModel})`);
                    } catch (e: any) {
                      setAiVerifyStatus('error');
                      setAiVerifyMsg(language === 'zh' ? `✗ 验证失败: ${e.message}` : `✗ Failed: ${e.message}`);
                    }
                  }}
                  className={`mt-3 w-full py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                    aiVerifyStatus === 'success' ? 'bg-green-500 text-white' :
                    aiVerifyStatus === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/30' :
                    'bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20'
                  } disabled:opacity-50`}
                >
                  {aiVerifyStatus === 'loading'
                    ? (language === 'zh' ? '验证中...' : 'Verifying...')
                    : (language === 'zh' ? '测试连接' : 'Test Connection')}
                </button>
                {aiVerifyMsg && (
                  <p className={`text-xs mt-1.5 ${aiVerifyStatus === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                    {aiVerifyMsg}
                  </p>
                )}
              </div>
            </div>
          )}

          {configTab === 'github' && (
            <div className="space-y-5">
              <hr className="border-border" />

              {/* GitHub Sync */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted">
                    {language === 'zh' ? 'GitHub 同步' : 'GitHub Sync'}
                  </h3>
                  <span className="text-[9px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold">Beta</span>
                </div>

                {/* Detailed Tutorial */}
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-3">
                  <p className="text-xs text-text-main font-medium mb-2">
                    {language === 'zh' ? '📖 详细配置步骤：' : '📖 Detailed Setup Guide:'}
                  </p>
                  <ol className="text-xs text-text-muted space-y-2 list-decimal list-inside">
                    <li>
                      <strong>{language === 'zh' ? '创建 GitHub 仓库' : 'Create GitHub Repository'}</strong>
                      <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                        <li>{language === 'zh' ? '访问 github.com，点击右上角 "+" → "New repository"' : 'Go to github.com, click "+" → "New repository"'}</li>
                        <li>{language === 'zh' ? '输入仓库名称（如 dailyflow-notes）' : 'Enter repository name (e.g., dailyflow-notes)'}</li>
                        <li>{language === 'zh' ? '选择 "Private"（私有仓库）' : 'Select "Private" repository'}</li>
                        <li>{language === 'zh' ? '点击 "Create repository"' : 'Click "Create repository"'}</li>
                      </ul>
                    </li>
                    <li>
                      <strong>{language === 'zh' ? '生成 Personal Access Token' : 'Generate Personal Access Token'}</strong>
                      <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                        <li>{language === 'zh' ? '访问 github.com/settings/tokens' : 'Go to github.com/settings/tokens'}</li>
                        <li>{language === 'zh' ? '点击 "Generate new token" → "Generate new token (classic)"' : 'Click "Generate new token" → "Generate new token (classic)"'}</li>
                        <li>{language === 'zh' ? '输入 Note（如 "DailyFlow Sync"）' : 'Enter Note (e.g., "DailyFlow Sync")'}</li>
                        <li>{language === 'zh' ? '勾选 "repo" 权限（完整仓库访问）' : 'Check "repo" scope (full repository access)'}</li>
                        <li>{language === 'zh' ? '点击 "Generate token"，复制生成的 token' : 'Click "Generate token", copy the generated token'}</li>
                      </ul>
                    </li>
                    <li>
                      <strong>{language === 'zh' ? '填写配置并测试' : 'Fill Configuration and Test'}</strong>
                      <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                        <li>{language === 'zh' ? '在下方粘贴仓库链接（如 https://github.com/username/repo-name）' : 'Paste repository URL below (e.g. https://github.com/username/repo-name)'}</li>
                        <li>{language === 'zh' ? '粘贴刚才复制的 Personal Access Token' : 'Paste the Personal Access Token you just copied'}</li>
                        <li>{language === 'zh' ? '点击 "测试连接" 验证配置是否正确' : 'Click "Test Connection" to verify configuration'}</li>
                      </ul>
                    </li>
                  </ol>
                </div>

                <div className="space-y-3">
                  {/* Sync Interval */}
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {language === 'zh' ? '同步频率' : 'Sync Frequency'}
                    </label>
                    <select
                      value={syncInterval}
                      onChange={e => setSyncInterval(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
                    >
                      <option value={0}>{language === 'zh' ? '手动同步' : 'Manual Sync'}</option>
                      <option value={1}>{language === 'zh' ? '每 1 分钟' : 'Every 1 minute'}</option>
                      <option value={5}>{language === 'zh' ? '每 5 分钟' : 'Every 5 minutes'}</option>
                      <option value={10}>{language === 'zh' ? '每 10 分钟' : 'Every 10 minutes'}</option>
                    </select>
                  </div>

                  {/* Repository */}
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {language === 'zh' ? 'GitHub 仓库链接' : 'GitHub Repository URL'}
                    </label>
                    <input
                      type="text"
                      value={githubRepoInput}
                      onChange={e => setGithubRepoInput(e.target.value)}
                      placeholder="https://github.com/username/repo-name"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono"
                    />
                  </div>

                  {/* Token */}
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      Personal Access Token
                    </label>
                    <div className="relative">
                      <input
                        type={showGithubToken ? "text" : "password"}
                        value={githubToken}
                        onChange={e => setGithubToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:border-accent transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGithubToken(!showGithubToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-heading transition-colors p-1"
                      >
                        {showGithubToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Test Connection Button */}
                  <button
                    onClick={async () => {
                      if (!githubRepoInput || !githubToken) {
                        setGithubVerifyStatus('error');
                        setGithubVerifyMsg(language === 'zh' ? '请填写仓库名称和 Token' : 'Please fill in repository name and token');
                        return;
                      }

                      setGithubVerifyStatus('loading');
                      setGithubVerifyMsg('');

                      try {
                        // Support both "owner/repo" and "https://github.com/owner/repo"
                        const repoPath = githubRepoInput.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
                        const [owner, repo] = repoPath.split('/');
                        if (!owner || !repo) {
                          throw new Error(language === 'zh' ? '仓库链接格式错误，应为 https://github.com/username/repo-name' : 'Invalid format, should be https://github.com/username/repo-name');
                        }

                        const res = await fetch(`${API_BASE.github}/repos/${owner}/${repo}`, {
                          headers: {
                            'Authorization': `Bearer ${githubToken}`,
                            'Accept': 'application/vnd.github.v3+json',
                          },
                        });

                        if (res.ok) {
                          const data = await res.json();
                          setGithubVerifyStatus('success');
                          setGithubVerifyMsg(language === 'zh'
                            ? `✓ 连接成功！仓库：${data.full_name}${data.private ? ' (私有)' : ' (公开)'}`
                            : `✓ Connection successful! Repository: ${data.full_name}${data.private ? ' (private)' : ' (public)'}`
                          );
                        } else if (res.status === 404) {
                          setGithubVerifyStatus('error');
                          setGithubVerifyMsg(language === 'zh' ? '✗ 仓库不存在或无权访问' : '✗ Repository not found or no access');
                        } else if (res.status === 401) {
                          setGithubVerifyStatus('error');
                          setGithubVerifyMsg(language === 'zh' ? '✗ Token 无效或已过期' : '✗ Invalid or expired token');
                        } else {
                          setGithubVerifyStatus('error');
                          setGithubVerifyMsg(language === 'zh' ? `✗ 验证失败：${res.status}` : `✗ Verification failed: ${res.status}`);
                        }
                      } catch (e: any) {
                        setGithubVerifyStatus('error');
                        setGithubVerifyMsg(language === 'zh' ? `✗ 错误：${e.message}` : `✗ Error: ${e.message}`);
                      }
                    }}
                    disabled={githubVerifyStatus === 'loading'}
                    className="w-full py-2 bg-surface border border-border rounded-lg text-xs uppercase font-bold tracking-widest hover:bg-surface-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {githubVerifyStatus === 'loading' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{language === 'zh' ? '验证中...' : 'Verifying...'}</span>
                      </>
                    ) : (
                      <span>{language === 'zh' ? '测试连接' : 'Test Connection'}</span>
                    )}
                  </button>

                  {/* Verification Result */}
                  {githubVerifyMsg && (
                    <div className={`text-xs p-2 rounded-lg ${
                      githubVerifyStatus === 'success'
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {githubVerifyMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {configTab === 'about' && (
            <div className="space-y-5">
              {/* App Info */}
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-accent text-white flex items-center justify-center font-serif text-xl font-bold rounded-lg shadow-sm mx-auto mb-3">D</div>
                <h3 className="font-serif text-xl text-text-heading italic">DailyFlow</h3>
                <p className="text-xs text-text-muted mt-1">
                  {language === 'zh' ? '简洁高效的日常任务管理工具' : 'A minimal daily task manager'}
                </p>
              </div>

              <hr className="border-border" />

              {/* App Update */}
              <div>
                <h3 className="font-sans text-[10px] uppercase font-bold tracking-widest text-text-muted mb-2">
                  {language === 'zh' ? '应用更新' : 'App Update'}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>
                      {language === 'zh' ? '当前版本' : 'Current Version'}
                    </span>
                    <span className="font-mono font-semibold text-text-heading">{__APP_VERSION__}</span>
                  </div>
                  {lastCheckTime && (
                    <div className="flex items-center justify-between text-xs text-text-muted">
                      <span>
                        {language === 'zh' ? '上次检查' : 'Last Checked'}
                      </span>
                      <span className="font-mono text-text-heading">{formatCheckTime(lastCheckTime)}</span>
                    </div>
                  )}
                  <button
                    onClick={handleCheckUpdate}
                    disabled={isCheckingUpdate}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-lg text-xs uppercase font-bold tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCheckingUpdate ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'zh' ? '检查中...' : 'Checking...'}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        {language === 'zh' ? '检查更新' : 'Check for Updates'}
                      </>
                    )}
                  </button>

                  {updateInfo && (
                    <div className={`p-4 rounded-lg border ${
                      updateInfo.hasUpdate
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-green-50 border-green-200'
                    }`}>
                      <div className="flex items-start gap-3">
                        {updateInfo.hasUpdate ? (
                          <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 space-y-2">
                          <p className={`text-sm font-semibold ${
                            updateInfo.hasUpdate ? 'text-blue-700' : 'text-green-700'
                          }`}>
                            {updateInfo.hasUpdate
                              ? (language === 'zh' ? '发现新版本！' : 'New version available!')
                              : (language === 'zh' ? '已是最新版本' : 'You are up to date')}
                          </p>
                          <div className="text-xs space-y-1">
                            <p className={updateInfo.hasUpdate ? 'text-blue-600' : 'text-green-600'}>
                              {language === 'zh' ? '当前版本: ' : 'Current: '}
                              <span className="font-mono font-semibold">{updateInfo.currentVersion}</span>
                            </p>
                            {updateInfo.hasUpdate && (
                              <p className="text-blue-600">
                                {language === 'zh' ? '最新版本: ' : 'Latest: '}
                                <span className="font-mono font-semibold">{updateInfo.latestVersion}</span>
                              </p>
                            )}
                          </div>
                          {updateInfo.hasUpdate && updateInfo.downloadUrl && (
                            <a
                              href={updateInfo.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors mt-2"
                            >
                              <Download className="w-3.5 h-3.5" />
                              {language === 'zh' ? '下载更新' : 'Download Update'}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Save Button */}
        <div className="border-t border-border p-4 flex justify-end gap-3">
          <button
            onClick={() => setShowSettings(false)}
            className="px-5 py-2 font-sans font-bold text-xs uppercase tracking-widest text-text-muted hover:text-text-heading transition-colors"
          >
            {language === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button
            onClick={async () => {
              const oldWorkspaceRoot = workspaceRoot;
              setShowSettings(false);
              try {
                const config = await configApi.get();
                const workspaceChanged = oldWorkspaceRoot !== config.workspaceRoot;

                await configApi.update({
                  ...config,
                  workspaceRoot: workspaceRoot.trim(),
                  githubRepo: githubRepoInput.trim() || undefined,
                  githubToken: githubToken.trim() || undefined,
                  aiProvider,
                  aiApiKey: aiApiKey.trim(),
                  aiModel: aiModel.trim(),
                  aiBaseUrl: aiBaseUrl.trim(),
                  aiFormat,
                });
                setGithubRepo(githubRepoInput.trim() || null);
                // Auto-verify connection on save instead of relying on manual Test Connection click
                const trimmedRepo = githubRepoInput.trim();
                const trimmedToken = githubToken.trim();
                if (trimmedRepo && trimmedToken) {
                  const ok = githubVerifyStatus === 'success'
                    ? true
                    : await verifyGithubConnection(trimmedRepo, trimmedToken);
                  setGithubConnected(ok);
                } else {
                  setGithubConnected(false);
                }

                // If workspace path changed, reload everything
                if (workspaceChanged) {
                  // Clear current state
                  setFilesMap({});
                  setTasks([]);
                  setMarkdown('');

                  // Reload file list from new workspace
                  try {
                    const files = await filesApi.list();
                    const newFilesMap: Record<string, string> = {};
                    for (const file of files) {
                      const data = await filesApi.get(file);
                      if (data) {
                        newFilesMap[file] = data.content;
                      }
                    }
                    setFilesMap(newFilesMap);

                    // Switch to today's date
                    const today = new Date().toISOString().split('T')[0];
                    // Use currentFileDate setter via window reload or we need to pass it
                    // Actually we need to reload the page or use the passed setter
                    // For now, let's just reload the page to keep behavior consistent
                    window.location.reload();
                  } catch (e) {
                    console.error('Failed to reload workspace:', e);
                    alert(language === 'zh'
                      ? '重新加载工作区失败，请检查路径是否正确'
                      : 'Failed to reload workspace. Please check if the path is correct.');
                  }
                }
              } catch (e) {
                console.error('Failed to save config:', e);
                alert(language === 'zh'
                  ? '保存配置失败'
                  : 'Failed to save configuration');
              }
            }}
            className="bg-accent text-white px-6 py-2 rounded-full font-sans font-bold text-xs uppercase tracking-widest shadow-sm hover:bg-accent/90 transition-colors"
          >
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
