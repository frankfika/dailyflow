import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingCaptureResult, NoteDocument, SourceItem } from '../api/client';
import { MeetingNotePanel, formatMeetingDuration } from './MeetingNotePanel';

const { captureNoteMeetingBinary, transcribeNoteMeeting, getSource } = vi.hoisted(() => ({
  captureNoteMeetingBinary: vi.fn(),
  transcribeNoteMeeting: vi.fn(),
  getSource: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, captureNoteMeetingBinary, transcribeNoteMeeting, getSource };
});

function note(overrides: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id: 'note_01',
    schemaVersion: 1,
    createdAt: '2026-07-29T01:00:00.000Z',
    updatedAt: '2026-07-29T01:00:00.000Z',
    createdBy: 'user',
    workspaceId: 'ws_01',
    title: 'Weekly sync',
    body: '',
    kind: 'meeting',
    state: 'active',
    projectIds: [],
    personIds: [],
    sourceIds: [],
    pinned: false,
    autoSaveVersion: 1,
    contentHash: 'hash',
    commitmentIds: [],
    ...overrides,
  };
}

function source(kind: SourceItem['kind'], id: string, body?: string): SourceItem {
  return {
    id,
    schemaVersion: 1,
    createdAt: '2026-07-29T01:00:00.000Z',
    updatedAt: '2026-07-29T01:00:00.000Z',
    createdBy: 'user',
    workspaceId: 'ws_01',
    kind,
    body,
    contentHash: `${id}-hash`,
    processingStatus: 'saved',
  };
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  static latest: MockMediaRecorder | null = null;
  state: RecordingState = 'inactive';
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType || 'audio/webm';
    MockMediaRecorder.latest = this;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) } as BlobEvent);
    this.onstop?.();
  }

  fail() {
    this.state = 'inactive';
    this.onerror?.(new Event('error'));
    this.onstop?.();
  }
}

