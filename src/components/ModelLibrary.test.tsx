/**
 * ModelLibrary tests — WP-C / C16 (error categories → actionable copy) and
 * C18 (save feedback).
 *
 * The four contract categories (auth / not_found / rate_limit / network)
 * each get their own actionable copy + 「打开设置」CTA. Errors outside the
 * map (unknown etc.) fall back to the raw server message.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ModelLibrary } from './ModelLibrary';
import { aiApi, V1ApiError } from '../api/client';

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => React.createElement('div', props, children),
  },
  // ConfirmDialog (A8) renders through AnimatePresence — the mock must
  // provide it or the dialog import blows up at module load.
  AnimatePresence: ({ children }: any) => children,
}));

vi.mock('lucide-react', () => {
  const Icon = (props: any) => React.createElement('span', { 'data-icon': true, ...props });
  return {
    Plus: Icon,
    Pencil: Icon,
    Trash2: Icon,
    Check: Icon,
    Loader2: Icon,
    Sparkles: Icon,
    Play: Icon,
    CheckCircle2: Icon,
    ExternalLink: Icon,
    Info: Icon,
    X: Icon,
    Eye: Icon,
    EyeOff: Icon,
  };
});

function renderZhLibrary() {
  return render(<ModelLibrary language="zh" />);
}

function openAddDrawerAndFill() {
  fireEvent.click(screen.getByText('添加'));
  fireEvent.change(screen.getByPlaceholderText('配置名称'), { target: { value: 'Test Provider' } });
  fireEvent.change(screen.getByPlaceholderText('https://api.example.com/v1'), {
    target: { value: 'https://api.example.com/v1' },
  });
  fireEvent.change(screen.getByPlaceholderText('例如 gpt-4o'), { target: { value: 'gpt-4o' } });
  fireEvent.change(screen.getByPlaceholderText('sk-...'), { target: { value: 'sk-test' } });
}

async function runTestConnectionAndAssertCopy(
  error: Error,
  expectedCopy: string,
  expectCta = true,
) {
  const summarizeSpy = vi.spyOn(aiApi, 'summarize').mockRejectedValue(error);
  renderZhLibrary();
  openAddDrawerAndFill();
  fireEvent.click(screen.getByText('测试连接'));

  await waitFor(() => {
    expect(screen.getByTestId('test-result-message')).toHaveTextContent(expectedCopy);
  });
  // Actionable categories ship an operable escape hatch (P3); the fallback
  // path intentionally has none.
  const cta = screen.queryByTestId('test-error-open-settings');
  if (expectCta) expect(cta).toHaveTextContent('打开设置');
  else expect(cta).toBeNull();
  summarizeSpy.mockRestore();
}

describe('ModelLibrary connection-test error mapping (C16)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('401 → auth: 「API Key 无效 · 请检查 Key 设置」+ 打开设置 CTA', async () => {
    await runTestConnectionAndAssertCopy(
      new V1ApiError('Invalid API key provided', { code: 'http_401', status: 401 }),
      'API Key 无效 · 请检查 Key 设置',
    );
  });

  it('404 → not_found: 「模型 ID 或 Base URL 不正确 · Base URL 常需以 /v1 结尾」+ CTA', async () => {
    await runTestConnectionAndAssertCopy(
      new V1ApiError('Model gpt-nope does not exist', { code: 'http_404', status: 404 }),
      '模型 ID 或 Base URL 不正确 · Base URL 常需以 /v1 结尾',
    );
  });

  it('429 → rate_limit: 「触发限流 · 请稍后再试」+ CTA', async () => {
    await runTestConnectionAndAssertCopy(
      new V1ApiError('Rate limit exceeded', { code: 'http_429', status: 429 }),
      '触发限流 · 请稍后再试',
    );
  });

  it('network → 「网络不可达 · 检查代理或离线状态」+ CTA', async () => {
    await runTestConnectionAndAssertCopy(
      new V1ApiError('Failed to fetch', { code: 'network' }),
      '网络不可达 · 检查代理或离线状态',
    );
  });

  it('unknown category falls back to the raw server message (no contract category → existing copy)', async () => {
    await runTestConnectionAndAssertCopy(
      new V1ApiError('Provider exploded mysteriously', { code: 'http_500', status: 500 }),
      'Provider exploded mysteriously',
      false,
    );
  });

  it('honours the WP-3 contract category field when the error object carries it', async () => {
    const contractError = Object.assign(
      new V1ApiError('upstream said no', { code: 'http_500', status: 500 }),
      { category: 'auth' as const },
    );
    await runTestConnectionAndAssertCopy(contractError, 'API Key 无效 · 请检查 Key 设置');
  });
});

describe('ModelLibrary save feedback (C18)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows a transient 「已保存」 toast for 1.5s after saving a provider', async () => {
    vi.useFakeTimers();
    renderZhLibrary();
    openAddDrawerAndFill();

    fireEvent.click(screen.getByText('添加并使用'));

    // Drawer closes, confirmation appears.
    expect(screen.queryByText('添加供应商')).toBeNull();
    const toast = screen.getByTestId('model-library-save-toast');
    expect(toast).toHaveTextContent('已保存');

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByTestId('model-library-save-toast')).toBeNull();
  });
});
