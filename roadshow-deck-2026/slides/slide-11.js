// Slide 11 - Open source: main strategy (2 mock screenshots + 4 reasons)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'OPEN SOURCE  /  11');
  addTitle(slide, theme, '全部代码在 GitHub 上, 谁都可以基于它做东西', 'Fully open on GitHub -- anyone can build on it.');

  // Two mock screenshots side by side
  const mocks = [
    { x: 0.4, w: 4.5, label: 'PROJECT DIRECTORY', zh: '开源项目目录' },
    { x: 5.1, w: 4.5, label: 'RELEASE HISTORY',   zh: '版本迭代记录' }
  ];
  mocks.forEach((m) => {
    // frame
    slide.addShape('rect', {
      x: m.x, y: 1.95, w: m.w, h: 1.4,
      fill: { color: 'FFFFFF' },
      line: { color: theme.secondary, width: 1, dashType: 'dash' },
      rectRadius: 0.05
    });
    // title bar
    slide.addShape('rect', {
      x: m.x, y: 1.95, w: m.w, h: 0.3,
      fill: { color: theme.primary },
      line: { color: theme.primary, width: 0 },
      rectRadius: 0.05
    });
    slide.addText(m.label, {
      x: m.x + 0.15, y: 1.95, w: m.w - 0.3, h: 0.3,
      fontSize: 9, fontFace: FONT_EN, bold: true, charSpacing: 2,
      color: 'FFFFFF', valign: 'middle', margin: 0
    });
    // content: mock directory lines
    const lines = m.label === 'PROJECT DIRECTORY'
      ? [
          'dailyflow/        .  root',
          '  . core/         .  engine',
          '  . ui/           .  workspace',
          '  . sync/         .  git . ipfs',
          '  . ai/           .  15+ providers',
          '  . docs/         .  public',
          '  . tests/        .  99 files'
        ]
      : [
          'v1.8.0  .  2026-08  .  99 tests',
          'v1.7.0  .  2026-07  .  mindmap',
          'v1.6.0  .  2026-06  .  ipfs sync',
          'v1.5.0  .  2026-05  .  plugin mkt',
          'v1.4.0  .  2026-04  .  agent api',
          'v1.3.0  .  2026-03  .  mobile pwa',
          'v1.0.0  .  2025-12  .  first cut'
        ];
    lines.forEach((ln, i) => {
      slide.addText(ln, {
        x: m.x + 0.2, y: 2.3 + i * 0.13, w: m.w - 0.3, h: 0.13,
        fontSize: 8, fontFace: 'Consolas',
        color: theme.primary, margin: 0
      });
    });
  });

  // 4 reasons as 2x2 grid below mocks
  const reasons = [
    {
      h: '信任必须可验证',
      d: '产品处理的是你最私密的东西. 很安全不该由我们自己说 -- 代码摊开, 自己看.'
    },
    {
      h: '谁都可以二次开发',
      d: 'Apache-2.0, 可 fork, 可做垂直版本. Agent Skill 接口开放, 社区直接写技能.'
    },
    {
      h: '反锁定是双向的',
      d: '用户不被我们锁定 ; 我们也只能靠持续迭代留住用户 -- 开源对团队的硬约束.'
    },
    {
      h: '开源不死',
      d: '哪怕我们明天关门, 代码, 数据格式, 你的文件都还在. 产品寿命不绑定公司寿命.'
    }
  ];
  const startX = 0.4, startY = 3.55, cellW = 4.5, cellH = 0.65, gapX = 0.2, gapY = 0.1;
  reasons.forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = startX + col * (cellW + gapX);
    const y = startY + row * (cellH + gapY);
    slide.addShape('rect', {
      x, y, w: cellW, h: cellH,
      fill: { color: theme.light, transparency: 80 },
      line: { color: theme.light, width: 0 },
      rectRadius: 0.06
    });
    // number
    slide.addText(String(i + 1).padStart(2, '0'), {
      x: x + 0.15, y: y + 0.05, w: 0.4, h: 0.4,
      fontSize: 16, fontFace: FONT_EN, bold: true,
      color: theme.accent, margin: 0
    });
    slide.addText(r.h, {
      x: x + 0.55, y: y + 0.05, w: cellW - 0.7, h: 0.28,
      fontSize: 12, fontFace: FONT_CN, bold: true,
      color: theme.primary, margin: 0
    });
    slide.addText(r.d, {
      x: x + 0.55, y: y + 0.32, w: cellW - 0.7, h: 0.3,
      fontSize: 9, fontFace: FONT_CN,
      color: theme.secondary, margin: 0
    });
  });

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('开源不是姿态, 是产品立场 -- 用户要看得见, 才敢把记忆交给你.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 12, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 11, 16);
}

module.exports = { createSlide };
