// Slide 13 - Moat: why this position is hard to copy (2x2 grid)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'MOAT  /  13');
  addTitle(slide, theme, '为什么这个位置难以复制', 'Why this position is hard to copy.');

  const moats = [
    {
      h: '数据复利',
      en: 'Data compounding',
      d: '用户第 365 天的体验建立在 365 天的个人数据上. 功能可以抄, 用户攒下的东西抄不走.',
      icon: '01'
    },
    {
      h: '开源信任',
      en: 'Open-source trust',
      d: '处理私密记忆的产品, 信任是入口. 开源是最贵的信任凭证, 我们愿意付这个代价.',
      icon: '02'
    },
    {
      h: '清晰的架构',
      en: 'Clean architecture',
      d: '规则引擎在前, 建议单确认, 服务分层清晰. 功能快速长出来而不失控, 二次开发成本足够低.',
      icon: '03'
    },
    {
      h: '迭代速度',
      en: 'Iteration speed',
      d: '一个人, 四个月, 从 CLI 到 v1.8.0, 99 个测试文件. 本地优先没有云端成本拖累.',
      icon: '04'
    }
  ];

  const startX = 0.4, startY = 1.95;
  const cellW = 4.5, cellH = 1.45, gapX = 0.2, gapY = 0.15;

  moats.forEach((m, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = startX + col * (cellW + gapX);
    const y = startY + row * (cellH + gapY);
    // card body
    slide.addShape('rect', {
      x, y, w: cellW, h: cellH,
      fill: { color: theme.light, transparency: 80 },
      line: { color: theme.light, width: 0 },
      rectRadius: 0.1
    });
    // left accent bar
    slide.addShape('rect', {
      x, y, w: 0.1, h: cellH,
      fill: { color: theme.accent }, line: { color: theme.accent, width: 0 }
    });
    // icon number block
    slide.addShape('rect', {
      x: x + 0.3, y: y + 0.2, w: 0.6, h: 0.6,
      fill: { color: theme.primary },
      line: { color: theme.primary, width: 0 },
      rectRadius: 0.05
    });
    slide.addText(m.icon, {
      x: x + 0.3, y: y + 0.2, w: 0.6, h: 0.6,
      fontSize: 18, fontFace: FONT_EN, bold: true,
      color: theme.accent, align: 'center', valign: 'middle', margin: 0
    });
    // head
    slide.addText(m.h, {
      x: x + 1.0, y: y + 0.15, w: cellW - 1.1, h: 0.35,
      fontSize: 18, fontFace: FONT_CN, bold: true,
      color: theme.primary, margin: 0
    });
    // en
    slide.addText(m.en, {
      x: x + 1.0, y: y + 0.5, w: cellW - 1.1, h: 0.28,
      fontSize: 10, fontFace: FONT_EN, italic: true,
      color: theme.secondary, margin: 0
    });
    // body
    slide.addText(m.d, {
      x: x + 0.3, y: y + 0.85, w: cellW - 0.4, h: cellH - 0.95,
      fontSize: 11, fontFace: FONT_CN,
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
  slide.addText('护城河不是某一个单点 -- 是 数据 . 信任 . 架构 . 速度 四个都到了的窗口期.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 11, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 13, 16);
}

module.exports = { createSlide };
