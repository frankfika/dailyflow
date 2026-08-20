// Slide 06 - Highlight 3: After a year, just ask
// Layout: large quote at top + 3-step answer flow + bottom closing
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'HIGHLIGHT 3  /  06');
  addTitle(slide, theme, '亮点三 . 用了一年之后, 你可以直接问它', 'After a year, just ask it.');

  // Top quote
  slide.addShape('rect', {
    x: 0.4, y: 1.95, w: 9.2, h: 0.85,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.08
  });
  slide.addText('" 上个月我在哪次会议里, 答应过投资人什么 ? "', {
    x: 0.6, y: 1.95, w: 8.8, h: 0.5,
    fontSize: 16, fontFace: FONT_CN, italic: true,
    color: 'FFFFFF', valign: 'middle', margin: 0
  });
  slide.addText('-- A question you can actually answer after a year of use', {
    x: 0.6, y: 2.4, w: 8.8, h: 0.35,
    fontSize: 10, fontFace: FONT_EN,
    color: theme.accent, valign: 'middle', margin: 0
  });

  // 3-step answer flow
  const flow = [
    {
      n: '1',
      h: '找',
      en: 'Find',
      d: '在你自己的文件里检索 -- 先结构化关联, 再元数据, 再全文.'
    },
    {
      n: '2',
      h: '给证据',
      en: 'Cite',
      d: '附上原文片段和出处, 而不是一段 看起来像答案 的话.'
    },
    {
      n: '3',
      h: '顺手管事',
      en: 'Act',
      d: '发现关联任务已逾期 5 天, 主动问: 要不要排进今天 ?'
    }
  ];

  const startX = 0.4, startY = 3.0;
  const cardW = 3.0, cardH = 1.85, gap = 0.1;

  flow.forEach((s, i) => {
    const x = startX + i * (cardW + gap);
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: theme.light, transparency: 75 },
      line: { color: theme.light, width: 0 },
      rectRadius: 0.1
    });
    // big step number
    slide.addText(s.n, {
      x: x + 0.2, y: startY + 0.1, w: 0.7, h: 0.7,
      fontSize: 38, fontFace: FONT_EN, bold: true,
      color: theme.accent, margin: 0
    });
    // head
    slide.addText(s.h, {
      x: x + 0.95, y: startY + 0.15, w: cardW - 1.1, h: 0.4,
      fontSize: 20, fontFace: FONT_CN, bold: true,
      color: theme.primary, margin: 0
    });
    // head en
    slide.addText(s.en, {
      x: x + 0.95, y: startY + 0.55, w: cardW - 1.1, h: 0.3,
      fontSize: 10, fontFace: FONT_EN, italic: true,
      color: theme.secondary, margin: 0
    });
    // body
    slide.addText(s.d, {
      x: x + 0.2, y: startY + 0.95, w: cardW - 0.4, h: 0.8,
      fontSize: 10, fontFace: FONT_CN,
      color: theme.primary, valign: 'top', margin: 0
    });
  });

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('第一天它对你一无所知, 第三百六十五天它比任何云端 AI 都懂你. 这个差距花钱买不到.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 11, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 6, 16);
}

module.exports = { createSlide };
