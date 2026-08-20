/**
 * Tests for TranscriptionSettingsSection (Sprint 1 Gap 5).
 *
 * Coverage required by the task spec:
 *   1. Renders the backend radio toggle and persists the choice to localStorage.
 *   2. Switches to local fields when 'Local Whisper' is selected.
 *   3. Calls transcriptionApi.setLocalConfig on Save and surfaces the status.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TranscriptionSettingsSection } from './TranscriptionSettingsSection';

const setLocalConfig = vi.fn();
const testLocalConfig = vi.fn();
const getLocalConfig = vi.fn();

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    transcriptionApi: {
      ...(actual.transcriptionApi as object),
      getLocalConfig: () => getLocalConfig(),
      setLocalConfig: (cfg: unknown) => setLocalConfig(cfg),
      testLocalConfig: (cfg: unknown) => testLocalConfig(cfg),
      transcribeLocal: vi.fn(),
    },
  };
});

describe("TranscriptionSettingsSection — Sprint 1 Gap 5", () => {
  beforeEach(() => {
    localStorage.clear();
    setLocalConfig.mockReset();
    testLocalConfig.mockReset();
    getLocalConfig.mockReset();
    getLocalConfig.mockResolvedValue({ config: null, defaults: {
      executablePath: "whisper-cli",
      modelPath: "/tmp/ggml-small.bin",
      ffmpegPath: "ffmpeg",
      language: "auto",
      extraArgs: [],
    } });
    setLocalConfig.mockResolvedValue({
      config: { executablePath: "/usr/local/bin/whisper-cli", modelPath: "/opt/model.bin", ffmpegPath: "ffmpeg", language: "auto", extraArgs: [] },
      status: { executable: true, model: true, ffmpeg: true },
    });
    testLocalConfig.mockResolvedValue({ executable: true, model: true, ffmpeg: true });
  });

  it("defaults to the OpenAI backend and persists the choice to localStorage", async () => {
    render(<TranscriptionSettingsSection language="en" showSettings configTab="transcription" />);

    const openaiRadio = await screen.findByTestId("transcription-backend-openai");
    const localRadio = screen.getByTestId("transcription-backend-local");
    expect(openaiRadio.getAttribute("aria-checked")).toBe("true");
    expect(localRadio.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByTestId("transcription-local-fields")).not.toBeInTheDocument();

    fireEvent.click(localRadio);
    expect(localStorage.getItem("dailyflow.transcription.backend")).toBe("local");
    expect(await screen.findByTestId("transcription-local-fields")).toBeInTheDocument();
    expect(localRadio.getAttribute("aria-checked")).toBe("true");
  });

  it("surfaces 4 inputs and the Test/Save actions when local backend is selected", async () => {
    localStorage.setItem("dailyflow.transcription.backend", "local");
    render(<TranscriptionSettingsSection language="en" showSettings configTab="transcription" />);

    expect(await screen.findByTestId("transcription-executable")).toBeInTheDocument();
    expect(screen.getByTestId("transcription-model")).toBeInTheDocument();
    expect(screen.getByTestId("transcription-ffmpeg")).toBeInTheDocument();
    expect(screen.getByTestId("transcription-language")).toBeInTheDocument();
    expect(screen.getByTestId("transcription-test")).toBeInTheDocument();
    expect(screen.getByTestId("transcription-save")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("transcription-executable"), { target: { value: "/usr/local/bin/whisper-cli" } });
    fireEvent.change(screen.getByTestId("transcription-model"), { target: { value: "/opt/ggml-small.bin" } });
    fireEvent.click(screen.getByTestId("transcription-save"));

    await waitFor(() => expect(setLocalConfig).toHaveBeenCalled());
    expect(setLocalConfig).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: "/usr/local/bin/whisper-cli",
      modelPath: "/opt/ggml-small.bin",
    }));
    expect(await screen.findByTestId("transcription-status")).toHaveTextContent("reachable");
  });

  it("honours the language dropdown and runs Test Connection via the API", async () => {
    localStorage.setItem("dailyflow.transcription.backend", "local");
    render(<TranscriptionSettingsSection language="zh" showSettings configTab="transcription" />);

    expect(await screen.findByTestId("transcription-language")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("transcription-executable"), { target: { value: "/usr/local/bin/whisper-cli" } });
    fireEvent.change(screen.getByTestId("transcription-model"), { target: { value: "/opt/ggml-medium.bin" } });
    fireEvent.change(screen.getByTestId("transcription-language"), { target: { value: "zh" } });

    fireEvent.click(screen.getByTestId("transcription-test"));
    await waitFor(() => expect(testLocalConfig).toHaveBeenCalled());
    expect(testLocalConfig).toHaveBeenCalledWith(expect.objectContaining({
      executablePath: "/usr/local/bin/whisper-cli",
      modelPath: "/opt/ggml-medium.bin",
      language: "zh",
    }));
    expect(await screen.findByTestId("transcription-saved")).toBeInTheDocument();
  });
});
