import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { getEventOperatorHealth, type EventOperatorHealth } from '../api/client';

export function RuntimeDiagnosticsCard({ language = 'en' }: { language?: 'zh' | 'en' }) {
  const zh = language === 'zh';
  const [result, setResult] = useState<EventOperatorHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const diagnose = async () => {
    setLoading(true); setError('');
    try { setResult(await getEventOperatorHealth()); }
    catch (value) { setResult(null); setError(value instanceof Error ? value.message : (zh ? '诊断失败' : 'Diagnostics failed')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void diagnose(); }, []);
  const health = result?.health;
  return <section className="rounded-xl border border-border bg-background/60 p-4" data-testid="runtime-diagnostics-card">
    <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold text-text-heading"><ShieldCheck className="h-4 w-4 text-accent" />{zh ? 'Event Operator Runtime' : 'Event Operator Runtime'}</h3><p className="mt-1 text-xs text-text-muted">{zh ? '只展示运行状态和版本，不读取或显示 API Key。' : 'Shows health and versions only; API keys are never read or displayed.'}</p></div><button type="button" onClick={() => void diagnose()} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-secondary disabled:opacity-50">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{zh ? '运行诊断' : 'Run diagnostics'}</button></div>
    {error ? <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700"><AlertCircle className="h-4 w-4" />{error}</div> : health && <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><Diagnostic label={zh ? 'Runtime' : 'Runtime'} value={`${result?.runtime ?? 'unknown'}${health.version ? ` ${health.version}` : ''}`} ok={health.ready} /><Diagnostic label={zh ? '模型' : 'Model'} value={health.modelConfigured ? (zh ? '已配置' : 'Configured') : (zh ? '需要配置' : 'Setup required')} ok={health.modelConfigured} /><Diagnostic label={zh ? '工具白名单' : 'Tool allowlist'} value={health.toolkitSafe === false ? (zh ? '校验失败' : 'Unsafe') : (zh ? '安全' : 'Safe')} ok={health.toolkitSafe !== false} /><Diagnostic label="Codex" value={health.codexSubagentEnabled ? (zh ? '已启用' : 'Enabled') : (zh ? '未启用' : 'Disabled')} ok={health.codexSubagentEnabled === true} /></div>}
    {health && !health.modelConfigured && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{zh ? '请先在上方模型中心配置 Provider、Model 和 API Key。配置完成前不会将模板结果冒充模型推理。' : 'Configure a provider, model, and API key above. Template output is never presented as model inference.'}</p>}
  </section>;
}

function Diagnostic({ label, value, ok }: { label: string; value: string; ok: boolean }) { return <div className="rounded-lg border border-border bg-surface-elevated p-2.5"><div className="flex items-center gap-1 text-[10px] text-text-muted">{ok ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertCircle className="h-3 w-3 text-amber-600" />}{label}</div><p className="mt-1 truncate font-medium text-text-heading" title={value}>{value}</p></div>; }
