import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PrivacyPanel } from './PrivacyPanel';

afterEach(() => cleanup());

describe('PrivacyPanel', () => {
  it('renders the 0-byte upload promise in Chinese', () => {
    render(<PrivacyPanel language="zh" />);
    expect(screen.getByTestId('privacy-panel')).toBeInTheDocument();
    expect(screen.getByText(/0 字节上传承诺/)).toBeInTheDocument();
  });

  it('renders the 0-byte upload promise in English', () => {
    render(<PrivacyPanel language="en" />);
    expect(screen.getByText(/Zero-byte upload promise/)).toBeInTheDocument();
  });

  it('lists all 5 outbound categories', () => {
    render(<PrivacyPanel language="zh" />);
    expect(screen.getByTestId('privacy-entry-AI Chat 调用')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-entry-会议转写')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-entry-云端同步（IPFS / Pinata）')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-entry-OAuth 集成')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-entry-更新检查')).toBeInTheDocument();
  });

  it('links to the audit doc', () => {
    render(<PrivacyPanel language="zh" />);
    expect(screen.getByText(/ZERO_UPLOAD_AUDIT\.md/)).toBeInTheDocument();
  });

  it('names the real control point instead of claiming there are switches on this page', () => {
    render(<PrivacyPanel language="en" />);
    expect(screen.getByText('Model setup + Send')).toBeInTheDocument();
    expect(screen.getByText('Meeting recorder')).toBeInTheDocument();
    expect(screen.getByText('Sync settings')).toBeInTheDocument();
    expect(screen.getByText('Integration consent')).toBeInTheDocument();
    expect(screen.getByText('Manual check only')).toBeInTheDocument();
    expect(screen.queryByText('Toggle here')).not.toBeInTheDocument();
  });
});