describe('MeetingNotePanel', () => {
  const trackStop = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:meeting-audio');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    MockMediaRecorder.latest = null;
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    getSource.mockResolvedValue({ source: source('meeting_audio', 'src_audio') });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) },
    });
    vi.stubGlobal('MediaRecorder', MockMediaRecorder);
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(blob: Blob) {
        this.result = `data:${blob.type};base64,YXVkaW8=`;
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
  });

  it('formats long recordings as an unambiguous hour clock', () => {
    expect(formatMeetingDuration(24)).toBe('00:24');
    expect(formatMeetingDuration(6624)).toBe('01:50:24');
  });

  it('only renders for meeting notes', () => {
    const { container } = render(<MeetingNotePanel note={note({ kind: 'general' })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains transcription requirements before recording and exposes the API key in one step', () => {
    render(<MeetingNotePanel note={note()} />);

    expect(screen.queryByRole('combobox', { name: 'Transcription mode' })).not.toBeInTheDocument();
    expect(screen.getByTestId('transcription-setup-callout')).toHaveTextContent('do not require AI or an API key');
    expect(screen.getByTestId('transcription-setup-callout')).toHaveTextContent('provider’s API key');
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Set up remote transcription/ }));
    expect(screen.getByRole('combobox', { name: 'Transcription mode' })).toBeInTheDocument();
    expect(screen.getByText(/Add the selected provider’s API key/)).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close transcription settings' }));
    expect(screen.queryByRole('combobox', { name: 'Transcription mode' })).not.toBeInTheDocument();
  });

  it('records, previews, and saves audio without a remote model', async () => {
    const audioSource = source('meeting_audio', 'src_audio_new');
    const updated = note({ sourceIds: [audioSource.id] });
    const result: MeetingCaptureResult = {
      note: updated,
      audioSource,
      transcriptionMode: 'saved-only',
    };
    captureNoteMeetingBinary.mockResolvedValue(result);
    const onNoteUpdated = vi.fn();

    render(<MeetingNotePanel note={note()} language="en" onNoteUpdated={onNoteUpdated} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /right to record and process/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop' });

    expect(MockMediaRecorder.latest?.mimeType).toBe('audio/mp4');

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(await screen.findByRole('button', { name: 'Save recording' })).toBeInTheDocument();
    expect(trackStop).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Save recording' }));
    await waitFor(() => expect(captureNoteMeetingBinary).toHaveBeenCalled());
    expect(captureNoteMeetingBinary).toHaveBeenCalledWith('note_01', expect.objectContaining({
      audio: expect.any(Blob),
      filename: 'meeting-note_01.m4a',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Recording saved.');
    expect(onNoteUpdated).toHaveBeenCalledWith(updated, result);
  });

  it('uses only an explicitly configured speech provider and preserves the transcript separately', async () => {
    localStorage.setItem('df_meeting_transcription_settings', JSON.stringify({
      mode: 'remote',
      remoteApiKey: 'secret',
      remoteBaseUrl: 'https://example.test/v1',
      remoteModel: 'whisper-1',
      audioLanguage: 'zh',
    }));
    const transcriptSource = source('meeting_transcript', 'src_transcript');
    const result: MeetingCaptureResult = {
      note: note({ sourceIds: ['src_audio_new', transcriptSource.id] }),
      audioSource: source('meeting_audio', 'src_audio_new'),
      transcriptSource,
      text: 'A complete transcript',
      transcriptionMode: 'remote',
    };
    captureNoteMeetingBinary.mockResolvedValue({
      note: note({ sourceIds: ['src_audio_new'] }),
      audioSource: result.audioSource,
      transcriptionMode: 'saved-only',
    });
    transcribeNoteMeeting.mockResolvedValue(result);
    const onTranscriptReady = vi.fn();

    render(<MeetingNotePanel note={note()} onTranscriptReady={onTranscriptReady} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /right to record and process/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save & transcribe' }));

    await waitFor(() => expect(onTranscriptReady).toHaveBeenCalledWith('A complete transcript', result));
    expect(captureNoteMeetingBinary.mock.calls[0][1]).toEqual(expect.objectContaining({
      audio: expect.any(Blob),
      language: 'zh',
    }));
    expect(transcribeNoteMeeting).toHaveBeenCalledWith('note_01', {
      sourceId: 'src_audio_new',
      transcription: {
        mode: 'remote',
        apiKey: 'secret',
        baseUrl: 'https://example.test/v1',
        model: 'whisper-1',
        language: 'zh',
        provider: 'openai',
        diarize: true,
        speakerCount: undefined,
        keyterms: [],
      },
    });
  });

  it('uses the local whisper.cpp seam when a managed model is installed', async () => {
    localStorage.setItem('df_meeting_transcription_settings', JSON.stringify({
      mode: 'local-managed', modelId: 'small', installedModels: ['small'],
    }));
    const audioSource = source('meeting_audio', 'src_local_audio');
    const saved = { note: note({ sourceIds: [audioSource.id] }), audioSource, transcriptionMode: 'saved-only' as const };
    const completed = { ...saved, transcriptSource: source('meeting_transcript', 'src_local_text', '本地转写'), text: '本地转写', transcriptionMode: 'local-managed' as const };
    captureNoteMeetingBinary.mockResolvedValue(saved);
    transcribeNoteMeeting.mockResolvedValue(completed);

    render(<MeetingNotePanel note={note()} language="zh" />);
    fireEvent.click(screen.getByRole('checkbox', { name: /有权录音和处理/ }));
    fireEvent.click(screen.getByRole('button', { name: '开始录音' }));
    await screen.findByRole('button', { name: '停止' });
    fireEvent.click(screen.getByRole('button', { name: '停止' }));
    fireEvent.click(await screen.findByRole('button', { name: '保存并转写' }));

    await waitFor(() => expect(transcribeNoteMeeting).toHaveBeenCalledWith('note_01', expect.objectContaining({
      sourceId: 'src_local_audio',
      transcription: expect.objectContaining({ mode: 'local-managed', engine: 'whisper.cpp', modelId: 'small' }),
    })));
  });

  it('clearly distinguishes a saved recording from a failed transcription', async () => {
    localStorage.setItem('df_meeting_transcription_settings', JSON.stringify({
      mode: 'remote',
      remoteApiKey: 'secret',
      remoteBaseUrl: 'https://example.test/v1',
      remoteModel: 'whisper-1',
    }));
    const audioSource = source('meeting_audio', 'src_audio_new');
    captureNoteMeetingBinary.mockResolvedValue({
      note: note(),
      audioSource,
      transcriptionMode: 'saved-only',
    } satisfies MeetingCaptureResult);
    transcribeNoteMeeting.mockRejectedValue(new Error('provider unavailable'));

    render(<MeetingNotePanel note={note()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /right to record and process/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save & transcribe' }));

    expect(await screen.findByText(/Recording saved, but remote transcription failed/)).toHaveTextContent('provider unavailable');
    expect(screen.getByTestId('meeting-notice-warning')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stops microphone tracks and releases the preview URL on unmount', async () => {
    const view = render(<MeetingNotePanel note={note()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /right to record and process/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await screen.findByRole('button', { name: 'Save recording' });

    act(() => view.unmount());
    expect(trackStop).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:meeting-audio');
  });

  it('recovers when the recorder or audio device fails mid-recording', async () => {
    render(<MeetingNotePanel note={note()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /right to record and process/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop' });

    act(() => MockMediaRecorder.latest?.fail());

    expect(screen.getByRole('alert')).toHaveTextContent('Recording stopped unexpectedly');
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled();
    expect(trackStop).toHaveBeenCalled();
  });

  it('keeps a failed preview saveable and explains that the audio is intact', async () => {
    render(<MeetingNotePanel note={note()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /right to record and process/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop' });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));

    const preview = screen.getByTestId('meeting-note-panel').querySelector('audio');
    expect(preview).not.toBeNull();
    fireEvent.error(preview!);

    expect(screen.getByRole('status')).toHaveTextContent('audio is intact and can still be saved');
    expect(screen.getByRole('button', { name: 'Save recording' })).toBeEnabled();
  });

  it('shows existing recording and transcript source counts', async () => {
    getSource
      .mockResolvedValueOnce({ source: source('meeting_audio', 'src_audio') })
      .mockResolvedValueOnce({
        source: source('meeting_transcript', 'src_transcript', '[00:01] 方辰: 发布计划已确认。'),
      });

    render(<MeetingNotePanel note={note({ sourceIds: ['src_audio', 'src_transcript'] })} />);

    expect(await screen.findByText(/Saved recordings\s*·\s*1/)).toBeInTheDocument();
    expect(screen.getByLabelText('Meeting recording 1')).toHaveAttribute(
      'src',
      expect.stringContaining('/api/v2/notes/note_01/meeting/audio/src_audio'),
    );
    const summary = screen.getByText(/Latest transcript\s*·\s*1/);
    expect(summary.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(screen.getByText('[00:01] 方辰: 发布计划已确认。')).toBeInTheDocument();
  });

  it('lets the user explicitly copy a preserved transcript into the editable note', async () => {
    const onInsertTranscript = vi.fn();
    getSource.mockResolvedValueOnce({
      source: source('meeting_transcript', 'src_transcript', '讨论完成，下一步发布。'),
    });

    render(
      <MeetingNotePanel
        note={note({ sourceIds: ['src_transcript'] })}
        language="zh"
        onInsertTranscript={onInsertTranscript}
      />,
    );

    fireEvent.click(await screen.findByText(/最新转写稿\s*·\s*1/));
    fireEvent.click(screen.getByRole('button', { name: '加入笔记并编辑' }));
    expect(onInsertTranscript).toHaveBeenCalledWith('讨论完成，下一步发布。');
  });
});
