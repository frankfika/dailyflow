// Slide 16 - Closing: let the memory be yours
const { FONT_CN, FONT_EN, addPageNumber } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.primary };

  // No kicker / no standard top bar on the closing slide -- it's the final beat.

  // Brand mark
  slide.addText('DAILYFLOW  /  ROADSHOW 2026', {
    x: 0.4, y: 0.45, w: 9.2, h: 0.3,
    fontSize: 11, fontFace: FONT_EN, bold: true, charSpacing: 4,
    color: theme.accent, margin: 0
  });
  slide.addShape('rect', {
    x: 0.4, y: 0.85, w: 0.6, h: 0.06,
    fill: { color: theme.accent }, line: { color: theme.accent, width: 0 }
  });

  // Big closing title
  slide.addText('AI 时代,', {
    x: 0.4, y: 1.4, w: 9.2, h: 0.85,
    fontSize: 44, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', margin: 0
  });
  slide.addText('每个人都需要一个', {
    x: 0.4, y: 2.15, w: 9.2, h: 0.7,
    fontSize: 36, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', margin: 0
  });
  slide.addText('自己的 资产基地.', {
    x: 0.4, y: 2.75, w: 9.2, h: 0.85,
    fontSize: 50, fontFace: FONT_CN, bold: true,
    color: theme.accent, margin: 0
  });

  // English under
  slide.addText('In the AI era, everyone needs a base of their own.', {
    x: 0.4, y: 3.7, w: 9.2, h: 0.4,
    fontSize: 16, fontFace: FONT_EN, italic: true,
    color: theme.light, margin: 0
  });

  // Sub-line
  slide.addText('软件在跑, 代码开源 ; 随身 AI 在路上. 剩下的, 是让每个人都拥有一份带不走的 AI 资产.', {
    x: 0.4, y: 4.25, w: 9.2, h: 0.4,
    fontSize: 13, fontFace: FONT_CN,
    color: 'FFFFFF', margin: 0
  });

  // Sign-off
  slide.addText('-- 让记忆归你 .  let the memory be yours.', {
    x: 0.4, y: 4.85, w: 9.2, h: 0.4,
    fontSize: 14, fontFace: FONT_CN, bold: true,
    color: theme.accent, margin: 0
  });

  // Page number (light version for dark background)
  slide.addShape('rect', {
    x: 9.05, y: 5.18, w: 0.7, h: 0.32,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('16 / 16', {
    x: 9.05, y: 5.18, w: 0.7, h: 0.32,
    fontSize: 9, fontFace: FONT_EN, color: 'FFFFFF',
    align: 'center', valign: 'middle', bold: true, margin: 0
  });
}

module.exports = { createSlide };
