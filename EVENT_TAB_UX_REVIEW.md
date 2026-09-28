# DailyFlow — `fix/event-tab-edits-node` UX Review

> Reviewed the uncommitted change adding (1) LocalModelsPanel + SSE download, (2) browser TTS "Read aloud" with pause/resume/stop, (3) auto-insert transcript into note body, (4) meeting status pills in the list + pending badge on the "Start meeting" CTA, (5) clickable transcription status badge that toggles the local-models panel. Compared against the prior `EVENT_UX_REVIEW.md` tone (no silent failures, no dead affordances, two views must agree, keyboard semantics layered).
>
> Scope: **report only**, no code modified.

---

## Critical (block)

### C1 — Transcription status badge is now a button that opens a settings panel the user didn't ask for, and the affordance is not readable as a button

- **Scenario:** A new user on a fresh meeting note (no model, no API key) sees the amber pill in the meeting panel header. They intuitively understand "amber = needs attention", but they were never told it's a button. They click it.
- **Current behaviour:** The pill is now a `<button>` (`MeetingNotePanel.tsx:575–585`) that toggles `showTranscriptionSettings`, which renders a *transcription backend picker* (save-only / remote / local-managed). The LocalModelsPanel sits below the panel body, independent of this toggle. To actually download a ggml checkpoint the user must (a) notice a separate collapsed section with a `+` button, OR (b) pick "local-managed" inside the panel the badge just opened, which then asks them to type a model path manually. Two completely separate paths to the same goal; the badge leads to the wrong one.
- **Why it matters:** This is exactly the "UI promises a capability it doesn't have" anti-pattern flagged as R3 in the prior review. The badge LOOKS like a status indicator, but clicking it opens a panel unrelated to what its label suggests ("Local Whisper ready" or "Recording only"). A user with no local model clicks "Local Whisper ready" expecting something to happen and lands on a backend picker. Trust collapse.
- **Suggested fix:** Pick one of two clear directions and make the badge do exactly that:
  1. Re-label the badge to a verb (e.g. "Transcription setup ▾" / "本地转写设置 ▾") so users know clicking opens a menu. OR
  2. Make the badge only open when amber (needs setup) and open the LocalModelsPanel directly when green (open model picker), and use a non-button `<span>` with a tooltip when there's nothing to act on.
- Either way: **the badge click must open the LocalModelsPanel** when local is selected, not a different settings panel. Today the badge click and the LocalModelsPanel are wired to two unrelated state booleans (`showTranscriptionSettings` vs. `LocalModelsPanel.expanded`). The user has to learn two toggles.

### C2 — Auto-insert failures are swallowed silently; the manual re-insert button still says "Re-insert into note" with no context

- **Scenario:** User records a 40-minute meeting. Whisper finishes. The panel calls `onInsertTranscript(result.text)` inside a `try { } catch { }` block (`MeetingNotePanel.tsx:499–504`) — *the entire catch is empty*. The user sees `t.transcribed` ("转写完成 / transcribed") and assumes the body now contains the transcript.
- **Current behaviour:** If `composeTranscriptInsertion` returns `null` (the body already contains the transcript — e.g. a duplicate or a no-op idempotent call from a retry), or if `markdownEditorRef.current?.setMarkdown` throws (editor unmounted mid-call, focus stolen, ref stale), the user gets zero feedback. Meanwhile the inline button label is `"重新写入笔记" / "Re-insert into note"` — implying "this is the manual recovery path" — but it's only shown when `state === 'ready'` in the original code path, so on success it disappears. The user cannot tell whether auto-insert ran, succeeded, was a no-op, or failed.
- **Why it matters:** This is the **same trust-destroying failure mode** as P2-9 in the prior review (template seed silently swallowed). The diff comments even acknowledge the failure mode — "Surface only the original success message; the user can still hit the manual 'Add to note' affordance if the auto-insert failed" — but the manual button is then replaced by the success state, so the affordance disappears exactly when it's needed.
- **Suggested fix:**
  1. When `autoInsertTranscript` is true and `composeTranscriptInsertion` returns `null` because the transcript is already present, set a softer notice: "Transcript is already in the note" / "转写内容已在笔记里".
  2. When the call throws, set `noticeTone: 'warning'` and text like "Saved, but auto-insert into the note failed — use Re-insert to retry" / "已保存，自动写入笔记失败，可手动重新写入".
  3. Keep the "Re-insert" button visible (or at least visible after a failed auto-insert) for a few seconds so the recovery path is reachable.
  4. Track an `autoInsertFailed: boolean` in component state and reflect it on the button label or a small `↻ retry` chip.

