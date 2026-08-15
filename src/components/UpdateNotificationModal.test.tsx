import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateNotificationModal } from './UpdateNotificationModal';
import type { UpdateInfo } from '../api/updater';

const baseInfo: UpdateInfo = {
  currentVersion: '1.7.0',
  latestVersion: '1.7.1',
  hasUpdate: true,
  releaseNotes: 'Bug fixes',
};

function renderModal(overrides: Partial<Parameters<typeof UpdateNotificationModal>[0]> = {}) {
  const props = {
    language: 'zh' as const,
    updateInfo: baseInfo,
    onClose: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onSkipVersion: vi.fn(),
    ...overrides,
  };
  render(<UpdateNotificationModal {...props} />);
  return props;
}

describe('UpdateNotificationModal', () => {
  it('shows "Update Now" when nothing downloaded yet', () => {
    renderModal();
    expect(screen.getByRole('button', { name: '立即更新' })).toBeInTheDocument();
    expect(screen.queryByText(/后台下载完成/)).not.toBeInTheDocument();
  });

  it('shows "Restart & Update" state when already downloaded', () => {
    renderModal({ alreadyDownloaded: true });
    expect(screen.getByText(/后台下载完成/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重启更新' })).toBeInTheDocument();
  });

  it('calls onUpdate when the primary button is clicked', async () => {
    const props = renderModal({ alreadyDownloaded: true });
    fireEvent.click(screen.getByRole('button', { name: '重启更新' }));
    expect(props.onUpdate).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipVersion and disables buttons while downloading', async () => {
    let resolve: () => void = () => {};
    const pending = new Promise<void>((r) => { resolve = r; });
    const props = renderModal({ onUpdate: vi.fn(() => pending) });

    fireEvent.click(screen.getByRole('button', { name: '立即更新' }));
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '跳过此版本' })).toBeDisabled();

    resolve();
    await pending;
    expect(props.onUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows an error message when update fails', async () => {
    renderModal({ onUpdate: vi.fn().mockRejectedValue(new Error('boom')) });
    fireEvent.click(screen.getByRole('button', { name: '立即更新' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('更新失败');
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
