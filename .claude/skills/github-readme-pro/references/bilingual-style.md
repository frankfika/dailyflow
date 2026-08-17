# Bilingual README Style Guide

This project uses English as the primary README language and Chinese as the secondary. Apply these rules when creating or updating `README.md` + `README_ZH.md` (or `README_EN.md` if Chinese is primary).

## Structure parity

- The secondary README must have the same section order as the primary.
- Badge URLs must be identical; do not translate badge labels unless the badge itself supports localization.
- Code blocks, commands, and file paths must not be translated.
- Mermaid diagrams should be copied verbatim.

## Translation rules

| Element | Rule |
|---|---|
| Section headings | Translate naturally, keep emoji prefixes |
| Feature descriptions | Translate freely to sound native |
| Taglines | Optimize for the language, not literal |
| Button / menu labels | Keep English if they refer to actual UI text, otherwise translate |
| Call-to-action links | Translate labels, keep URLs |

## Sync checklist

After updating the primary README, verify the secondary:
- [ ] Same number of sections.
- [ ] Same screenshots referenced (paths identical).
- [ ] Same badge URLs.
- [ ] Same version number and release link.
- [ ] Same installation command blocks.
- [ ] No orphan sections in either file.

## Example

Primary (English):

```markdown
### Events: break projects down like a mind-map notebook
```

Secondary (Chinese):

```markdown
### Events：像飞书脑图笔记一样拆解项目
```

Note the meaning is preserved but the expression is localized.