### C3 — Read-aloud on switch-note: `useBrowserTts` looks correct on paper but has a real-world desync on the "click note A, then click note B while A is reading" path

- **Scenario:** User opens meeting note A, clicks Read aloud. While it's reading, user clicks note B in the list to check something else.
- **Current behaviour:** `useBrowserTts.ts:127–136` — `stop()` calls `window.speechSynthesis.cancel()` and broadcasts a `'cancelled'` event. Non-owner instances see the broadcast and call `setIsSpeaking(false); setIsPaused(false)`. Good. But:
  - On note A's unmount, the cleanup effect (`useBrowserTts.ts:187–198`) cancels the global queue **only if** `activeOwnerId === ownerIdRef.current`. Fine — when the user navigates to a different note, A unmounts, B mounts, A is still the owner, so global is cancelled. **However**, A's last broadcast is `'cancelled'` *only if stop() was called*. If the user just clicks away without calling stop, no broadcast is fired and B's mount sees the global speaker mid-sentence. B then renders its own `isSupported && note.kind === 'meeting'` block — it will *not* show a pause/stop button because `tts.isSpeaking` is `false` locally (B never saw a `'started'` event from A, because B wasn't mounted yet). Speech keeps playing on the OS with no on-screen control.
  - On most browsers, `window.speechSynthesis` continues even across soft navigations inside a SPA, so the user is hearing note A while looking at note B with no way to stop it.
  - The active-owner-id mechanism (`activeOwnerId === ownerIdRef.current` in the unmount cleanup) is also broken on hard refresh — the module-level `activeOwnerId` resets to `null`, but the OS speech engine can keep playing across the reload in Chrome (and definitely in Safari if the page is restored).
- **Why it matters:** This is a literal "UI promises nothing while audio plays" — the new note's toolbar shows no TTS controls even though sound is coming out. The user closes the app thinking it's still recording or doing something. On iOS Safari the OS even continues speaking past the tab switch.
- **Suggested fix:**
  1. On any `useBrowserTts` mount, if `window.speechSynthesis.speaking || .pending || .paused` is true at mount time, **claim ownership** by calling `window.speechSynthesis.cancel()` immediately. Don't assume the new note wants to inherit playback; if it did, the user will press play again.
  2. Add a `window.addEventListener('pagehide', ...)` (and `visibilitychange`) handler that calls `cancel()` and clears `activeOwnerId`.
  3. Add a global "Now reading" indicator that's owned by the module, not the React component — a floating control bar in the bottom-right corner — so even when no `useBrowserTts` consumer is mounted the user has a stop button.
  4. NoteEditor's `useEffect(() => { ... }, [noteId])` should explicitly call `tts.stop()` whenever `noteId` changes.

---

## Important (should fix)

### I1 — "Start meeting" CTA now has a red badge with a pending count, but the count has two meanings that read very differently

- **Scenario:** New user lands on the Meetings tab. They see a red button "Start meeting" with a red badge "3". They assume "3 things need my attention" but don't know what.
- **Current behaviour:** `NoteList.tsx:252–258` and `:265–267`:
  - `pending` counts notes where `meetingStatus` is `'none'` (just created, no audio yet) **or** `'audio'` (audio saved but body not yet drafted). That's two distinct states that need two different actions: "open and start recording" vs. "open and finish transcribing/drafting".
  - The pill on each note (line 472–487) already distinguishes these visually as "未开始 / 待转写", but the CTA badge lumps them. A user with 5 just-created empty notes sees a red "5" before they've even understood what the CTA does.
  - The CTA was just renamed from "会议笔记" (a noun describing what gets created) to "开始会议" (a verb) — a notable copy change that needs its own discoverability review. "开始会议" reads as "begin the meeting NOW" (a calendar/event action), not "create a meeting note". User with a real ongoing calendar meeting will probably look for that action here and be confused that clicking it just opens an editor.
  - The badge uses red on red (`bg-red-600` text on `bg-red-50/60` background) — color contrast is fine but the badge color is the same as the button border so the badge can feel like part of the button rather than a counter.
