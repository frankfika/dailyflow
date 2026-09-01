/**
 * ProactiveSettingsSection — the "主动提案" panel of the Settings modal.
 *
 * Lets the user:
 *   - flip the global enable switch
 *   - pick the quiet hours (start/end, 0-24)
 *   - cap the weekly max
 *   - set the overdue threshold (default 5 days)
 *
 * State is loaded from /api/v2/proactive/config on mount and saved back
 * via PUT when the user changes anything. Network errors are surfaced via
 * the `showToast` callback that the parent already exposes.
 */
import { useEffect, useState } from 'react';
import { Sparkles, Save, Loader2 } from 'lucide-react';
import { proactiveApi, DEFAULT_PROACTIVE_CONFIG, type ProactiveConfig } from '../api/client';

interface ProactiveSettingsSectionProps {
  language: 'en' | 'zh';
  showToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

export function ProactiveSettingsSection({
  language,
  showToast,
}: ProactiveSettingsSectionProps) {
  const isZh = language === 'zh';
  const [config, setConfig] = useState<ProactiveConfig>(DEFAULT_PROACTIVE_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    proactiveApi
      .getConfig()
      .then(c => {
        if (cancelled) return;
        setConfig(c);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <K extends keyof ProactiveConfig>(key: K, value: ProactiveConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleQuietHours = (key: 'start' | 'end', raw: string) => {
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    setConfig(prev => ({ ...prev, quietHours: { ...prev.quietHours, [key]: n } }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await proactiveApi.setConfig(config);
      setConfig(saved);
      setDirty(false);
      showToast?.(isZh ? '已保存' : 'Saved', 'success');
    } catch (err) {
      showToast?.(
        isZh ? `保存失败: ${err instanceof Error ? err.message : 'unknown'}` : `Save failed: ${err instanceof Error ? err.message : 'unknown'}`,
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-md border border-border/70 p-4" data-testid="proactive-settings-loading">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {isZh ? '加载主动提案设置...' : 'Loading proactive settings...'}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border/70 p-4" data-testid="proactive-settings-section">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-sans text-xs font-bold text-text-muted flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          {isZh ? '主动提案' : 'Proactive Suggestions'}
        </h3>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            data-testid="proactive-save"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {isZh ? '保存' : 'Save'}
          </button>
        )}
      </header>

      <p className="mb-3 text-[12px] text-text-muted">
        {isZh
          ? 'AI 在检测到任务逾期 5 天后会主动问你是否排进今天。以下三条限制防止打扰。'
          : 'AI will ask "schedule this into today?" when a task is overdue 5+ days. The three limits below prevent nuisance.'}
      </p>

      {/* Enable switch */}
      <div className="mb-3 flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2">
        <div>
          <p className="text-xs font-bold text-text-heading">
            {isZh ? '启用主动提案' : 'Enable proactive suggestions'}
          </p>
          <p className="text-[11px] text-text-muted">
            {isZh ? '关闭后不再生成任何主动建议。' : 'Disable to stop all proactive suggestions.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => update('enabled', !config.enabled)}
          role="switch"
          aria-checked={config.enabled}
          data-testid="proactive-toggle"
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            config.enabled ? 'bg-accent' : 'bg-stone-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
              config.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Quiet hours */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-text-muted block mb-1">
            {isZh ? '静默开始 (0–24)' : 'Quiet hours start (0–24)'}
          </label>
          <input
            type="number"
            min={0}
            max={24}
            value={config.quietHours.start}
            onChange={e => handleQuietHours('start', e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="text-[11px] text-text-muted block mb-1">
            {isZh ? '静默结束 (0–24)' : 'Quiet hours end (0–24)'}
          </label>
          <input
            type="number"
            min={0}
            max={24}
            value={config.quietHours.end}
            onChange={e => handleQuietHours('end', e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Max per week */}
      <div className="mb-3">
        <label className="text-[11px] text-text-muted block mb-1">
          {isZh ? '每周最多主动建议次数' : 'Max proactive suggestions per week'}
        </label>
        <input
          type="number"
          min={0}
          max={100}
          value={config.maxPerWeek}
          onChange={e => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) update('maxPerWeek', n);
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
        />
      </div>

      {/* Overdue days */}
      <div>
        <label className="text-[11px] text-text-muted block mb-1">
          {isZh ? '触发阈值（逾期多少天）' : 'Trigger threshold (days overdue)'}
        </label>
        <input
          type="number"
          min={1}
          max={60}
          value={config.overdueTaskDays}
          onChange={e => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) update('overdueTaskDays', n);
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono outline-none focus:border-accent"
        />
      </div>
    </section>
  );
}
