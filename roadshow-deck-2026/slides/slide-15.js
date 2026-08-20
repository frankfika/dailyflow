// Slide 15 - The ask: 2 things (funding + ecosystem) + black bar with the 90-day promise
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'THE ASK  /  15');
  addTitle(slide, theme, '需要两样东西', 'Two things.');

  // 2 large cards
  const cards = [
    {
      tag: '01',
      h: '资金',
      en: 'Capital',
      d: '拓展这个项目: 让一个人的开源项目变成可持续的产品 -- 工程, 设计, 硬件打样, 市场首发.'
    },
    {
      tag: '02',
      h: '生态合作',
      en: 'Ecosystem',
      d: '模型厂商 (一键接入) . 硬件供应链与端侧模型 (随身 AI) . Agent 市场开发者 . 分发渠道.'
    }
  ];
  const startX = 0.4, startY = 1.95;
  const cardW = 4.5, cardH = 2.6, gap = 0.2;

  cards.forEach((c, i) => {
    const x = startX + i * (cardW + gap);
    // card body
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.primary, width: 2 },
      rectRadius: 0.1
    });
    // top tag
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: 0.6,
      fill: { color: theme.primary },
      line: { color: theme.primary, width: 0 },
      rectRadius: 0.05
    });
    slide.addText(c.tag, {
      x: x + 0.25, y: startY, w: 0.6, h: 0.6,
      fontSize: 22, fontFace: FONT_EN, bold: true,
      color: theme.accent, valign: 'middle', margin: 0
    });
    slide.addText(c.h, {
      x: x + 0.85, y: startY, w: cardW - 1.0, h: 0.6,
      fontSize: 22, fontFace: FONT_CN, bold: true,
      color: 'FFFFFF', valign: 'middle', margin: 0
    });
    slide.addText(c.en, {
      x: x + 0.85, y: startY + 0.65, w: cardW - 1.0, h: 0.3,
      fontSize: 11, fontFace: FONT_EN, italic: true,
      color: theme.secondary, margin: 0
    });
    slide.addText(c.d, {
      x: x + 0.3, y: startY + 1.05, w: cardW - 0.6, h: cardH - 1.2,
      fontSize: 13, fontFace: FONT_CN,
      color: theme.primary, valign: 'top', margin: 0
    });
  });

  // Black bar with 90-day promise
  slide.addShape('rect', {
    x: 0.4, y: 4.7, w: 9.2, h: 0.7,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  // accent strip
  slide.addShape('rect', {
    x: 0.4, y: 4.7, w: 0.12, h: 0.7,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 }
  });
  slide.addText('90 天', {
    x: 0.65, y: 4.7, w: 1.3, h: 0.7,
    fontSize: 24, fontFace: FONT_CN, bold: true,
    color: theme.accent, valign: 'middle', margin: 0
  });
  slide.addText('让第 1000 个人开始建立自己的 AI 资产基地.', {
    x: 1.95, y: 4.7, w: 7.5, h: 0.7,
    fontSize: 14, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 15, 16);
}

module.exports = { createSlide };
