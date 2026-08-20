// Shared helpers for all DailyFlow roadshow slides.
// Theme keys: primary / secondary / accent / light / bg
// LAYOUT_16x9 = 10" x 5.625"

const FONT_CN = 'Microsoft YaHei';
const FONT_EN = 'Arial';

function addPageNumber(slide, theme, n, total) {
  // Small dark badge at bottom-right (avoid the 9.3 / 5.1 reference point exactly,
  // use a slight shift so it does not clip page margins).
  slide.addShape('rect', {
    x: 9.05, y: 5.18, w: 0.7, h: 0.32,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText(`${String(n).padStart(2, '0')} / ${total}`, {
    x: 9.05, y: 5.18, w: 0.7, h: 0.32,
    fontSize: 9, fontFace: FONT_EN, color: 'FFFFFF',
    align: 'center', valign: 'middle', bold: true, margin: 0
  });
}

function addTopBar(slide, theme, kicker) {
  // kicker text
  slide.addText(kicker, {
    x: 0.4, y: 0.3, w: 9.2, h: 0.3,
    fontSize: 10, fontFace: FONT_EN,
    color: theme.secondary, charSpacing: 3, margin: 0
  });
  // small accent block (NOT an underline below a title)
  slide.addShape('rect', {
    x: 0.4, y: 0.65, w: 0.45, h: 0.05,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 }
  });
}

function addTitle(slide, theme, zh, en) {
  slide.addText(zh, {
    x: 0.4, y: 0.85, w: 9.2, h: 0.6,
    fontSize: 30, fontFace: FONT_CN, bold: true,
    color: theme.primary, margin: 0, fit: 'shrink'
  });
  if (en) {
    slide.addText(en, {
      x: 0.4, y: 1.45, w: 9.2, h: 0.3,
      fontSize: 13, fontFace: FONT_EN, italic: true,
      color: theme.secondary, margin: 0
    });
  }
}

module.exports = { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle };
