import { describe, expect, it } from 'vitest';
import { composeTranscriptInsertion, plainTextForTts } from './NoteEditor';

describe('composeTranscriptInsertion', () => {
  it('seeds an empty body with the transcript under a localised heading', () => {
    expect(composeTranscriptInsertion('', '  hello world  ', 'en'))
      .toBe('## Recording transcript\n\nhello world\n');
    expect(composeTranscriptInsertion('', '  你好  ', 'zh'))
      .toBe('## 录音转写\n\n你好\n');
  });

  it('appends the transcript after the existing body, separated by a blank line', () => {
    const body = '# Meeting notes\n\nDiscussion here.';
    expect(composeTranscriptInsertion(body, 'fresh transcript', 'en'))
      .toBe('# Meeting notes\n\nDiscussion here.\n\n## Recording transcript\n\nfresh transcript\n');
  });

  it('treats trailing whitespace on the existing body as negligible', () => {
    const body = '# Notes\n\n- bullet\n   \n\n   ';
    expect(composeTranscriptInsertion(body, 'a transcript', 'en'))
      .toBe('# Notes\n\n- bullet\n\n## Recording transcript\n\na transcript\n');
  });

  it('is idempotent — re-inserting the same transcript is a no-op', () => {
    const body = '# Notes\n\n## Recording transcript\n\nhello world\n';
    expect(composeTranscriptInsertion(body, 'hello world', 'en')).toBeNull();
    expect(composeTranscriptInsertion(body, '  hello world  ', 'en')).toBeNull();
  });

  it('trims an all-whitespace payload and refuses to insert', () => {
    expect(composeTranscriptInsertion('existing body', '   \n  ', 'en')).toBeNull();
    expect(composeTranscriptInsertion('', '', 'zh')).toBeNull();
  });

  it('uses the Chinese heading when the editor language is zh', () => {
    expect(composeTranscriptInsertion('', '议程结论', 'zh'))
      .toBe('## 录音转写\n\n议程结论\n');
  });
});

describe('plainTextForTts', () => {
  it('returns an empty string for an empty body', () => {
    expect(plainTextForTts('')).toBe('');
    expect(plainTextForTts('   \n\n  ')).toBe('');
  });

  it('strips ATX headings, bold/italic markers, blockquote prefixes', () => {
    const input = '# Heading\n\n**bold** and *italic* and ~~strike~~\n\n> quoted line';
    expect(plainTextForTts(input)).toBe('Heading bold and italic and strike quoted line');
  });

  it('collapses fenced code blocks to a single space', () => {
    const input = 'before\n```ts\nconst x = 1;\n```\nafter';
    expect(plainTextForTts(input)).toBe('before after');
  });

  it('expands GitHub task list markers into "done" / "todo" cues', () => {
    const input = '- [x] Ship the release\n- [ ] Write the docs\n- [X] Notify the team';
    expect(plainTextForTts(input)).toBe('done Ship the release todo Write the docs done Notify the team');
  });

  it('drops table pipes and keeps cell text', () => {
    const input = '| Name | Status |\n| ---- | ------ |\n| DailyFlow | shipped |';
    expect(plainTextForTts(input)).toBe('Name Status DailyFlow shipped');
  });

  it('strips bullet and ordered list markers', () => {
    expect(plainTextForTts('- one\n- two\n1. three\n2. four')).toBe('one two three four');
  });

  it('keeps the link label and drops the URL', () => {
    const input = 'See [the docs](https://example.com/docs) and ![alt](img.png) and [ref][1]';
    const out = plainTextForTts(input);
    expect(out).toContain('the docs');
    expect(out).toContain('alt');
    expect(out).not.toContain('https://example.com');
    expect(out).not.toContain('img.png');
    expect(out).not.toContain('[1]');
  });

  it('collapses horizontal rules', () => {
    const input = 'top\n\n---\n\nbottom';
    expect(plainTextForTts(input)).toBe('top bottom');
  });

  it('strips emoji shortcodes and raw emoji without leaving their names behind', () => {
    expect(plainTextForTts('shipped :rocket: today')).toBe('shipped today');
    expect(plainTextForTts('Rocket 🚀 and check ✅')).toBe('Rocket and check');
  });

  it('handles a mixed Chinese + English meeting transcript end-to-end', () => {
    const input = '## 录音转写\n\n**今天** 讨论了 [发布计划](https://x.test)。\n\n- [x] 确认上线时间\n- [ ] 通知团队\n';
    const out = plainTextForTts(input);
    expect(out).toContain('录音转写');
    expect(out).toContain('今天 讨论了 发布计划');
    expect(out).toContain('done 确认上线时间');
    expect(out).toContain('todo 通知团队');
    // No markdown noise leaks.
    expect(out).not.toMatch(/[#*[\]_>]/);
  });

  it('preserves Chinese punctuation so the listener hears natural pauses', () => {
    expect(plainTextForTts('今天讨论发布计划，明天上线。')).toBe('今天讨论发布计划，明天上线。');
  });
});