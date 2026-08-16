# Note UX redesign

## Product diagnosis

The previous Notes surface treated every capability as a primary action. Creation, meeting recording, seven filters, templates, metadata, Markdown source, live preview, transcription configuration, and editor statistics all competed on the first screen. The result was visually busy while still feeling empty, and the recording flow read like infrastructure configuration rather than part of a note.

The redesign follows one hierarchy:

1. Find or create a note.
2. Write in a calm document canvas.
3. For a meeting note, record first and let transcription happen after the recording is safely stored.
4. Reveal metadata, links, advanced transcription providers, archive, and deletion only when needed.

## Benchmarks

- **Notion:** writing is the primary surface; advanced structure is progressively disclosed through contextual controls rather than permanent chrome.
- **Apple Notes:** audio belongs inside the note. Recording, playback, transcript review, search, and “add transcript to note” form one continuous object lifecycle.
- **Granola:** meeting capture should remain usable while the user writes; the raw transcript is supporting material, not a replacement for authored notes.

## Implemented interaction model

- A compact searchable library replaces the button-heavy note list.
- Common views stay visible; low-frequency views move under “More.”
- “Start meeting note” is one clear secondary capture entry with an explicit “record · transcribe” promise.
- The empty state offers three task-oriented starts: blank note, meeting note, and daily log. Internal implementation copy such as debounce timing is removed.
- Editing uses a centered, single-column document canvas. Markdown preview remains an explicit mode instead of occupying half the screen at all times.
- Note type, date, tags, and linked tasks are grouped under “Properties & links.”
- Meeting capture is an inline document attachment with a durable sequence: consent → record → review → save → transcribe.
- Transcription provider and model details remain available, but behind settings.

## Next product increments

- Replace the raw Markdown textarea with a block-aware editor while preserving Markdown storage.
- Add timestamp-to-audio navigation in transcripts.
- Add transcript search and speaker renaming.
- Generate meeting summary, decisions, and action items as reviewable suggestions rather than silently rewriting the note.
- Persist one-time recording consent acknowledgement per workspace, while still showing a visible recording indicator every session.
