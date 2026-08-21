/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { motion } from 'motion/react';
import { X, Eye, EyeOff, Loader2, Download, CheckCircle, AlertCircle, Copy, ExternalLink, Upload, Trash2, CalendarDays, RefreshCw, Bot, Mic, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ModelLibrary } from './ModelLibrary';
import { TeamSettings } from './TeamSettings';
import { persistProviderConfigsToBackend } from '../types/models';
import { open } from '@tauri-apps/plugin-shell';
import {
  configApi,
  dispatchDomainEvent,
  DOMAIN_EVENTS,
  feishuApi,
  googleCalendarApi,
  ipfsApi,
  type FeishuStatus,
  type GoogleCalendarStatus,
  type IpfsBackupRecord,
} from '../api/client';
import { API_BASE } from '../config/api';
import { checkForUpdates, downloadUpdate, relaunchApp, type UpdateInfo } from '../api/updater';
import { getTodayStr } from '../utils/tagColors';
import { ProactiveSettingsSection } from './ProactiveSettingsSection';
import { TranscriptionSettingsSection } from './TranscriptionSettingsSection';
import { PrivacyPanel } from './PrivacyPanel';

declare const __APP_VERSION__: string;

type SettingsTab = 'general' | 'ai' | 'transcription' | 'sync' | 'privacy' | 'about' | 'team';

