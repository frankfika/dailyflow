// Slide 12 - Business model: open core, 5 monetization categories
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'BUSINESS MODEL  /  12');
  addTitle(slide, theme, '核心永久免费开源, 收费只在增值服务', 'Open core: free forever, revenue only from add-ons.');

  const cats = [
    {
      tag: '01', h: 'Token 直通', en: 'Token passthrough',
      d: 'AI 按量计费是行业惯例. 透明通道, 成本多少就多少, 不转售, 不截留上下文.'
    },
    {
      tag: '02', h: '托管多端同步', en: 'Hosted multi-device sync',
      d: '同步本身免费 -- Git 和 IPFS, 去中心化. 收费的是 托管版 : 不想自己折腾的人, 买一个省心.'
    },
    {
      tag: '03', h: '高级 AI 功能', en: 'Advanced AI features',
      d: '批量整理, 自动化编排, 深度复盘等超出日常的增值能力.'
    },
    {
      tag: '04', h: '向量数据库等', en: 'Vector DB & infra',
      d: '记忆规模变大后的语义索引加速. 本地全文检索永远免费, 向量索引是可选项.'
    },
    {
      tag: '05', h: '开源 Agent 市场', en: 'Open Agent marketplace',
      d: 'Skill 和 Agent 能力开放生态. 第三方开发者发布技能, 市场交易分成是长期收入.'
    }
  ];

  // 5 cards in a single row
  const startX = 0.4, startY = 1.95;
  const cardW = 1.84, cardH = 2.85, gap = 0.05;

  cats.forEach((c, i) => {
    const x = startX + i * (cardW + gap);
    // card body
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.light, width: 1.5 },
      rectRadius: 0.08
    });
    // top tag
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: 0.45,
      fill: { color: theme.primary },
      line: { color: theme.primary, width: 0 },
      rectRadius: 0.05
    });
    slide.addText(c.tag, {
      x, y: startY, w: cardW, h: 0.45,
      fontSize: 14, fontFace: FONT_EN, bold: true,
      color: theme.accent, align: 'center', valign: 'middle', margin: 0
    });
    // head
    slide.addText(c.h, {
      x: x + 0.1, y: startY + 0.6, w: cardW - 0.2, h: 0.45,
      fontSize: 14, fontFace: FONT_CN, bold: true,
      color: theme.primary, align: 'center', margin: 0
    });
    // en
    slide.addText(c.en, {
      x: x + 0.1, y: startY + 1.05, w: cardW - 0.2, h: 0.3,
      fontSize: 9, fontFace: FONT_EN, italic: true,
      color: theme.secondary, align: 'center', margin: 0
    });
    // divider
    slide.addShape('rect', {
      x: x + 0.3, y: startY + 1.4, w: cardW - 0.6, h: 0.02,
      fill: { color: theme.accent }, line: { color: theme.accent, width: 0 }
    });
    // body
    slide.addText(c.d, {
      x: x + 0.12, y: startY + 1.5, w: cardW - 0.24, h: 1.3,
      fontSize: 9, fontFace: FONT_CN,
      color: theme.primary, valign: 'top', margin: 0
    });
  });

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('每一类都不碰你的数据 -- 商业模式和产品立场, 是同一件事.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 12, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 12, 16);
}

module.exports = { createSlide };
