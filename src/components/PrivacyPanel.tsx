/**
 * PrivacyPanel — settings sub-section that surfaces the
 * "0-byte upload" promise to the user. Lists every category of
 * outbound traffic and which explicit action controls it. The data is
 * static (audit done at compile time) so this component is cheap
 * and testable.
 */
import { ShieldCheck, Globe, Mic, Cloud, KeyRound, Webhook } from 'lucide-react';

interface PrivacyEntry {
  category: string;
  categoryEn: string;
  description: string;
  descriptionEn: string;
  control: string;
  controlEn: string;
  destinations: string[];
  icon: 'globe' | 'mic' | 'cloud' | 'key' | 'webhook';
}

const ENTRIES: PrivacyEntry[] = [
  {
    category: 'AI Chat 调用',
    categoryEn: 'AI Chat calls',
    description: '每条消息、上下文、用户选中的笔记都会发给所选模型',
    descriptionEn: 'Every message, context, and selected note is sent to the chosen model provider',
    control: '模型配置 + 点击发送',
    controlEn: 'Model setup + Send',
    destinations: ['OpenAI', 'Anthropic', 'Google', 'xAI', '本地 Ollama'],
    icon: 'globe',
  },
  {
    category: '会议转写',
    categoryEn: 'Meeting transcription',
    description: '仅远程模式会上传音频；保存录音、本地端点和 whisper.cpp 不出本机',
    descriptionEn: 'Only remote mode uploads audio; save-only, local endpoints, and whisper.cpp stay on device',
    control: '会议录音面板',
    controlEn: 'Meeting recorder',
    destinations: ['OpenAI-compatible', 'Deepgram', 'ElevenLabs', 'whisper.cpp (本地)'],
    icon: 'mic',
  },
  {
    category: '云端同步（IPFS / Pinata）',
    categoryEn: 'Cloud sync (IPFS / Pinata)',
    description: '用户显式开启后才会上传；关闭后纯本地工作',
    descriptionEn: 'Only uploads after explicit opt-in; pure-local by default',
    control: '同步设置',
    controlEn: 'Sync settings',
    destinations: ['Pinata IPFS', '本地文件系统'],
    icon: 'cloud',
  },
  {
    category: 'OAuth 集成',
    categoryEn: 'OAuth integrations',
    description: '飞书 / Google Calendar / GitHub 通过 OAuth 拿到用户授权后才连',
    descriptionEn: 'Feishu / Google Calendar / GitHub only connect after explicit OAuth grant',
    control: '集成授权',
    controlEn: 'Integration consent',
    destinations: ['飞书开放平台', 'Google Calendar', 'GitHub'],
    icon: 'key',
  },
  {
    category: '更新检查',
    categoryEn: 'Update checks',
    description: '仅在用户点"检查更新"时发请求到 GitHub Releases',
    descriptionEn: 'Only fires when user clicks "Check for updates" — never on startup',
    control: '仅手动检查',
    controlEn: 'Manual check only',
    destinations: ['GitHub Releases API'],
    icon: 'webhook',
  },
];

const ICONS = {
  globe: Globe,
  mic: Mic,
  cloud: Cloud,
  key: KeyRound,
  webhook: Webhook,
};

export interface PrivacyPanelProps {
  language: 'en' | 'zh';
}

export function PrivacyPanel({ language }: PrivacyPanelProps) {
  return (
    <div className="space-y-4" data-testid="privacy-panel">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-accent)]/20 bg-[var(--color-accent-light)] p-4">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--color-accent)]" />
        <div>
          <h3 className="text-sm font-semibold text-text-heading">
            {language === 'zh' ? '0 字节上传承诺' : 'Zero-byte upload promise'}
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-text-main">
            {language === 'zh'
              ? 'DailyFlow 框架本身从不主动上传你的文件。下方列出每一类外发请求及其实际控制位置。AI 调用必须由你选择模型并主动发送才会发生。'
              : 'The DailyFlow framework never proactively uploads your files. Each outbound category below names its actual control point. AI calls only happen after you choose a model and send.'}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {ENTRIES.map((entry, i) => {
          const Icon = ICONS[entry.icon];
          return (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-white/60 p-3"
              data-testid={`privacy-entry-${entry.category}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-text-heading">
                    {language === 'zh' ? entry.category : entry.categoryEn}
                  </h4>
                  <span className="rounded-full bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-accent)]">
                    {language === 'zh' ? entry.control : entry.controlEn}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-text-muted">
                  {language === 'zh' ? entry.description : entry.descriptionEn}
                </p>
                <p className="mt-1 text-[12px] text-text-muted/80">
                  {language === 'zh' ? '目标：' : 'Targets: '}
                  {entry.destinations.join(' · ')}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[12px] text-text-muted/80">
        {language === 'zh'
          ? '详细审计见 docs/ZERO_UPLOAD_AUDIT.md'
          : 'See docs/ZERO_UPLOAD_AUDIT.md for the full audit.'}
      </p>
    </div>
  );
}