- **Why it matters:** "Pending" is ambiguous; the same number can mean "5 untouched notes" (low urgency) or "5 recordings waiting to be transcribed" (could lose work). The badge has no tooltip, no aria-label beyond the count, and no progressive disclosure.
- **Suggested fix:**
  1. Split the badge or use stacked dots: 🟡 for `audio` (recordings waiting), ⚪ for `none` (untouched). Or show "5 pending · 2 to transcribe".
  2. Add a `title` attribute with the full breakdown, e.g. `title="3 untouched · 2 recordings awaiting transcription"`.
  3. Consider replacing the badge with a per-state icon next to the count, OR a small expandable disclosure ("3 pending ▾").
  4. Reconsider the CTA label: "会议笔记 / Meeting note" was a noun (clear affordance: clicking creates a note). "开始会议 / Start meeting" implies an action that might involve other people or a calendar. If the verb is intentional, add a subtitle hint like "Create a meeting note and start recording" / "新建会议笔记 + 录音".

### I2 — LocalModelsPanel default-collapsed, `+` / `−` toggle is not discoverable

- **Scenario:** New user opens the Local models panel section heading (visible because it's rendered inside `MeetingNotePanel`). They see "本地模型 / Local models", a one-line description, a `+` and a refresh icon on the right. They don't click `+` because they read the description as "this is just info".
- **Current behaviour:** `LocalModelsPanel.tsx:102` — `expanded` defaults to `false`. The `+` glyph on a `<button>` with no text label, no visible border, only `text-text-muted` and a small hover background (`LocalModelsPanel.tsx:165–173`) is very easy to miss next to the system's title row. The refresh icon and the `+` icon both sit on the right side and visually compete. The system-check block **is** always visible (good), but if whisper-cli + ffmpeg are both missing, the user is shown only an install command — they don't yet know that the same panel has the model downloader behind the `+`.
- **Why it matters:** The point of this whole change is "no terminal beyond `brew install …`". But the model downloader — the headline feature — is hidden behind a `+` that's styled identically to a generic expand chevron. New users will hit "ffmpeg not found", copy the install line, fix it, and never realize they can also pick the model in-app.
- **Suggested fix:**
  1. Default `expanded = true` when `systemCheck.data?.ready === true` (system is OK → let them pick a model now). Keep collapsed only when the system check is still loading or the host isn't ready.
  2. Replace the `+`/`−` glyph with a visible chevron + text: "Show models ▾" / "Hide models ▴" / "可选模型 ▾ / ▴". A button that's only a single character is below the discoverability floor.
  3. If the panel must remain collapsed by default, render a one-line teaser inside the collapsed state: "0 models installed · Choose a ggml checkpoint →".

### I3 — Clickable transcription status badge doesn't look like a button (interaction discoverability)

- **Scenario:** Brand new user, no model. They look at the meeting note panel header and see an amber pill that says "Recording only". They want to set up transcription.
- **Current behaviour:** The badge is now a `<button>`, but its visual treatment is unchanged from when it was a `<span>`: rounded-full pill, no border, no caret, no obvious "click me" affordance. Hover gives a subtle background color shift (`hover:bg-amber-100`) but no underline, no shadow, no cursor change beyond the default pointer. The same area has a **second** button immediately to its right — the gear icon "设置 / Settings" — that opens the same panel. Two stacked affordances doing the same thing.
- **Why it matters:** The pill is the most visually prominent call to action in the header (it's the only colored element), so users *will* click it. But because there's already a separate Settings button doing the same thing, users will be confused about which to use. And the green state ("Transcription ready / 本地转写就绪") now also reads as a button — clicking the green pill opens the same panel, which is a wasted click for a user who's already happy with the state.
- **Suggested fix:**
  1. Drop the duplicate Settings button when the badge is already a button. Or vice versa: keep the badge as `<span>` and let only Settings toggle the panel.
  2. If the badge stays a button: add `▾` caret when collapsed, `▴` when open. Add `cursor-pointer` (already implicit on `<button>`) but more importantly add an underline-on-hover or a tiny ring on focus-visible so keyboard users can see it.
  3. When the badge is in the "ready" state, change its label to "Local Whisper ready · change ▾" so the click has a purpose; or render a non-button status with a separate "Change" link.

### I4 — Read-aloud and iOS Safari: 14-character utterance limit + scroll/page-focus concerns

- **Scenario:** User records a 30-minute meeting, body is 4,000 chars of Chinese transcript. They tap Read aloud on iPhone Safari.
- **Current behaviour:** `useBrowserTts.ts:154–185` — `speak()` does `window.speechSynthesis.cancel(); new SpeechSynthesisUtterance(trimmed); ... .speak(utterance)`. **No chunking.** iOS Safari will silently truncate to ~14 chars (older releases) or skip mid-utterance entirely. The hook's `onend` handler resets `isSpeaking=false`, but on Safari the truncation is silent so the user thinks the read finished. They hear "会议开始" and the button flips to "Read aloud" again.
  - Also: `utterance.lang = 'zh-CN'` is fine, but `pickVoice` (line 67–78) returns the first voice whose `lang.toLowerCase().startsWith('zh')`. If the device has no zh voice installed (common in CN-region devices without downloaded voices, or in low-storage configs), it falls back to `voices[0]` — which can be English. Chinese transcript read in an English voice is a jarring, hard-to-reverse failure.
- **Why it matters:** Mobile is the primary recording form factor for meetings. The whole feature is moot if Read aloud only works on desktop.
- **Suggested fix:**
  1. Chunk the text into ≤150-char utterances at sentence boundaries (`。`, `!`, `?`, `\n\n`). On each `onend`, speak the next chunk. Track chunk index in a ref.
  2. Detect `lang.toLowerCase().startsWith('zh')` failure: if no zh voice is installed, surface a notice "No Chinese voice installed on this device — Read aloud will use the default English voice" / "当前设备未安装中文语音，将用默认英文朗读".
  3. Add a `data-testid` and a visible status that says "Reading aloud · chunk 3/12" so the user knows it's working.
  4. The voice selection should also expose a voice picker in the UI for users who want to override (this is the standard pattern in Voice Memos / Safari reader).

### I5 — SSE download progress for a 1.5 GB model: progress bar is present but the failure modes are not

- **Scenario:** User picks `large-v3` (1.5 GB). They wait. Their WiFi drops for 20 seconds, comes back. Their corporate proxy blocks Hugging Face. Their disk is almost full. The user has no idea what's happening.
- **Current behaviour:** `LocalModelsPanel.tsx:384–400` renders a 1.5px-tall progress bar with `aria-valuenow` and `data-percent`. The `progress` state comes from `useLocalModelEvents` (`useLocalAsrModels.ts:156–184`) which subscribes to SSE. Looking at `useDownloadLocalModel` (`useLocalAsrModels.ts:104–126`), the hook fires a one-shot `transcriptionApi.downloadLocalModel(modelId)` — that's a *single request* that presumably runs server-side and streams progress via SSE. Good in principle.
  - But: the bar only updates when SSE `progress` events arrive. The **download endpoint itself** is fire-and-forget from the hook's perspective — there's no error reporting on the response, only on the SSE `failed` event. If the connection drops or the proxy blocks at L4, the user sees a "stuck at 12%" bar indefinitely.
  - There's no ETA, no bytes/total visible to the user (the `ModelDownloadProgress` has `bytes` and `totalBytes` but they're never rendered).
  - There's no Cancel button — once started, the user can't abort without killing the server.
  - There's no resume — if the proxy blocks for 5 minutes mid-download, the user has to start over.
- **Why it matters:** The whole pitch is "Download ggml checkpoints from inside DailyFlow". If the user has to babysit 1.5 GB downloads and has no recourse on failure, that's worse than the manual `brew install …` they replaced.
- **Suggested fix:**
  1. Render `bytes / totalBytes` and an ETA alongside the bar (server already supplies the data).
  2. Add a Cancel button that calls a `cancelLocalModelDownload(modelId)` API.
  3. Add a `failed` state retry button (currently the failed pill is shown but the only way to retry is to click the original Download button again — that doesn't appear next to the failed pill).
  4. Server-side: implement HTTP Range / resumable download so SSE dropouts don't force a 1.5 GB restart.
  5. On disk-full mid-download, the SSE `failed` event should include the underlying error; surface it via `progress.error` (already wired in `LocalModelsPanel.tsx:401–403`) but only when the panel is expanded. Currently if user collapsed the panel mid-download and the download fails, they have no way to see the error — they'd need to re-expand. Add a persistent toast for download failure.

### I6 — iOS Safari SpeechSynthesisUtterance 14-character limit is a critical case I1 only hints at; the chunking should be unconditional, not optional

Already covered substantively in I4 — moving to **Important** (not Critical) because it's the same hook, but I want to flag that the prior code path was a single utterance of arbitrary length. Any reasonable Chinese meeting transcript (≥ 1,000 chars) will hit this.

### I7 — Network/system check failures: silent, indistinguishable from "not yet loaded"

- **Scenario:** User is offline. They open the meeting note panel.
- **Current behaviour:** `useLocalAsrModels.ts:67–95` and `:128–154` set `error` on the catch path, but `LocalModelsPanel.tsx:189–193` only branches on `isLoading`. If `systemCheck.error` is set, the panel falls through to `systemReady` (which defaults to `false` because `data` is undefined), and renders the "Missing on the host: whisper-cli, ffmpeg" branch with an install command. **The user is told to install commands their machine already has** — they just couldn't reach the server. The download list never shows; the user clicks Download and gets an opaque error.
- **Why it matters:** Mis-diagnosis is worse than no diagnosis. Telling an offline user "install ffmpeg" when they already have it is actively destructive to trust.
- **Suggested fix:**
  1. Branch on `systemCheck.error`: if set, render "Couldn't reach the server — check your connection" / "无法连接服务器，请检查网络" with a Retry button. Do not render the install-command branch when the failure is a network error.
  2. Same treatment for `models.error` in the catalog section.
  3. The download hook (`useDownloadLocalModel`) at line 117–119 sets `error` but the parent (`LocalModelsPanel`) never reads it — `download.error` is not threaded to the UI. Wire it through so a failed download click shows an inline error next to the button.

---

## Nice to fix

### N1 — Read-aloud button has no tooltip on hover; icon-only is below the recognition floor for non-engineers

- **Scenario:** First-time user opens a meeting note. They see a small speaker icon in the top right of the editor and don't know what it does.
- **Current behaviour:** `NoteEditor.tsx:670–672` sets `title={t.readAloud}` and `aria-label={t.readAloud}` (good for screen readers), but the icon is 16px and competes with three other small icon buttons (Maximize2, Settings2, …). On hover there's a tooltip via `title`, but the button itself has no visible affordance beyond the icon.
- **Why it matters:** Read aloud is a feature only discoverable if users already know it exists. The current placement and styling is fine; the issue is the discoverability threshold is "I happen to hover over this".
- **Suggested fix:** Add a first-run banner or a one-time tooltip pointing at the button. Or include "Read aloud" in the editor's help/intro copy.

### N2 — Read-aloud control bar loses visibility when the editor is collapsed/scrolled

- **Scenario:** User starts Read aloud, then scrolls down to read along. The play/pause/stop buttons stay at the top of the editor; once they scroll past the title bar they can't reach them without scrolling back.
- **Current behaviour:** TTS controls are inline in the editor toolbar (`NoteEditor.tsx:664–706`), at the same position as layout toggle. They don't float.
- **Why it matters:** Minor, but Read aloud is intrinsically a "do other things while it reads" feature. Most podcast apps float the play/pause control.
- **Suggested fix:** If scope allows, render a fixed bottom-center floating control when `tts.isSpeaking`. Otherwise, ensure the toolbar is sticky.

### N3 — LocalModelsPanel: refresh button next to `+` toggle is easy to mistake for the panel toggle

- **Scenario:** User wants to collapse the panel after picking a model. They look for the collapse control and click the refresh icon.
- **Current behaviour:** `LocalModelsPanel.tsx:165–185` — both controls sit in the top-right of the panel header, both are icon-only with hover backgrounds. The `+`/`−` is a single character; the refresh is an icon. Visually similar.
- **Why it matters:** A mis-click on refresh does nothing destructive (just re-fetches), but it's noisy.
- **Suggested fix:** Add a text label to both: `Refresh` and `Hide models ▴` / `Show models ▾`. Or move refresh into the expanded body.

### N4 — The auto-insert removes the manual "Re-insert into note" affordance on success — leaving no recovery if the user wants to re-run

- **Scenario:** User accidentally edits the transcript section out of the note, then wants to put it back from the preserved recording.
- **Current behaviour:** The "Re-insert into note" button (`t.insertTranscript`) is only rendered when the panel is in a specific state (around line 660–680). After auto-insert succeeds, that branch isn't reached. The user has no way to re-run the insertion from the UI without recording again.
- **Why it matters:** Minor, but the diff explicitly changed the button copy from "Add to note and edit" to "Re-insert into note" — implying the recovery use case. The button should always be reachable when there's a preserved transcript.
- **Suggested fix:** Render the "Re-insert" button whenever `state === 'ready' && result.text && !alreadyInBody`. Track `alreadyInBody` via `composeTranscriptInsertion(body, text, lang) === null` so it's idempotent.

### N5 — Touch targets on the local-models panel rows are below 44 px on mobile

- **Scenario:** User on iPhone, opens LocalModelsPanel, taps the Download button for a model.
- **Current behaviour:** `LocalModelsPanel.tsx:367–381` — the Download button has `px-2 py-1 text-[11px]` which is roughly 28–32 px tall on a typical font scale. The "Use this model" / "Open folder" link below has even less. The progress bar is `h-1.5` (6 px) — too thin to confidently tap on touch.
- **Why it matters:** Mobile-first product, but the new panel is desktop-tuned. Apple HIG minimum is 44×44.
- **Suggested fix:** Add `min-h-[44px]` to all actionable buttons in `LocalModelsPanel`, mirroring what `NoteEditor.tsx:670` already does for the Read aloud button. Make the progress bar thicker (`h-2` or `h-2.5`) on touch devices.

### N6 — Keyboard accessibility: focus management on panel open/close

- **Scenario:** Keyboard user tabs through the meeting note panel. They open LocalModelsPanel with the `+` button. They press Tab.
- **Current behaviour:** The expanded region has `role="region"` and `aria-live="polite"` but **focus is not moved into the expanded content**. The user tabs from the toggle button straight to the next toolbar item (e.g. the Settings button), skipping every model row. To reach the Download button they have to Shift+Tab all the way back.
  - Worse: when the panel collapses, focus is left on a now-detached button (the `+` button itself stays in the DOM, but the model rows are removed; if focus had been on a model button when collapse happens, focus is lost to `<body>`).
- **Why it matters:** The previous UX review flagged "keyboard semantics layered" as R1. This new panel breaks that.
- **Suggested fix:**
  1. On expand, move focus to the first focusable element in the expanded region (the first Download button or a heading).
  2. On collapse, return focus to the `+`/`−` toggle.
  3. Ensure the toggle responds to `Enter` and `Space` (default `<button>` behaviour — OK) and that arrow-key navigation between model rows works (this is a stretch goal).

### N7 — Download without a mouse: the Download button is reachable but the row layout relies on hover-discoverable metadata

- **Scenario:** Keyboard user tabs through model rows. They hit Tab on "Download" — focus moves on. They never see the model description (`bestFor`) or the mirror hint.
- **Current behaviour:** No visible "more info" disclosure. The text is always rendered but it's tiny (`text-[11px]`) and easy to miss. No `<details>` element to expand per row.
- **Why it matters:** Picky, but "bestFor" is the differentiator between the 75 MB `tiny` and 1.5 GB `large-v3`. Keyboard-only users see less of it.
- **Suggested fix:** Add a `<details>` per row with a "What is this model for?" summary, or include the bestFor text as a `aria-describedby` on the Download button.

### N8 — System check result: green "Host is ready" is fine, but "Missing: whisper-cli, ffmpeg" is shown even when only one is missing

- **Scenario:** User has ffmpeg but not whisper-cli. The panel shows "Missing: whisper-cli" — but the install command copy in `systemCheck` is a single command that includes both (e.g. `brew install whisper-cpp ffmpeg`). User runs it and now they have two ffmpegs (or ffmpeg gets upgraded).
- **Why it matters:** Idempotent enough that it's a minor wart, but a user who only needs whisper-cli shouldn't be told to install both.
- **Suggested fix:** Server-side: return per-command install hints keyed by what's actually missing. Client-side: render only the missing commands in the copy box, with a fallback if the server gives a single combined line.

### N9 — `LocalModelsPanel` reads `systemCheck.data?.installCommand?.command` directly; the missing-commands pill displays `whisper-cli, ffmpeg` even if only one is missing — because `missingCommands` is built from `!whisperCliPath` / `!ffmpegPath`, which is null-checked against truthy

- **Scenario:** whisper-cli is installed but in a non-standard PATH (e.g. user-installed via cargo). The server returns `whisperCliPath: null` even though it does exist; the panel says "Missing: whisper-cli" and offers an install command the user has already done.
- **Why it matters:** Same class of misdiagnosis as I7. Server-side "did we find whisper-cli on PATH" is not the same as "is whisper-cli usable"; the user has no way to override the path from the panel (the executablePath override is only in `useApplyDownloadedModel`, which is for the model path).
- **Suggested fix:** Add a "whisper-cli not found in PATH — point me to your binary" advanced input that lets the user set `executablePath` directly. This also covers the corporate proxy / restricted-network case where the user installed whisper-cli in a non-default location.

### N10 — Corporate proxy / mirror failure has no UI surface

- **Scenario:** User's company blocks Hugging Face. They click Download. The SSE stream returns a `failed` event with a generic error like "ENETUNREACH" or "HTTP 407 Proxy Authentication Required". The user sees a red pill that says "下载失败 / Failed" and an error string that's a stack trace.
- **Current behaviour:** `LocalModelsPanel.tsx:401–403` renders `progress.error` verbatim. That's the entire recovery path.
- **Why it matters:** The user can't act on this. They need to know "your network blocked the mirror — try a different mirror" or "ask IT to whitelist huggingface.co".
- **Suggested fix:**
  1. Map known error codes to friendly messages: "Could not reach the download mirror (check your network or VPN)" / "下载镜像不可达，请检查网络或代理".
  2. If the catalog entry has multiple `mirrors`, offer a "Try another mirror" button on failed downloads.
  3. Never render stack traces; only render the human message.

### N11 — Mobile collapse behaviour on the meeting note panel itself

- **Scenario:** iPhone in portrait, user opens a meeting note. The panel header has the title + amber badge + Settings button on one line, plus the new LocalModelsPanel below.
- **Current behaviour:** `MeetingNotePanel.tsx:561` constrains the panel to `max-h-[min(560px,calc(100vh-180px))]`. On a 390×844 iPhone, that's a 560 px scrollable container. Inside it the LocalModelsPanel renders fully expanded (when expanded) and pushes the rest of the panel content down. The user has to scroll the inner container to reach anything below the LocalModelsPanel — including the consent checkbox and the recording controls.
- **Why it matters:** The panel is the primary CTA for recording. Pushing it below the fold of an internal scroll container is a regression.
- **Suggested fix:** On mobile (`< sm`), either (a) default-collapse the LocalModelsPanel and the settings panel, or (b) reduce the panel max-height on small viewports and let the page scroll instead of the inner container.

### N12 — Manual "Re-insert into note" copy changed but the button is hidden when state is success

See N4 — copy and discoverability are coupled.

### N13 — `aria-expanded` on the LocalModelsPanel toggle button uses the variable correctly, but the button's accessible name is just "Expand/Collapse local models panel" with no indication of *why*

- **Scenario:** Screen reader user navigates to the LocalModelsPanel area. They hear "Expand local models panel, button". They have no idea what's inside.
- **Why it matters:** Discoverability is the same as I2 but for screen readers specifically.
- **Suggested fix:** Append the model count or status: "Expand local models panel — 0 installed, system not ready" / "Expand local models panel — 3 installed, system ready".

---

## Things done well

### W1 — `plainTextForTts` Markdown stripping is thoughtful
`NoteEditor.tsx:191–250` handles fenced code blocks, GFM task list checkboxes (with `done`/`todo` cues), inline links, images, tables, horizontal rules, blockquotes, emoji shortcodes, raw emoji — without translating emoji to Unicode names (correct: some TTS engines read "ROCKET" out loud, which sounds worse than silence). Exported for unit testing. This is the kind of small thing most teams skip.

### W2 — `composeTranscriptInsertion` is exported and idempotent
`NoteEditor.tsx:256–271` returns `null` for "no change", and `MeetingNotePanel.tsx:495–500` calls it via the same path. A second call with the same transcript is a no-op, which is exactly what an "auto-retry" world needs.

### W3 — `useBrowserTts` cross-instance broadcast
The module-level `activeOwnerId` + `df:tts-state` custom event (`useBrowserTts.ts:53–125`) is the right pattern for a global singleton behind React. The cleanup-on-unmount (`useBrowserTts.ts:187–198`) is correct for the common SPA case (see C3 for the gap case).

### W4 — System check is presented as a friendly one-liner with a copy button
The amber "missing: whisper-cli, ffmpeg" + install-command block + "Copy" toggle (`LocalModelsPanel.tsx:198–227`) is the right shape for a non-engineer. The `aria-label="Copy install command"` and `aria-live` are correct.

### W5 — Meeting status pills in NoteList are visible, distinct, and color-coded
`NoteList.tsx:472–487` shows "未开始 / 待转写 / 已整理 / 已转写" with muted/amber/blue/green tones. Each is a `<span>`, not a button (so it doesn't pretend to be actionable). `data-status` is set for tests. Good.

### W6 — "Start meeting" CTA is visually emphasized
`NoteList.tsx:347–365` — red-on-light-red, larger icon, two-line title/subtitle. The intent of "this is the primary action" reads correctly. The pending badge anchors attention correctly when there's work to do.

### W7 — Touch target sizing on the TTS controls is correct
`NoteEditor.tsx:670, 681, 697, 712` — `min-h-[44px] min-w-[44px]` on mobile with `sm:min-h-0 sm:min-w-0` for desktop. That's the right responsive pattern and aligns with Apple HIG.

### W8 — Keyboard semantics for Read aloud are clean
Play / Pause / Resume / Stop are all proper `<button type="button">` with `title` + `aria-label`. Tab order through them is left-to-right, which matches user expectation.

### W9 — The hook for `useApplyDownloadedModel` automatically wires a freshly downloaded model into the transcription config
`useLocalAsrModels.ts:265–296` — calling `apply.mutate({ modelPath: ... })` after download makes the model immediately usable for the next recording. This avoids the "you downloaded a model but it's not selected" trap that breaks most first-time flows.

### W10 — Diff comments acknowledge the failure modes
The empty `catch` in `MeetingNotePanel.tsx:501–503` and the SSE `failed` handling in `useLocalAsrModels.ts:164–179` both have comments explaining the choice. That intent is good; the fix (C2, I7, I10) is to surface the failures properly. The author was clearly thinking about it.

---

## Summary

**Trust-critical issues:** C1 (badge click opens the wrong panel), C2 (silent auto-insert failures), C3 (Read aloud continues with no UI control after note switch).

**Discoverability/affordance:** I1, I2, I3 (red badge, hidden models, badge-as-button ambiguity).

**Mobile/robustness:** I4, I5, I7, N5, N11 (TTS chunking, SSE failure modes, network errors, touch targets, mobile collapse).

**Polish:** N1–N13 (tooltip on Read aloud, mirror errors, focus management on panel toggle, error wording).

**Things to protect:** W1, W2, W4, W5, W9 — the Markdown stripping, idempotent insert, system-check presentation, status pills, and auto-apply are the genuinely good parts of this change. Don't regress them while fixing C1–I3.

---

## UX review methodology note

I cross-referenced the prior `EVENT_UX_REVIEW.md` root-cause taxonomy (R1 keyboard layers, R2 activation timing, R3 silent promises, R4 spatial control, R5 two-view consistency). This change introduces new instances of **R3** (C1, C2, C3 — silent failures and ambiguous affordances) and **R1-adjacent** (I6, N6 — focus management). It does not introduce R2, R4, or R5 problems. Net: a positive change in scope but with three must-fix trust issues before merge.