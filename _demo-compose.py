#!/usr/bin/env python3
"""
Compose DailyFlow demo video: cut recording into segments, pair with TTS audio,
add intro/outro cards, concat into final mp4.

Usage: python3 _demo-compose.py <lang>  (lang = zh | en)
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path("/Users/fangchen/Baidu/GitHub/dailyflow")
REC = Path("/tmp/df-demo-recordings")
AUDIO = ROOT / "_demo-audio"
OUT = Path("/Users/fangchen/Baidu/GitHub/dailyflow/_demo-out")
OUT.mkdir(exist_ok=True, parents=True)

# Segment → audio file mapping (same for zh / en with prefix)
SEGMENT_AUDIO = {
    "today": "01_today",
    "today-focus": "02_focus",
    "notes-inbox": "03_inbox",
    "notes-list": "04_notes",
    "notes-detail": "05_notedetail",
    "ai-chat": "06_chat",
    "memory": "07_memory",
    "mindmap": "08_mindmap",
    "calendar": "09_calendar",
}

LANG = sys.argv[1] if len(sys.argv) > 1 else "zh"
PREFIX = "zh" if LANG == "zh" else "en"
TITLE = f"DailyFlow Demo — {'中文' if LANG == 'zh' else 'English'}"
FINAL_NAME = f"dailyflow-demo-{LANG}.mp4"
FINAL_PATH = OUT / FINAL_NAME

FFMPEG = "/opt/homebrew/bin/ffmpeg"
FFPROBE = "/opt/homebrew/bin/ffprobe"


def probe_dur(p: Path) -> float:
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(p)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def cut_segment(webm: Path, start: float, end: float, out: Path):
    """Cut webm[start, end] → out.mp4 (no audio, just trim)."""
    dur = end - start
    subprocess.run([
        FFMPEG, "-y", "-ss", f"{start:.3f}", "-i", str(webm),
        "-t", f"{dur:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-vf", "scale=1920:1080,fps=30",
        "-an",
        "-movflags", "+faststart",
        str(out),
    ], check=True, capture_output=True)


def build_static_clip(png: Path, audio: Path, out: Path, hold: float = 0.4):
    """Static PNG looped + audio → out.mp4."""
    dur = probe_dur(audio) + hold
    subprocess.run([
        FFMPEG, "-y", "-loop", "1", "-framerate", "30", "-t", f"{dur:.3f}",
        "-i", str(png),
        "-i", str(audio),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-tune", "stillimage",
        "-vf", "scale=1920:1080",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        str(out),
    ], check=True, capture_output=True)


def pair_with_audio(src_video: Path, audio: Path, out: Path, hold: float = 0.4):
    """Pair cut webm with TTS audio. Output length = max(video, audio+hold).
    Video freezes at last frame if audio is longer; audio stops at end."""
    v_dur = probe_dur(src_video)
    a_dur = probe_dur(audio) + hold
    total = max(v_dur, a_dur)
    subprocess.run([
        FFMPEG, "-y",
        "-i", str(src_video),
        "-i", str(audio),
        "-t", f"{total:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-r", "30",
        "-vf", "scale=1920:1080,fps=30",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(out),
    ], check=True, capture_output=True)


def concat_clips(clips: list, out: Path):
    list_file = out.parent / "concat.txt"
    with open(list_file, "w") as f:
        for c in clips:
            f.write(f"file '{c.resolve()}'\n")
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        str(out),
    ], check=True, capture_output=True)
    list_file.unlink()


def main():
    print(f"\n=== Composing {LANG.upper()} version ===")
    print(f"Output: {FINAL_PATH}")

    # Load segments
    with open(REC / "segments.json") as f:
        segs = json.load(f)
    print(f"\nSegments: {len(segs)}")
    for s in segs:
        print(f"  {s['name']}: {s['start']:.2f}→{s['end']:.2f}")

    webm = REC / "recording.webm"
    if not webm.exists():
        raise FileNotFoundError(f"Recording not found: {webm}")

    clips = []
    tmp = OUT / "tmp"
    tmp.mkdir(exist_ok=True, parents=True)

    # 1. Intro card + intro audio
    intro_audio = AUDIO / f"{PREFIX}_10_outro.mp3"  # reuse the closing line for intro
    # Actually use a different one — use the outro-style line for intro? Let's just use outro voice.
    # Better: synthesize a real intro clip. For now use outro as the intro since "DailyFlow ..." works.
    # Actually we want different intros per language. Reuse existing: use zh_01 (today) as intro? No, too long.
    # Simplest: use the outro voice line "DailyFlow — 把无限待办, 收敛成今天真正要推进的事。"
    print("\n  Building intro card...")
    intro_png = REC / "intro.png"
    intro_out = tmp / "00_intro.mp4"
    build_static_clip(intro_png, intro_audio, intro_out, hold=0.4)
    clips.append(intro_out)
    print(f"    ✓ intro: {probe_dur(intro_out):.2f}s")

    # 2. Each segment
    print("\n  Building segments...")
    for i, s in enumerate(segs, 1):
        seg_name = s["name"]
        if seg_name not in SEGMENT_AUDIO:
            print(f"    ! skipping {seg_name} (no audio mapping)")
            continue
        audio_name = SEGMENT_AUDIO[seg_name]
        audio = AUDIO / f"{PREFIX}_{audio_name}.mp3"
        if not audio.exists():
            print(f"    ! audio missing: {audio}")
            continue
        # Cut video segment
        cut_out = tmp / f"{i:02d}_{seg_name}_cut.mp4"
        cut_segment(webm, s["start"], s["end"], cut_out)
        # Pair with audio
        pair_out = tmp / f"{i:02d}_{seg_name}.mp4"
        pair_with_audio(cut_out, audio, pair_out)
        v = probe_dur(cut_out)
        a = probe_dur(audio)
        print(f"    ✓ {seg_name}: video={v:.2f}s audio={a:.2f}s → {probe_dur(pair_out):.2f}s")
        clips.append(pair_out)

    # 3. Outro card + outro audio
    print("\n  Building outro card...")
    outro_audio = AUDIO / f"{PREFIX}_10_outro.mp3"
    outro_png = REC / "outro.png"
    outro_out = tmp / "99_outro.mp4"
    build_static_clip(outro_png, outro_audio, outro_out, hold=0.4)
    clips.append(outro_out)
    print(f"    ✓ outro: {probe_dur(outro_out):.2f}s")

    # 4. Concat
    print(f"\n  Concatenating {len(clips)} clips → {FINAL_PATH}")
    concat_clips(clips, FINAL_PATH)

    # Verify
    final_dur = probe_dur(FINAL_PATH)
    final_size = FINAL_PATH.stat().st_size / (1024 * 1024)
    print(f"\n  ✓ Final: {final_dur:.2f}s, {final_size:.1f} MB")
    print(f"  ✓ Path: {FINAL_PATH}")

    # Cleanup tmp
    for c in tmp.iterdir():
        c.unlink()
    tmp.rmdir()


if __name__ == "__main__":
    main()