interface SettingsModalProps {
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  language: 'en' | 'zh';
  configTab: SettingsTab;
  setConfigTab: (tab: SettingsTab) => void;
  workspaceRoot: string;
  setWorkspaceRoot: (v: string) => void;
  setLanguage: (v: 'en' | 'zh') => void;
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
  ipfsEnabled: boolean;
  setIpfsEnabled: (v: boolean) => void;
  ipfsApiKey: string;
  setIpfsApiKey: (v: string) => void;
  ipfsGateway: string;
  setIpfsGateway: (v: string) => void;
  showToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

function StepNumber({ value, done }: { value: string; done: boolean }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
      done
        ? 'bg-green-100 text-green-700'
        : 'border border-border bg-surface text-text-muted'
    }`}>
      {done ? <CheckCircle className="h-3.5 w-3.5" /> : value}
    </span>
  );
}

export function SettingsModal({
  showSettings,
  setShowSettings,
  language,
  configTab,
  setConfigTab,
  workspaceRoot,
  setLanguage,
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
  ipfsEnabled,
  setIpfsEnabled,
  ipfsApiKey,
  setIpfsApiKey,
  ipfsGateway,
  setIpfsGateway,
  showToast,
}: SettingsModalProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [installProgress, setInstallProgress] = useState({ downloaded: 0, total: 0 });
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(() => {
    try {
      return localStorage.getItem('df_last_update_check');
    } catch {
      return null;
    }
  });

  // Display settings state
  const [textScale, setTextScale] = useState(() => {
    try { const v = localStorage.getItem('df_text_scale'); return v ? parseInt(v, 10) : 5; } catch { return 5; }
  });
  const [fontWeight, setFontWeight] = useState(() => {
    try { const v = localStorage.getItem('df_font_weight'); return v ? parseInt(v, 10) : 0; } catch { return 0; }
  });
  const [selectedFont, setSelectedFont] = useState(() => {
    try { return localStorage.getItem('df_selected_font') || 'system'; } catch { return 'system'; }
  });
  const [lifeBrightness, setLifeBrightness] = useState(10); // 0-10, default 10 = 100%

  // Sync sub-tab state
  const [syncSubTab, setSyncSubTab] = useState<'feishu' | 'google' | 'github' | 'ipfs'>('feishu');
  const [feishuStatus, setFeishuStatus] = useState<FeishuStatus | null>(null);
  const [feishuStatusLoading, setFeishuStatusLoading] = useState(false);
  const [feishuLoading, setFeishuLoading] = useState(false);
  const [feishuDeviceCode, setFeishuDeviceCode] = useState<string | null>(null);
  const [feishuVerificationUrl, setFeishuVerificationUrl] = useState<string | null>(null);
  const [feishuQrDataUrl, setFeishuQrDataUrl] = useState<string | null>(null);
  const [feishuSetupUrl, setFeishuSetupUrl] = useState<string | null>(null);
  const [feishuSetupQrDataUrl, setFeishuSetupQrDataUrl] = useState<string | null>(null);
  const [feishuMessage, setFeishuMessage] = useState('');
  const [googleStatus, setGoogleStatus] = useState<GoogleCalendarStatus | null>(null);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleMessage, setGoogleMessage] = useState('');

  // IPFS local state
  const [showIpfsKey, setShowIpfsKey] = useState(false);
  const [ipfsTestStatus, setIpfsTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ipfsTestMsg, setIpfsTestMsg] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [ipfsBackups, setIpfsBackups] = useState<IpfsBackupRecord[]>([]);

  // Workspace Data state (export / import / reset)
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [lastExportTime, setLastExportTime] = useState<string | null>(() => {
    try { return localStorage.getItem('df_last_export_time'); } catch { return null; }
  });
  const [dataStatus, setDataStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Team collaboration state (managed by extracted TeamSettings component)
  const [teamConfig, setTeamConfig] = useState<{ enabled: boolean; config: { role: 'leader' | 'member'; memberId: string; members: { id: string; name: string; path: string }[] } | null }>({ enabled: false, config: null });

  useEffect(() => {
    if (!showSettings || configTab !== 'sync') return;
    setFeishuStatusLoading(true);
    feishuApi.status()
      .then(setFeishuStatus)
      .catch((error: Error) => {
        setFeishuStatus(null);
        setFeishuMessage(error.message);
      })
      .finally(() => setFeishuStatusLoading(false));
    googleCalendarApi.status().then(setGoogleStatus).catch(() => setGoogleStatus(null));
    ipfsApi.list()
      .then(({ records }) => setIpfsBackups(records))
      .catch(() => setIpfsBackups([]));
  }, [showSettings, configTab]);

  // Best-effort: persist Model Center edits made from the AI tab when the
  // user leaves the tab or closes the modal (mirrors AIChat behavior).
  const prevAiTabRef = useRef(false);
  useEffect(() => {
    const wasAi = prevAiTabRef.current;
    prevAiTabRef.current = showSettings && configTab === 'ai';
    if (wasAi && prevAiTabRef.current === false) {
      persistProviderConfigsToBackend().catch(err => console.error('Model center backend sync failed:', err));
    }
  }, [showSettings, configTab]);

  const handleGoogleConnect = async () => {
    setGoogleLoading(true);
    setGoogleMessage('');
    try {
      if (!googleStatus?.configured) {
        setGoogleStatus(await googleCalendarApi.configure(googleClientId));
      }
      const { authorizationUrl } = await googleCalendarApi.startAuth();
      try { await open(authorizationUrl); }
      catch {
        const popup = window.open(authorizationUrl, '_blank', 'noopener,noreferrer');
        if (!popup) setGoogleMessage(language === 'zh' ? '浏览器未打开，请允许系统打开 Google 授权页。' : 'The browser did not open. Allow DailyFlow to open the Google authorization page.');
      }
      setGoogleMessage(language === 'zh' ? '请在 Google 页面完成授权，然后回到这里点击“检查连接”。' : 'Complete authorization in Google, then return and choose Check connection.');
    } catch (error: any) {
      setGoogleMessage(error.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleCheck = async () => {
    setGoogleLoading(true);
    try {
      const status = await googleCalendarApi.status();
      setGoogleStatus(status);
      setGoogleMessage(status.connected
        ? (language === 'zh' ? 'Google Calendar 已连接，日程会显示在日历视图。' : 'Google Calendar connected. Events will appear in Calendar.')
        : (language === 'zh' ? '尚未收到 Google 授权，请先完成浏览器中的确认。' : 'Authorization is not complete yet.'));
      if (status.connected) {
        dispatchDomainEvent(DOMAIN_EVENTS.calendarConnectionChanged, {
          provider: 'google',
          connected: true,
        });
      }
    } catch (error: any) {
      setGoogleMessage(error.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleConnectFeishu = async () => {
    setFeishuLoading(true);
    setFeishuMessage('');
    try {
      const auth = await feishuApi.startAuth();
      setFeishuDeviceCode(auth.deviceCode);
      setFeishuVerificationUrl(auth.verificationUrl);
      setFeishuQrDataUrl(auth.qrDataUrl);
      setFeishuMessage(language === 'zh'
        ? '请在飞书页面确认“日历 + 任务”权限。DailyFlow 正在等待授权结果，完成后会自动连接。'
        : 'Approve Calendar + Tasks on Feishu. DailyFlow is waiting and will connect automatically.');
      try {
        await open(auth.verificationUrl);
      } catch {
        const popup = window.open(auth.verificationUrl, '_blank', 'noopener,noreferrer');
        if (!popup) {
          setFeishuMessage(language === 'zh'
            ? '授权链接已经生成，但系统浏览器没有自动打开。请点击“重新打开”或“复制链接”。'
            : 'The authorization link is ready, but the browser did not open. Choose Open again or Copy link below.');
        }
      }
      const status = await feishuApi.finishAuth(auth.deviceCode);
      setFeishuStatus(status);
      if (status.authorized) {
        setFeishuDeviceCode(null);
        setFeishuVerificationUrl(null);
        setFeishuQrDataUrl(null);
        setFeishuMessage(language === 'zh'
          ? `飞书账号已连接${status.userName ? `：${status.userName}` : ''}。`
          : `Feishu connected${status.userName ? `: ${status.userName}` : ''}.`);
        dispatchDomainEvent(DOMAIN_EVENTS.calendarConnectionChanged, {
          provider: 'feishu',
          connected: true,
        });
      } else {
        setFeishuMessage(status.reason || (language === 'zh' ? '尚未完成授权。' : 'Authorization is not complete.'));
      }
    } catch (e: any) {
      setFeishuMessage(language === 'zh'
        ? `自动等待已结束：${e.message}。如果你已在飞书确认，请点击下面的“重新检查”。`
        : `Automatic wait ended: ${e.message}. If you approved in Feishu, choose Check again below.`);
    } finally {
      setFeishuLoading(false);
    }
  };

  const openFeishuUrl = async (url: string) => {
    try {
      await open(url);
    } catch {
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) {
        setFeishuMessage(language === 'zh'
          ? '系统没有打开飞书页面，请复制链接后粘贴到浏览器。'
          : 'The Feishu page did not open. Copy the link and paste it into your browser.');
      }
    }
  };

  const handlePrepareFeishu = async () => {
    setFeishuLoading(true);
    setFeishuMessage('');
    try {
      const setup = await feishuApi.startSetup();
      setFeishuSetupUrl(setup.verificationUrl);
      setFeishuSetupQrDataUrl(setup.qrDataUrl);
      setFeishuMessage(language === 'zh'
        ? '请在飞书官方页面完成一次性连接准备，DailyFlow 会自动检查结果。'
        : 'Complete the one-time setup on the official Feishu page. DailyFlow will check the result automatically.');
      await openFeishuUrl(setup.verificationUrl);
      const status = await feishuApi.finishSetup();
      setFeishuStatus(status);
      if (status.appConfigured) {
        setFeishuSetupUrl(null);
        setFeishuSetupQrDataUrl(null);
        setFeishuMessage(language === 'zh'
          ? '连接环境已准备完成。现在点击“连接飞书”授权你的账号。'
          : 'Feishu is ready. Now choose Connect Feishu to authorize your account.');
      }
    } catch (e: any) {
      setFeishuMessage(e.message);
    } finally {
      setFeishuLoading(false);
    }
  };

  const handleFinishFeishuSetup = async () => {
    setFeishuLoading(true);
    try {
      const status = await feishuApi.finishSetup();
      setFeishuStatus(status);
      if (status.appConfigured) {
        setFeishuSetupUrl(null);
        setFeishuSetupQrDataUrl(null);
        setFeishuMessage(language === 'zh'
          ? '连接环境已准备完成。现在点击“连接飞书”授权你的账号。'
          : 'Feishu is ready. Now choose Connect Feishu to authorize your account.');
      } else {
        setFeishuMessage(status.reason || (language === 'zh' ? '连接准备尚未完成。' : 'Setup is not complete yet.'));
      }
    } catch (e: any) {
      setFeishuMessage(e.message);
    } finally {
      setFeishuLoading(false);
    }
  };

  const handleFinishFeishu = async () => {
    if (!feishuDeviceCode) return;
    setFeishuLoading(true);
    try {
      const status = await feishuApi.finishAuth(feishuDeviceCode);
      setFeishuStatus(status);
      if (status.authorized) {
        setFeishuDeviceCode(null);
        setFeishuVerificationUrl(null);
        setFeishuQrDataUrl(null);
        setFeishuSetupUrl(null);
        setFeishuSetupQrDataUrl(null);
        dispatchDomainEvent(DOMAIN_EVENTS.calendarConnectionChanged, {
          provider: 'feishu',
          connected: true,
        });
      }
      setFeishuMessage(status.authorized
        ? (language === 'zh' ? '飞书企业账号已连接。' : 'Feishu enterprise account connected.')
        : (status.reason || 'Authorization failed'));
    } catch (e: any) {
      setFeishuMessage(e.message);
    } finally {
      setFeishuLoading(false);
    }
  };

  const reopenFeishuAuthorization = async () => {
    if (!feishuVerificationUrl) return;
    try {
      await open(feishuVerificationUrl);
    } catch {
      const popup = window.open(feishuVerificationUrl, '_blank', 'noopener,noreferrer');
      if (!popup) {
        setFeishuMessage(language === 'zh'
          ? '系统仍然无法打开授权页，请复制链接后粘贴到浏览器。'
          : 'The authorization page still could not open. Copy the link and paste it into your browser.');
      }
    }
  };

  const copyFeishuAuthorization = async () => {
    if (!feishuVerificationUrl) return;
    await navigator.clipboard.writeText(feishuVerificationUrl);
    setFeishuMessage(language === 'zh' ? '授权链接已复制。' : 'Authorization link copied.');
  };

  const handleDisconnectFeishu = async () => {
    const confirmed = window.confirm(language === 'zh'
      ? '断开 DailyFlow 中的飞书账号？这只会清除本机登录状态，不会撤销飞书服务端的应用授权。'
      : 'Disconnect Feishu from DailyFlow? This clears the local login only and does not revoke the app in Feishu.');
    if (!confirmed) return;
    setFeishuLoading(true);
    setFeishuMessage('');
    try {
      const status = await feishuApi.logout();
      setFeishuStatus(status);
      setFeishuDeviceCode(null);
      setFeishuVerificationUrl(null);
      setFeishuQrDataUrl(null);
      setFeishuSetupUrl(null);
      setFeishuSetupQrDataUrl(null);
      setFeishuMessage(language === 'zh'
        ? '已断开本机飞书账号。需要时可在这里重新授权。'
        : 'The local Feishu account is disconnected. Reauthorize here whenever needed.');
      dispatchDomainEvent(DOMAIN_EVENTS.calendarConnectionChanged, {
        provider: 'feishu',
        connected: false,
      });
    } catch (e: any) {
      setFeishuMessage(e.message);
    } finally {
      setFeishuLoading(false);
    }
  };

  const handleFeishuSync = async () => {
    setFeishuLoading(true);
    setFeishuMessage('');
    try {
      const [tasks, calendar] = await Promise.all([
        feishuApi.syncTasks(),
        feishuApi.syncCalendar(),
      ]);
      const conflictText = tasks.conflicts.length
        ? (language === 'zh' ? `，${tasks.conflicts.length} 个冲突待处理` : `, ${tasks.conflicts.length} conflicts need review`)
        : '';
      setFeishuMessage(language === 'zh'
        ? `同步完成：任务上传 ${tasks.pushed + tasks.updatedRemote}，下载 ${tasks.pulled + tasks.updatedLocal}；日程新建 ${calendar.created}，更新 ${calendar.updated}${conflictText}`
        : `Synced: ${tasks.pushed + tasks.updatedRemote} tasks pushed, ${tasks.pulled + tasks.updatedLocal} pulled; ${calendar.created} events created, ${calendar.updated} updated${conflictText}`);
      setFeishuStatus(await feishuApi.status());
      dispatchDomainEvent(DOMAIN_EVENTS.calendarEventsChanged, {
        provider: 'feishu',
        reason: 'manual-sync',
      });
    } catch (e: any) {
      setFeishuMessage(e.message);
    } finally {
      setFeishuLoading(false);
    }
  };

  useEffect(() => {
    if (!showSettings) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement;
      const isEditing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isEditing || e.isComposing) return;
      setShowSettings(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSettings]);

  const handleTestIpfs = async () => {
    if (!ipfsApiKey.trim()) {
      setIpfsTestStatus('error');
      setIpfsTestMsg(language === 'zh' ? '请先填写 Pinata JWT' : 'Please enter your Pinata JWT first');
      return;
    }
    setIpfsTestStatus('loading');
    setIpfsTestMsg('');
    try {
      const result = await ipfsApi.test(ipfsApiKey.trim());
      if (result.ok) {
        setIpfsTestStatus('success');
        setIpfsTestMsg(language === 'zh' ? `✓ 连接成功 (${result.message})` : `✓ Connected (${result.message})`);
      } else {
        setIpfsTestStatus('error');
        setIpfsTestMsg(language === 'zh' ? `✗ ${result.message}` : `✗ ${result.message}`);
      }
    } catch (e: any) {
      setIpfsTestStatus('error');
      setIpfsTestMsg(language === 'zh' ? `✗ 验证失败: ${e.message}` : `✗ Failed: ${e.message}`);
    }
  };

  const handleRunIpfsBackup = async () => {
    setIsBackingUp(true);
    try {
      // Persist current IPFS settings before triggering the backup
      const config = await configApi.get();
      await configApi.update({
        ipfsEnabled: true,
        ipfsProvider: 'pinata',
        ipfsApiKey: ipfsApiKey.trim(),
        ipfsGateway: ipfsGateway.trim() || null,
      }, config.version);
      setIpfsEnabled(true);

      const result = await ipfsApi.backup();
      if (result.success && result.cid) {
        showToast(
          language === 'zh'
            ? `✓ 已上传到 IPFS (${result.fileCount} 个文件)`
            : `✓ Uploaded to IPFS (${result.fileCount} files)`,
          'success'
        );
        const { records } = await ipfsApi.list();
        setIpfsBackups(records);
      } else {
        showToast(
          language === 'zh'
            ? `备份失败: ${result.error || 'Unknown error'}`
            : `Backup failed: ${result.error || 'Unknown error'}`,
          'error'
        );
      }
    } catch (e: any) {
      showToast(
        language === 'zh' ? `备份失败: ${e.message}` : `Backup failed: ${e.message}`,
        'error'
      );
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleCopyCid = async (cid: string) => {
    try {
      await navigator.clipboard.writeText(cid);
      showToast(language === 'zh' ? 'CID 已复制' : 'CID copied', 'success');
    } catch {
      // ignore
    }
  };

  const handleOpenGateway = async (record: IpfsBackupRecord) => {
    const gateway = (record.gateway || ipfsGateway || 'https://gateway.pinata.cloud').replace(/\/$/, '');
    const url = `${gateway}/ipfs/${record.cid}`;
    try {
      await open(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  const fontWeightLabel = fontWeight === 0 ? 'Normal' : fontWeight === 1 ? 'Medium' : 'Bold';

  // ---------------------------------------------------------------------------
  // Workspace Data: export / import / reset
  // ---------------------------------------------------------------------------

  const V2_BASE = `${API_BASE.api}/api/v2`;

  const formatRelativeTime = (iso: string): string => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return language === 'zh' ? '刚刚' : 'just now';
    if (min < 60) return language === 'zh' ? `${min} 分钟前` : `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return language === 'zh' ? `${hr} 小时前` : `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return language === 'zh' ? `${day} 天前` : `${day}d ago`;
  };

  const handleExportWorkspace = async () => {
    if (!workspaceRoot) {
      setDataStatus({ type: 'error', message: language === 'zh' ? '请先设置工作区路径' : 'Please set a workspace path first' });
      return;
    }
    setIsExporting(true);
    setDataStatus(null);
    try {
      const response = await fetch(`${V2_BASE}/export/workspace`);
      if (!response.ok) throw new Error(`Failed to export workspace: HTTP ${response.status}`);
      const data = await response.json() as { entities?: Record<string, unknown[]> };
      if (!data.entities) throw new Error('Export response did not contain entities');
      const entitiesByKind = Object.entries(data.entities);
      const exportPayload = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        workspaceRoot,
        entities: data.entities,
      };
      const totalEntities = entitiesByKind.reduce((s, [, items]) => s + items.length, 0);
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const wsSlug = workspaceRoot.split(/[\\/]/).filter(Boolean).pop() || 'workspace';
      const date = getTodayStr();
      a.href = url;
      a.download = `dailyflow-${wsSlug}-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      setLastExportTime(now);
      try { localStorage.setItem('df_last_export_time', now); } catch { /* ignore */ }
      const msg = language === 'zh'
        ? `✓ 已导出 ${totalEntities} 个实体`
        : `✓ Exported ${totalEntities} entities`;
      setDataStatus({ type: 'success', message: msg });
      showToast(msg, 'success');
    } catch (e: any) {
      const msg = language === 'zh' ? `✗ 导出失败: ${e.message}` : `✗ Export failed: ${e.message}`;
      setDataStatus({ type: 'error', message: msg });
      showToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(language === 'zh'
      ? '导入将合并或覆盖当前工作区中的数据。是否继续？'
      : 'Importing will merge or overwrite data in your current workspace. Continue?')) {
      e.target.value = '';
      return;
    }
    setIsImporting(true);
    setDataStatus(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const r = await fetch(`${V2_BASE}/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${r.status}`);
      }
      const result = await r.json();
      const imported = result.imported ?? 0;
      const skipped = result.skipped ?? 0;
      const errors = Array.isArray(result.errors) ? result.errors : [];
      if (errors.length > 0) {
        const first = errors[0];
        const detail = typeof first === 'string'
          ? first
          : first?.message || JSON.stringify(first);
        throw new Error(
          language === 'zh'
            ? `${errors.length} 项导入失败：${detail}`
            : `${errors.length} item(s) failed to import: ${detail}`
        );
      }
      const msg = language === 'zh'
        ? `✓ 已导入 ${imported} 项, 跳过 ${skipped} 项重复`
        : `✓ Imported ${imported}, skipped ${skipped} duplicates`;
      setDataStatus({ type: 'success', message: msg });
      showToast(msg, 'success');
    } catch (e: any) {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = language === 'zh' ? `导入失败：${detail}` : `Import failed: ${detail}`;
      setDataStatus({ type: 'error', message: msg });
      showToast(msg, 'error');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleResetWorkspace = async () => {
    if (!workspaceRoot) {
      setDataStatus({ type: 'error', message: language === 'zh' ? '请先设置工作区路径' : 'Please set a workspace path first' });
      return;
    }
    if (!confirm(language === 'zh'
      ? '⚠ 这将删除所有笔记 / 承诺 / 决策 / 证据。是否继续？'
      : '⚠ This will delete all notes / commitments / decisions / evidence. Continue?')) {
      return;
    }
    if (!confirm(language === 'zh'
      ? '最后确认: 此操作不可撤销。确定重置当前工作区？'
      : 'Final confirmation: this action cannot be undone. Reset the workspace now?')) {
      return;
    }
    setIsResetting(true);
    setDataStatus(null);
    try {
      const r = await fetch(`${V2_BASE}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET WORKSPACE' }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${r.status}`);
      }
      setFilesMap({});
      setTasks([]);
      setMarkdown('');
      setLastSyncedMD('');
      dispatchDomainEvent(DOMAIN_EVENTS.workspaceChanged, { reason: 'reset' });
      const msg = language === 'zh' ? '✓ 工作区已重置' : '✓ Workspace reset';
      setDataStatus({ type: 'success', message: msg });
      showToast(msg, 'success');
    } catch (e: any) {
      const detail = e instanceof Error ? e.message : String(e);
      const msg = language === 'zh'
        ? `重置失败：${detail}`
        : `Reset failed: ${detail}`;
      setDataStatus({ type: 'error', message: msg });
      showToast(msg, 'error');
    } finally {
      setIsResetting(false);
    }
  };



  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateDownloaded(false);
    setInstallProgress({ downloaded: 0, total: 0 });
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

  const localizeUpdateError = (error: string, lang: 'en' | 'zh'): string => {
    const map: Record<string, { zh: string; en: string }> = {
      'Not running in Tauri app (development mode)': {
        zh: '当前不在 Tauri 应用内运行（开发模式）',
        en: 'Not running in Tauri app (development mode)',
      },
      'Updater not configured': {
        zh: '更新器未配置，请检查 tauri.conf.json',
        en: 'Updater not configured',
      },
      'Network error': {
        zh: '网络错误，请检查网络连接',
        en: 'Network error',
      },
      'Update endpoint not found': {
        zh: '更新端点未找到，请检查发布地址',
        en: 'Update endpoint not found',
      },
      'Signature verification failed': {
        zh: '签名验证失败',
        en: 'Signature verification failed',
      },
      'Request timed out': {
        zh: '请求超时',
        en: 'Request timed out',
      },
      'Not running in Tauri app': {
        zh: '当前不在 Tauri 应用内运行',
        en: 'Not running in Tauri app',
      },
      'Updater permission missing — please reinstall the latest version': {
        zh: '缺少更新权限，请重新安装最新版本',
        en: 'Updater permission missing — please reinstall the latest version',
      },
      'Release is unsigned — please download manually from GitHub': {
        zh: '该版本未签名，请前往 GitHub 手动下载',
        en: 'Release is unsigned — please download manually from GitHub',
      },
      'Update manifest not published yet': {
        zh: '更新清单尚未发布',
        en: 'Update manifest not published yet',
      },
    };
    return map[error]?.[lang] || error;
  };

  const handleDownloadUpdate = async () => {
    setIsInstalling(true);
    setInstallProgress({ downloaded: 0, total: 0 });
    try {
      await downloadUpdate((downloaded, total) => {
        setInstallProgress({ downloaded, total });
      });
      setUpdateDownloaded(true);
    } catch (error) {
      console.error('Failed to download update:', error);
      alert(language === 'zh'
        ? `下载更新失败: ${error instanceof Error ? error.message : 'Unknown error'}`
        : `Failed to download update: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsInstalling(false);
    }
  };

  const handleRelaunch = async () => {
    try {
      await relaunchApp();
    } catch (error) {
      console.error('Failed to relaunch:', error);
      alert(language === 'zh'
        ? `重启失败: ${error instanceof Error ? error.message : 'Unknown error'}`
        : `Failed to relaunch: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 bg-background backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative flex max-h-[90dvh] min-h-0 w-full max-w-2xl flex-col rounded-md border border-border bg-surface-white shadow-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        {/* Header with Close Button */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-border">
          <h2 id="settings-dialog-title" className="font-sans text-2xl text-text-heading italic">
            {language === 'zh' ? '全局设置' : 'Configuration'}
          </h2>
          <button
            onClick={() => setShowSettings(false)}
            className="p-2 text-text-muted hover:text-text-heading transition-colors rounded-md hover:bg-surface"
            aria-label={language === 'zh' ? '关闭设置' : 'Close settings'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          <button
            onClick={() => setConfigTab('general')}
            className={`py-3 px-4 text-xs font-bold  border-b-2 transition-colors ${
              configTab === 'general'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            {language === 'zh' ? '通用' : 'General'}
          </button>
          <button
            onClick={() => setConfigTab('ai')}
            className={`flex items-center gap-1.5 py-3 px-4 text-xs font-bold  border-b-2 transition-colors ${
              configTab === 'ai'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            {language === 'zh' ? 'AI 模型' : 'AI Models'}
          </button>
          <button
            onClick={() => setConfigTab('transcription')}
            className={`flex items-center gap-1.5 py-3 px-4 text-xs font-bold  border-b-2 transition-colors ${
              configTab === 'transcription'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            {language === 'zh' ? '转写' : 'Transcription'}
          </button>
          <button
            onClick={() => setConfigTab('sync')}
            className={`py-3 px-4 text-xs font-bold  border-b-2 transition-colors ${
              configTab === 'sync'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            {language === 'zh' ? '同步' : 'Sync'}
          </button>
          <button
            onClick={() => setConfigTab('privacy')}
            className={`flex items-center gap-1.5 py-3 px-4 text-xs font-bold  border-b-2 transition-colors ${
              configTab === 'privacy'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {language === 'zh' ? '隐私' : 'Privacy'}
          </button>
          <button
            onClick={() => setConfigTab('about')}
            className={`py-3 px-4 text-xs font-bold  border-b-2 transition-colors ${
              configTab === 'about'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            {language === 'zh' ? '关于' : 'About'}
          </button>
          <button
            onClick={() => setConfigTab('team')}
            className={`py-3 px-4 text-xs font-bold  border-b-2 transition-colors ${
              configTab === 'team'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-heading'
            }`}
          >
            {language === 'zh' ? '团队' : 'Team'}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-5" data-testid="settings-scroll-region">
          {configTab === 'ai' && (
            <div className="h-[65dvh] min-h-0 -m-2">
              <ModelLibrary language={language} />
            </div>
          )}
          {configTab === 'transcription' && (
            <TranscriptionSettingsSection
              language={language}
              showSettings={showSettings}
              configTab={configTab}
            />
          )}
          {configTab === 'general' && (
            <div className="space-y-5">
              {/* Workspace Path (read-only — manage via sidebar switcher) */}
              <div>
                <h3 className="font-sans text-xs font-bold  text-text-muted mb-2">
                  {language === 'zh' ? '当前工作区' : 'Current Workspace'}
                </h3>
                <div className="bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-text-heading break-all">
                  {workspaceRoot || (language === 'zh' ? '未设置' : 'Not set')}
                </div>
                <p className="text-xs text-text-muted mt-1.5">
                  {language === 'zh'
                    ? '在左侧栏的笔记本切换器中添加、切换或重命名笔记本，无需重启。'
                    : 'Add, switch, or rename workspaces from the sidebar switcher — no restart required.'}
                </p>
              </div>

              <hr className="border-border" />

              {/* Language */}
              <div>
                <h3 className="font-sans text-xs font-bold  text-text-muted mb-2">
                  {language === 'zh' ? '界面语言' : 'Language'}
                </h3>
                <div className="flex bg-surface p-1 rounded-md shadow-inner border border-border/50 gap-1">
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

              <hr className="border-border" />

              {/* Display Settings */}
              <div>
                <h3 className="font-sans text-xs font-bold text-text-muted mb-3">
                  {language === 'zh' ? '显示设置' : 'Display Settings'}
                </h3>

                {/* Font Family */}
                <div className="mb-3">
                  <label className="text-xs text-text-muted mb-1.5 block">
                    {language === 'zh' ? '字体' : 'Font'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { key: 'system', label: language === 'zh' ? '系统默认' : 'System', font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
                      { key: 'inter', label: 'Inter / 黑体', font: '"Inter", "Noto Sans SC", -apple-system, sans-serif' },
                      { key: 'serif', label: language === 'zh' ? '衬线' : 'Serif', font: '"Georgia", "Noto Serif SC", serif' },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => {
                          setSelectedFont(f.key);
                          document.documentElement.style.setProperty('--font-sans', f.font);
                          try { localStorage.setItem('df_selected_font', f.key); } catch {}
                        }}
                        className={`px-2 py-2 rounded-md text-[11px] font-medium transition-all border ${
                          selectedFont === f.key
                            ? 'bg-accent text-white border-accent shadow-sm'
                            : 'bg-surface text-text-muted border-border/50 hover:border-accent/30 hover:text-text-main'
                        }`}
                        style={{ fontFamily: f.font }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-text-muted">
                      {language === 'zh' ? '字体大小' : 'Font Size'}
                    </label>
                    <span className="text-xs font-mono text-accent">{Math.round((0.8 + textScale * 0.04) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={textScale}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setTextScale(val);
                      const scale = 0.8 + val * 0.04;
                      document.documentElement.style.setProperty('--text-scale', scale.toString());
                      try { localStorage.setItem('df_text_scale', String(val)); } catch {}
                    }}
                    className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                    <span>A</span>
                    <span>A</span>
                  </div>
                </div>

                {/* Font Weight */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-text-muted">
                      {language === 'zh' ? '字重' : 'Font Weight'}
                    </label>
                    <span className="text-xs font-mono text-accent capitalize">{fontWeightLabel}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    value={fontWeight}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setFontWeight(val);
                      const weights = [400, 500, 600];
                      const w = weights[val];
                      document.documentElement.style.setProperty('--font-weight-base', String(w));
                      try { localStorage.setItem('df_font_weight', String(val)); } catch {}
                    }}
                    className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                    <span>{language === 'zh' ? '细' : 'Light'}</span>
                    <span>{language === 'zh' ? '粗' : 'Bold'}</span>
                  </div>
                </div>

                {/* Life Context Brightness (only affects life theme) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-text-muted">
                      {language === 'zh' ? 'Life 亮度' : 'Life Brightness'}
                    </label>
                    <span className="text-xs font-mono text-accent">{80 + lifeBrightness * 20}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={lifeBrightness}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      setLifeBrightness(val);
                      const brightness = 0.8 + val * 0.02;
                      document.documentElement.style.setProperty('--life-brightness', brightness.toString());
                    }}
                    className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
                    <span>{language === 'zh' ? '暗' : 'Dark'}</span>
                    <span>{language === 'zh' ? '亮' : 'Bright'}</span>
                  </div>
                </div>
              </div>

              <hr className="border-border" />

              {/* Proactive proposals (Gap 3 — Sprint 1) */}
              <ProactiveSettingsSection
                language={language}
                showToast={showToast}
              />

              <hr className="border-border" />

              {/* Workspace Data: export / import / reset (Phase X) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-sans text-xs font-bold text-text-muted">
                    {language === 'zh' ? '工作区数据' : 'Workspace Data'}
                  </h3>
                  <span className="text-[9px] bg-accent/10 text-accent px-2 py-0.5 rounded font-bold">Beta</span>
                </div>
                <p className="text-[11px] text-text-muted mb-3">
                  {language === 'zh'
                    ? '备份、恢复或重置本地工作区。导出会下载一个 JSON 文件, 包含全部笔记 / 承诺 / 决策 / 证据。'
                    : 'Back up, restore, or reset the local workspace. Export downloads a JSON file with all notes / commitments / decisions / evidence.'}
                </p>

                <div className="space-y-2">
                  {/* Export */}
                  <button
                    onClick={handleExportWorkspace}
                    disabled={isExporting || !workspaceRoot}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-md text-xs font-bold hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'zh' ? '导出中...' : 'Exporting...'}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        {language === 'zh' ? '导出全部数据' : 'Export all data'}
                      </>
                    )}
                  </button>
                  {lastExportTime && !isExporting && (
                    <p className="text-[10px] text-text-muted text-center -mt-1">
                      {language === 'zh' ? '上次导出：' : 'Last exported: '}{formatRelativeTime(lastExportTime)}
                    </p>
                  )}

                  {/* Import */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isImporting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface border border-border rounded-md text-xs font-bold text-text-heading hover:bg-surface-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'zh' ? '导入中...' : 'Importing...'}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        {language === 'zh' ? '从 JSON 导入' : 'Import from JSON'}
                      </>
                    )}
                  </button>

                  {/* Reset (destructive) */}
                  <button
                    onClick={handleResetWorkspace}
                    disabled={isResetting || !workspaceRoot}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-md text-xs font-bold hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResetting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {language === 'zh' ? '重置中...' : 'Resetting...'}
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        {language === 'zh' ? '重置工作区…' : 'Reset workspace…'}
                      </>
                    )}
                  </button>

                  {dataStatus && (
                    <div
                      data-testid="workspace-data-status"
                      className={`text-xs p-2 rounded-md border ${
                        dataStatus.type === 'success'
                          ? 'bg-stone-50 text-stone-700 border-stone-200'
                          : dataStatus.type === 'error'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-stone-50 text-stone-700 border-stone-200'
                      }`}
                    >
                      {dataStatus.message}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {configTab === 'privacy' && (
            <div className="py-4 px-1" data-testid="settings-tab-privacy">
              <PrivacyPanel language={language} />
            </div>
          )}
          {configTab === 'sync' && (
            <div className="space-y-5">
              {/* Sync Sub-Tab Switcher */}
              <div className="flex bg-surface p-1 rounded-md shadow-inner border border-border/50 gap-1">
                <button
                  onClick={() => setSyncSubTab('feishu')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${syncSubTab === 'feishu' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                >
                  {language === 'zh' ? '飞书' : 'Feishu'}
                </button>
                <button
                  onClick={() => setSyncSubTab('google')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${syncSubTab === 'google' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                >
                  Google
                </button>
                <button
                  onClick={() => setSyncSubTab('github')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${syncSubTab === 'github' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                >
                  GitHub
                </button>
                <button
                  onClick={() => setSyncSubTab('ipfs')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${syncSubTab === 'ipfs' ? 'bg-white shadow-sm text-text-heading' : 'text-text-muted hover:text-text-main'}`}
                >
                  IPFS
                </button>
              </div>

              {syncSubTab === 'google' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                    <div className="rounded-md bg-green-500/10 p-2 text-green-700"><CalendarDays className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-text-heading">Google Calendar</h3>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${googleStatus?.connected ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                          {googleStatus?.connected ? (language === 'zh' ? '已连接' : 'Connected') : (language === 'zh' ? '未连接' : 'Not connected')}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                        {language === 'zh' ? '授权后，Google 主日历会直接显示在 DailyFlow 的日、周、月视图中。' : 'After authorization, your primary Google calendar appears in DailyFlow day, week, and month views.'}
                      </p>
                      {googleStatus?.accountEmail && <p className="mt-1 text-[10px] text-text-muted">{googleStatus.accountEmail}</p>}
                    </div>
                  </div>
                  {!googleStatus?.configured && (
                    <div className="rounded-xl border border-border/70 bg-background p-3">
                      <p className="text-xs font-semibold text-text-heading">{language === 'zh' ? '首次配置' : 'One-time setup'}</p>
                      <p className="mt-1 text-[11px] text-text-muted">
                        {language === 'zh' ? '填入 Google Cloud 中创建的“桌面应用”OAuth Client ID。这里只需要 Client ID，不需要密钥。' : 'Enter the Desktop app OAuth Client ID from Google Cloud. No client secret is required.'}
                      </p>
                      <input
                        value={googleClientId}
                        onChange={event => setGoogleClientId(event.target.value)}
                        placeholder="1234567890-….apps.googleusercontent.com"
                        className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-green-400"
                      />
                      <button
                        onClick={async () => {
                          const url = 'https://console.cloud.google.com/apis/credentials';
                          try { await open(url); } catch { window.open(url, '_blank', 'noopener,noreferrer'); }
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700"
                      >
                        <ExternalLink className="h-3 w-3" />{language === 'zh' ? '打开 Google Cloud 凭据页' : 'Open Google Cloud credentials'}
                      </button>
                    </div>
                  )}
                  {!googleStatus?.connected && (
                    <button
                      onClick={handleGoogleConnect}
                      disabled={googleLoading || (!googleStatus?.configured && !googleClientId.trim())}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-40"
                    >
                      {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                      {language === 'zh' ? '打开 Google 授权页' : 'Open Google authorization'}
                    </button>
                  )}
                  <button
                    onClick={handleGoogleCheck}
                    disabled={googleLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs font-bold text-text-main disabled:opacity-40"
                  >
                    <RefreshCw className={`h-4 w-4 ${googleLoading ? 'animate-spin' : ''}`} />
                    {language === 'zh' ? '检查连接' : 'Check connection'}
                  </button>
                  {googleMessage && <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-700">{googleMessage}</div>}
                </div>
              )}

              {syncSubTab === 'feishu' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
                    <div className="rounded-md bg-blue-500/10 p-2 text-blue-600">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-text-heading">
                          {language === 'zh' ? '飞书' : 'Feishu'}
                        </h3>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          feishuStatus?.authorized
                            ? 'bg-green-50 text-green-700'
                            : feishuStatusLoading
                              ? 'bg-stone-100 text-stone-600'
                              : 'bg-amber-50 text-amber-700'
                        }`}>
                          {feishuStatusLoading
                            ? (language === 'zh' ? '检查中' : 'Checking')
                            : feishuStatus?.authorized
                            ? (language === 'zh' ? '已连接' : 'Connected')
                            : feishuStatus?.appConfigured === false
                              ? (language === 'zh' ? '待准备' : 'Setup needed')
                              : (language === 'zh' ? '未连接' : 'Not connected')}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                        {feishuStatus?.authorized
                          ? (language === 'zh'
                            ? '任务和日程已可在 DailyFlow 与飞书之间同步。'
                            : 'Tasks and calendar can now sync between DailyFlow and Feishu.')
                          : (language === 'zh'
                            ? '连接后即可同步你的飞书任务和日程。'
                            : 'Connect to sync your Feishu tasks and calendar.')}
                      </p>
                      {feishuStatus?.userName && (
                        <p className="mt-1 truncate text-[10px] text-text-muted">
                          {language === 'zh' ? '当前账号：' : 'Account: '}{feishuStatus.userName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="hidden">
                      <StepNumber value="1" done={Boolean(feishuStatus?.appConfigured)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-text-heading">
                            {language === 'zh' ? '企业应用准备' : 'Enterprise app setup'}
                          </p>
                          {feishuStatus?.appConfigured && (
                            <span className="text-[10px] font-medium text-green-700">
                              {language === 'zh' ? '已就绪' : 'Ready'}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                          {feishuStatusLoading
                            ? (language === 'zh' ? '正在检查连接环境…' : 'Checking the connector environment…')
                            : !feishuStatus?.cliAvailable
                              ? (language === 'zh'
                                ? '当前安装包缺少飞书连接组件（lark-cli），请更新或重新安装 DailyFlow。'
                                : 'This build is missing the Feishu connector runtime (lark-cli). Update or reinstall DailyFlow.')
                              : feishuStatus?.appConfigured
                                ? (language === 'zh'
                                  ? `企业应用已配置${feishuStatus.appName ? `：${feishuStatus.appName}` : ''}。你不需要准备密钥。`
                                  : `Enterprise app ready${feishuStatus.appName ? `: ${feishuStatus.appName}` : ''}. You do not need to provide credentials.`)
                                : (language === 'zh'
                                  ? '需要企业管理员先创建飞书企业自建应用，并开通日历和任务权限。'
                                  : 'An admin must first create a Feishu custom app and enable Calendar and Tasks permissions.')}
                        </p>
                        {!feishuStatusLoading && feishuStatus?.cliAvailable && !feishuStatus.appConfigured && (
                          <button
                            onClick={async () => {
                              const url = 'https://open.feishu.cn/app';
                              try {
                                await open(url);
                              } catch {
                                window.open(url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 hover:text-blue-800"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {language === 'zh' ? '打开飞书开发者后台' : 'Open Feishu Developer Console'}
                          </button>
                        )}
                      </div>
                    </div>

                    {!feishuStatusLoading && feishuStatus?.appConfigured === false && !feishuStatus.cliAvailable && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                        <p className="text-xs font-semibold text-amber-900">
                          {language === 'zh' ? '当前版本暂时无法连接飞书' : 'Feishu is not available in this build'}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-800/80">
                          {language === 'zh'
                            ? '请更新 DailyFlow 或联系支持人员。你不需要安装命令行工具，也不需要配置开发者应用。'
                            : 'Update DailyFlow or contact support. You should not need to install command-line tools or configure a developer app.'}
                        </p>
                      </div>
                    )}

                    {!feishuStatusLoading && feishuStatus?.cliAvailable && feishuStatus.appConfigured === false && (
                      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                        <p className="text-xs font-semibold text-text-heading">
                          {language === 'zh' ? '首次连接准备' : 'One-time connection setup'}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                          {language === 'zh'
                            ? 'DailyFlow 会打开飞书官方页面完成一次性准备。无需安装命令行工具，也无需在这里填写 App ID 或 App Secret。'
                            : 'DailyFlow opens the official Feishu page for one-time setup. No CLI install, App ID, or App Secret is required here.'}
                        </p>
                        {!feishuSetupUrl && (
                          <button
                            onClick={handlePrepareFeishu}
                            disabled={feishuLoading}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {feishuLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                            {language === 'zh' ? '在飞书中继续' : 'Continue in Feishu'}
                          </button>
                        )}
                        {feishuSetupUrl && (
                          <div className="mt-3 space-y-2 rounded-lg border border-blue-200 bg-white p-3">
                            <ol className="space-y-1 text-[11px] leading-relaxed text-text-main">
                              <li>{language === 'zh' ? '1. 在飞书官方页面确认创建连接应用。' : '1. Confirm the connector app on the official Feishu page.'}</li>
                              <li>{language === 'zh' ? '2. 完成后回到 DailyFlow，应用会自动继续。' : '2. Return to DailyFlow; setup continues automatically.'}</li>
                            </ol>
                            {feishuSetupQrDataUrl && (
                              <div className="flex justify-center rounded-lg bg-white p-2">
                                <img
                                  src={feishuSetupQrDataUrl}
                                  alt={language === 'zh' ? '飞书连接准备二维码' : 'Feishu setup QR code'}
                                  className="h-36 w-36"
                                />
                              </div>
                            )}
                            <div className="break-all rounded-md bg-stone-50 px-2 py-1.5 text-[9px] text-text-muted">
                              {feishuSetupUrl}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => openFeishuUrl(feishuSetupUrl)}
                                className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-white px-2 py-2 text-[11px] font-semibold text-text-main hover:bg-black/[0.03]"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {language === 'zh' ? '重新打开' : 'Open again'}
                              </button>
                              <button
                                onClick={async () => {
                                  await navigator.clipboard.writeText(feishuSetupUrl);
                                  setFeishuMessage(language === 'zh' ? '连接链接已复制。' : 'Setup link copied.');
                                }}
                                className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-white px-2 py-2 text-[11px] font-semibold text-text-main hover:bg-black/[0.03]"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {language === 'zh' ? '复制链接' : 'Copy link'}
                              </button>
                            </div>
                            <button
                              onClick={handleFinishFeishuSetup}
                              disabled={feishuLoading}
                              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-2 text-[11px] font-semibold text-blue-700 disabled:opacity-50"
                            >
                              {feishuLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                              {language === 'zh' ? '重新检查' : 'Check again'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {feishuStatus?.appConfigured && (
                    <div className={`flex gap-3 rounded-xl border p-3 ${
                      feishuStatus?.appConfigured && !feishuStatus?.authorized
                        ? 'border-blue-200 bg-blue-50/40'
                        : 'border-border/70 bg-background'
                    }`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-text-heading">
                          {feishuStatus?.authorized
                            ? (language === 'zh' ? '账号已连接' : 'Account connected')
                            : (language === 'zh' ? '连接飞书' : 'Connect Feishu')}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                          {feishuStatus?.authorized
                            ? (language === 'zh'
                              ? `已连接${feishuStatus.userName ? `：${feishuStatus.userName}` : '企业账号'}。`
                              : `Connected${feishuStatus.userName ? `: ${feishuStatus.userName}` : ' enterprise account'}.`)
                            : (language === 'zh'
                              ? '点击连接，在飞书官方页面确认后即可返回 DailyFlow。'
                              : 'Connect, confirm on the official Feishu page, then return to DailyFlow.')}
                        </p>
                        {feishuStatus?.authorized && !feishuDeviceCode && (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={handleConnectFeishu}
                              disabled={feishuLoading}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white px-2 py-2 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              {language === 'zh' ? '重新授权' : 'Reauthorize'}
                            </button>
                            <button
                              onClick={handleDisconnectFeishu}
                              disabled={feishuLoading}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-white px-2 py-2 text-[11px] font-semibold text-text-muted hover:bg-black/[0.03] disabled:opacity-50"
                            >
                              {language === 'zh' ? '断开连接' : 'Disconnect'}
                            </button>
                          </div>
                        )}
                        {!feishuStatus?.authorized && feishuStatus?.appConfigured && !feishuDeviceCode && (
                          <button
                            onClick={handleConnectFeishu}
                            disabled={feishuLoading}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {feishuLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                            {language === 'zh' ? '连接飞书' : 'Connect Feishu'}
                          </button>
                        )}
                        {feishuDeviceCode && (
                          <div className="mt-2 space-y-2 rounded-lg border border-blue-200 bg-white p-3">
                            <ol className="space-y-1 text-[11px] leading-relaxed text-text-main">
                              <li>{language === 'zh' ? '1. 在飞书页面登录企业账号并点击授权。' : '1. Sign in on Feishu and approve access.'}</li>
                              <li>{language === 'zh' ? '2. 完成后回到 DailyFlow，连接状态会自动更新。' : '2. Return to DailyFlow; the connection updates automatically.'}</li>
                            </ol>
                            {feishuQrDataUrl && (
                              <div className="flex justify-center rounded-lg bg-white p-2">
                                <img
                                  src={feishuQrDataUrl}
                                  alt={language === 'zh' ? '飞书授权二维码' : 'Feishu authorization QR code'}
                                  className="h-40 w-40"
                                />
                              </div>
                            )}
                            {feishuVerificationUrl && (
                              <div className="break-all rounded-md bg-stone-50 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-stone-600">
                                {feishuVerificationUrl}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={reopenFeishuAuthorization}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-[11px] font-semibold text-text-main hover:bg-black/[0.03]"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                {language === 'zh' ? '重新打开' : 'Open again'}
                              </button>
                              <button
                                onClick={copyFeishuAuthorization}
                                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-[11px] font-semibold text-text-main hover:bg-black/[0.03]"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                {language === 'zh' ? '复制链接' : 'Copy link'}
                              </button>
                            </div>
                          </div>
                        )}
                        {feishuDeviceCode && (
                        <button
                          onClick={handleFinishFeishu}
                          disabled={feishuLoading}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {feishuLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                          {feishuLoading
                            ? (language === 'zh' ? '正在等待飞书确认…' : 'Waiting for Feishu…')
                            : (language === 'zh' ? '重新检查连接' : 'Check again')}
                        </button>
                      )}
                      </div>
                    </div>
                    )}

                    {feishuStatus?.authorized && (
                    <div className="rounded-xl border border-green-200 bg-green-50/30 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-text-heading">
                          {language === 'zh' ? '同步内容' : 'Sync content'}
                        </p>
                        <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-text-muted">
                          <p><span className="font-semibold text-text-main">{language === 'zh' ? '任务：' : 'Tasks: '}</span>{language === 'zh' ? 'DailyFlow ↔ 飞书任务，双向同步标题、描述、截止日和完成状态。' : 'DailyFlow ↔ Feishu Tasks, including title, description, due date, and completion.'}</p>
                          <p><span className="font-semibold text-text-main">{language === 'zh' ? '日程：' : 'Calendar: '}</span>{language === 'zh' ? '飞书日程显示在 DailyFlow；带时间的会议笔记可创建或更新飞书日程。' : 'Feishu events appear in DailyFlow; timed meeting notes can create or update Feishu events.'}</p>
                        </div>
                        {feishuStatus?.authorized && (
                          <button
                            onClick={handleFeishuSync}
                            disabled={feishuLoading}
                            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {feishuLoading
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <RefreshCw className="h-4 w-4" />}
                            {language === 'zh' ? '立即同步' : 'Sync now'}
                          </button>
                        )}
                      </div>
                    </div>
                    )}
                  </div>

                  {feishuMessage && (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-xs text-stone-700">
                      {feishuMessage}
                    </div>
                  )}
                  {(feishuStatus?.lastTaskSyncAt || feishuStatus?.lastCalendarSyncAt) && (
                    <p className="text-center text-[10px] text-text-muted">
                      {language === 'zh' ? '上次同步：' : 'Last sync: '}
                      {formatRelativeTime(feishuStatus.lastTaskSyncAt || feishuStatus.lastCalendarSyncAt!)}
                    </p>
                  )}
                </div>
              )}

              {syncSubTab === 'github' && (
              <div className="space-y-5">
              <hr className="border-border" />

              {/* GitHub Sync */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-sans text-xs font-bold  text-text-muted">
                    {language === 'zh' ? 'GitHub 同步' : 'GitHub Sync'}
                  </h3>
                  <span className="text-[9px] bg-accent/10 text-accent px-2 py-0.5 rounded font-bold">Beta</span>
                </div>

                {/* Detailed Tutorial */}
                <div className="bg-accent/5 border border-accent/20 rounded-md p-3 mb-3">
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
                    <p className="text-[11px] text-text-muted mb-1">
                      {language === 'zh'
                        ? '自动同步正在升级为带版本校验的保存机制，当前仅支持手动同步。'
                        : 'Automatic sync is being upgraded to version-aware saves; manual sync is currently available.'}
                    </p>
                    <select
                      value={0}
                      disabled
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent transition-colors"
                    >
                      <option value={0}>{language === 'zh' ? '手动同步' : 'Manual Sync'}</option>
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
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono"
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
                        className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm outline-none focus:border-accent transition-colors font-mono"
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
                            'Authorization': `token ${githubToken}`,
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
                    className="w-full py-2 bg-surface border border-border rounded-md text-xs font-bold  hover:bg-surface-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                    <div className={`text-xs p-2 rounded-md ${
                      githubVerifyStatus === 'success'
                        ? 'bg-stone-50 text-stone-700 border border-stone-200'
                        : 'bg-stone-50 text-stone-700 border border-stone-200'
                    }`}>
                      {githubVerifyMsg}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {syncSubTab === 'ipfs' && (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-sans text-xs font-bold text-text-muted">
                    {language === 'zh' ? '去中心化备份 (IPFS)' : 'Decentralized Backup (IPFS)'}
                  </h3>
                  <span className="text-[9px] bg-accent/10 text-accent px-2 py-0.5 rounded font-bold">Beta</span>
                </div>

                <div className="bg-accent/5 border border-accent/20 rounded-md p-3 mb-3">
                  <p className="text-xs text-text-main font-medium mb-2">
                    {language === 'zh' ? '📖 配置步骤：' : '📖 Setup Guide:'}
                  </p>
                  <ol className="text-xs text-text-muted space-y-2 list-decimal list-inside">
                    <li>
                      <strong>{language === 'zh' ? '注册 Pinata' : 'Sign up for Pinata'}</strong>
                      <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                        <li>{language === 'zh' ? '访问 pinata.cloud 注册免费账号（包含 1 GB 存储）' : 'Go to pinata.cloud and create a free account (1 GB free)'}</li>
                      </ul>
                    </li>
                    <li>
                      <strong>{language === 'zh' ? '生成 JWT API Key' : 'Generate a JWT API Key'}</strong>
                      <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                        <li>{language === 'zh' ? '前往 API Keys 页面，点击 "New Key"' : 'Visit the API Keys page and click "New Key"'}</li>
                        <li>{language === 'zh' ? '勾选 pinFileToIPFS 权限，复制生成的 JWT' : 'Enable pinFileToIPFS permission, copy the generated JWT'}</li>
                      </ul>
                    </li>
                    <li>
                      <strong>{language === 'zh' ? '粘贴 Token 并测试' : 'Paste the token and test'}</strong>
                      <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside text-[11px]">
                        <li>{language === 'zh' ? '点击下方"测试连接"，验证 token 有效' : 'Click "Test Connection" to verify the token works'}</li>
                        <li>{language === 'zh' ? '保存设置后，可使用"立即备份"上传' : 'After saving, use "Backup Now" to upload your workspace'}</li>
                      </ul>
                    </li>
                  </ol>
                </div>

                <div className="flex items-center justify-between mb-3 px-3 py-2 bg-surface border border-border rounded-md">
                  <div>
                    <p className="text-xs font-bold text-text-heading">
                      {language === 'zh' ? '启用 IPFS 备份' : 'Enable IPFS Backup'}
                    </p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {language === 'zh' ? '将工作区快照上传到 Pinata 永久存储' : 'Upload a workspace snapshot to Pinata for persistent storage'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIpfsEnabled(!ipfsEnabled)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      ipfsEnabled ? 'bg-accent' : 'bg-stone-300'
                    }`}
                    aria-checked={ipfsEnabled}
                    role="switch"
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                        ipfsEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {language === 'zh' ? 'Pinata JWT' : 'Pinata JWT'}
                    </label>
                    <div className="relative">
                      <input
                        type={showIpfsKey ? 'text' : 'password'}
                        value={ipfsApiKey}
                        onChange={e => setIpfsApiKey(e.target.value)}
                        placeholder="eyJhbGciOi..."
                        className="w-full bg-background border border-border rounded-md px-3 py-2 pr-10 text-sm outline-none focus:border-accent transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowIpfsKey(!showIpfsKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-heading transition-colors p-1"
                      >
                        {showIpfsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      {language === 'zh' ? 'IPFS 网关 (可选)' : 'IPFS Gateway (optional)'}
                    </label>
                    <input
                      type="text"
                      value={ipfsGateway}
                      onChange={e => setIpfsGateway(e.target.value)}
                      placeholder="https://gateway.pinata.cloud"
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent transition-colors font-mono"
                    />
                    <p className="text-[11px] text-text-muted mt-1">
                      {language === 'zh' ? '留空则使用 Pinata 默认网关' : 'Leave empty to use the Pinata default gateway'}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleTestIpfs}
                      disabled={ipfsTestStatus === 'loading'}
                      className="flex-1 py-2 bg-surface border border-border rounded-md text-xs font-bold hover:bg-surface-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {ipfsTestStatus === 'loading' ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{language === 'zh' ? '验证中...' : 'Verifying...'}</span>
                        </>
                      ) : (
                        <span>{language === 'zh' ? '测试连接' : 'Test Connection'}</span>
                      )}
                    </button>

                    <button
                      onClick={handleRunIpfsBackup}
                      disabled={!ipfsApiKey.trim() || isBackingUp}
                      className="flex-1 py-2 bg-accent text-white rounded-md text-xs font-bold hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isBackingUp ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{language === 'zh' ? '上传中...' : 'Uploading...'}</span>
                        </>
                      ) : (
                        <span>{language === 'zh' ? '立即备份' : 'Backup Now'}</span>
                      )}
                    </button>
                  </div>

                  {ipfsTestMsg && (
                    <div className="text-xs p-2 rounded-md bg-stone-50 text-stone-700 border border-stone-200">
                      {ipfsTestMsg}
                    </div>
                  )}

                  {ipfsBackups.length > 0 && (
                    <div className="mt-2">
                      <h4 className="text-xs font-bold text-text-muted mb-2">
                        {language === 'zh' ? '最近备份' : 'Recent Backups'}
                      </h4>
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {ipfsBackups.slice(0, 10).map(record => (
                          <div
                            key={record.cid}
                            className="flex items-center justify-between gap-2 px-3 py-2 bg-surface border border-border rounded-md"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-mono text-text-heading truncate" title={record.cid}>
                                {record.cid}
                              </p>
                              <p className="text-[10px] text-text-muted">
                                {new Date(record.createdAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                                {' · '}
                                {record.fileCount} {language === 'zh' ? '个文件' : 'files'}
                                {' · '}
                                {(record.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => handleCopyCid(record.cid)}
                                className="p-1.5 text-text-muted hover:text-text-heading hover:bg-background rounded-md transition-colors"
                                title={language === 'zh' ? '复制 CID' : 'Copy CID'}
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenGateway(record)}
                                className="p-1.5 text-text-muted hover:text-accent hover:bg-background rounded-md transition-colors"
                                title={language === 'zh' ? '在网关打开' : 'Open in gateway'}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
            </div>
          )}

          {configTab === 'about' && (
            <div className="space-y-5">
              {/* App Info */}
              <div className="text-center py-4">
                <div className="w-12 h-12 bg-accent text-white flex items-center justify-center font-sans text-xl font-bold rounded-md shadow-sm mx-auto mb-3">D</div>
                <h3 className="font-sans text-xl text-text-heading italic">DailyFlow</h3>
                <p className="text-xs text-text-muted mt-1">
                  {language === 'zh' ? '简洁高效的日常任务管理工具' : 'A minimal daily task manager'}
                </p>
              </div>

              <hr className="border-border" />

              {/* App Update */}
              <div>
                <h3 className="font-sans text-xs font-bold  text-text-muted mb-2">
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
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent text-white rounded-md text-xs font-bold  hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className={`p-4 rounded-md border ${
                      updateInfo.error
                        ? 'bg-stone-50 border-stone-200'
                        : updateInfo.hasUpdate
                          ? 'bg-stone-50 border-stone-200'
                          : 'bg-stone-50 border-stone-200'
                    }`}>
                      <div className="flex items-start gap-3">
                        {updateInfo.errorCode === 'dev_mode' ? (
                          <CheckCircle className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
                        ) : updateInfo.error ? (
                          <AlertCircle className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
                        ) : updateInfo.hasUpdate ? (
                          <AlertCircle className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 space-y-2">
                          <p className={`text-sm font-semibold ${
                            updateInfo.error ? 'text-stone-700' :
                            updateInfo.hasUpdate ? 'text-stone-700' : 'text-stone-700'
                          }`}>
                            {updateInfo.errorCode === 'dev_mode'
                              ? (language === 'zh' ? '开发模式 — 跳过更新检查' : 'Dev mode — update check skipped')
                              : updateInfo.error
                                ? (language === 'zh' ? '检查更新失败' : 'Update check failed')
                                : updateInfo.hasUpdate
                                  ? (language === 'zh' ? '发现新版本！' : 'New version available!')
                                  : (language === 'zh' ? '已是最新版本' : 'You are up to date')}
                          </p>
                          {updateInfo.errorCode === 'dev_mode' ? (
                            <p className="text-xs text-stone-600">
                              {language === 'zh'
                                ? '更新器仅在打包后的桌面应用中可用'
                                : 'Updater is only available in the packaged desktop app'}
                            </p>
                          ) : updateInfo.error ? (
                            <div className="space-y-2">
                              <p className="text-xs text-stone-600">
                                {localizeUpdateError(updateInfo.error, language)}
                              </p>
                              {updateInfo.fallbackUrl && (
                                <a
                                  href={updateInfo.fallbackUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  {language === 'zh' ? '前往 GitHub 下载' : 'Download from GitHub'}
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs space-y-1">
                              <p className={updateInfo.hasUpdate ? 'text-stone-600' : 'text-stone-600'}>
                                {language === 'zh' ? '当前版本: ' : 'Current: '}
                                <span className="font-mono font-semibold">{updateInfo.currentVersion}</span>
                              </p>
                              {updateInfo.hasUpdate && (
                                <p className="text-stone-600">
                                  {language === 'zh' ? '最新版本: ' : 'Latest: '}
                                  <span className="font-mono font-semibold">{updateInfo.latestVersion}</span>
                                </p>
                              )}
                            </div>
                          )}
                          {updateInfo.hasUpdate && (
                            <div className="mt-2 space-y-2">
                              {!updateDownloaded ? (
                                <button
                                  onClick={handleDownloadUpdate}
                                  disabled={isInstalling}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isInstalling ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      {installProgress.total > 0
                                        ? `${Math.round((installProgress.downloaded / installProgress.total) * 100)}%`
                                        : (language === 'zh' ? '下载中...' : 'Downloading...')}
                                    </>
                                  ) : (
                                    <>
                                      <Download className="w-3.5 h-3.5" />
                                      {language === 'zh' ? '下载更新' : 'Download Update'}
                                    </>
                                  )}
                                </button>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-xs text-green-600 font-semibold">
                                    {language === 'zh'
                                      ? '更新已下载，重启后生效'
                                      : 'Update downloaded. Restart to apply.'}
                                  </p>
                                  <button
                                    onClick={handleRelaunch}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-md text-xs font-bold hover:bg-accent/90 transition-colors"
                                  >
                                    {language === 'zh' ? '重启应用' : 'Restart App'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {configTab === 'team' && (
            <TeamSettings
              language={language}
              showSettings={showSettings}
              configTab={configTab}
              onChange={(enabled, config) => setTeamConfig({ enabled, config })}
            />
          )}

        </div>

        {/* Footer with Save Button */}
        <div className="border-t border-border p-4 flex justify-end gap-3">
          <button
            onClick={() => setShowSettings(false)}
            className="px-5 py-2 font-sans font-bold text-xs  text-text-muted hover:text-text-heading transition-colors"
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
                  workspaceRoot: workspaceRoot.trim(),
                  githubRepo: githubRepoInput.trim() || null,
                  ipfsEnabled,
                  ipfsProvider: 'pinata',
                  ipfsApiKey: ipfsApiKey.trim() || null,
                  ipfsGateway: ipfsGateway.trim() || null,
                  team: teamConfig.enabled ? teamConfig.config : null,
                }, config.version);
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

                // If workspace path changed, reload the in-memory workspace
                // without reloading the browser or losing unrelated UI state.
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

                    const selected = await filesApi.get(currentFileDate);
                    setMarkdown(selected?.content || '');
                    setLastSyncedMD(selected?.content || '');
                    setTasks(selected?.tasks || []);
                    dispatchDomainEvent(DOMAIN_EVENTS.workspaceChanged, {
                      reason: 'path-changed',
                      workspaceRoot: workspaceRoot.trim(),
                    });
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
            className="bg-accent text-white px-6 py-2 rounded font-sans font-bold text-xs  shadow-sm hover:bg-accent/90 transition-colors"
          >
            {language === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
