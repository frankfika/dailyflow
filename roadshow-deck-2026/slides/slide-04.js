// Slide 04 - Highlight 1: mindmap to task, no re-writing
// Layout: Mixed media (left = mindmap mock, right = 3 steps + closing)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'HIGHLIGHT 1  /  04');
  addTitle(slide, theme, '亮点一 . 从脑图到任务, 不用重抄一遍', 'From mindmap to task, no re-writing.');

  // ---- Left: mindmap mock ----
  const mx = 0.4, my = 2.0, mw = 4.6, mh = 2.85;
  // container
  slide.addShape('rect', {
    x: mx, y: my, w: mw, h: mh,
    fill: { color: theme.light, transparency: 80 },
    line: { color: theme.light, width: 0 },
    rectRadius: 0.1
  });
  slide.addText('MINDMAP  .  脑图', {
    x: mx + 0.2, y: my + 0.15, w: mw - 0.4, h: 0.3,
    fontSize: 11, fontFace: FONT_EN, bold: true, charSpacing: 3,
    color: theme.secondary, margin: 0
  });

  // root node
  const rootX = mx + mw / 2 - 0.55, rootY = my + 0.6;
  slide.addShape('rect', {
    x: rootX, y: rootY, w: 1.1, h: 0.4,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('Q4 产品方向', {
    x: rootX, y: rootY, w: 1.1, h: 0.4,
    fontSize: 10, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  // branches
  const branches = [
    { x: mx + 0.3, y: my + 1.3, label: '技术调研', task: true },
    { x: mx + 1.7, y: my + 1.3, label: '用户访谈', task: false },
    { x: mx + 3.1, y: my + 1.3, label: '竞品对比', task: false },
    { x: mx + 0.7, y: my + 2.15, label: '风险清单', task: false },
    { x: mx + 2.4, y: my + 2.15, label: 'Roadmap 草稿', task: true }
  ];
  branches.forEach((b) => {
    // node
    slide.addShape('rect', {
      x: b.x, y: b.y, w: 1.3, h: 0.36,
      fill: { color: b.task ? theme.accent : 'FFFFFF' },
      line: { color: b.task ? theme.accent : theme.secondary, width: 1 },
      rectRadius: 0.04
    });
    slide.addText((b.task ? '* ' : '') + b.label, {
      x: b.x, y: b.y, w: 1.3, h: 0.36,
      fontSize: 9, fontFace: FONT_CN, bold: b.task,
      color: b.task ? 'FFFFFF' : theme.primary,
      align: 'center', valign: 'middle', margin: 0
    });
    // connector to root
    slide.addShape('line', {
      x: b.x + 0.65, y: rootY + 0.4,
      w: 0, h: b.y - (rootY + 0.4),
      line: { color: theme.secondary, width: 0.75 }
    });
  });

  // legend
  slide.addText('*  =  node promoted to task', {
    x: mx + 0.2, y: my + mh - 0.3, w: mw - 0.4, h: 0.25,
    fontSize: 9, fontFace: FONT_EN, italic: true,
    color: theme.secondary, margin: 0
  });

  // ---- Right: 3 steps ----
  const rx = 5.3, ry = 2.0, rw = 4.3;
  slide.addText('3 步走通', {
    x: rx, y: ry, w: rw, h: 0.35,
    fontSize: 14, fontFace: FONT_CN, bold: true,
    color: theme.primary, margin: 0
  });
  const rsteps = [
    {
      n: '1',
      h: '一个模糊的想法, 先在脑图上摊开',
      d: '节点可以是疑问, 资料, 风险, 不只是任务.'
    },
    {
      n: '2',
      h: 'AI 帮你把零散节点整理成结构',
      d: '想清楚的部分, 一键转成任务, 并且和脑图保持关联.'
    },
    {
      n: '3',
      h: '任务进入 Today 执行, 结果自动回流',
      d: '思考过程永远留在原地, 不会因为执行而蒸发.'
    }
  ];
  rsteps.forEach((s, i) => {
    const y = ry + 0.5 + i * 0.78;
    // step number circle
    slide.addShape('oval', {
      x: rx, y: y, w: 0.45, h: 0.45,
      fill: { color: theme.accent },
      line: { color: theme.accent, width: 0 }
    });
    slide.addText(s.n, {
      x: rx, y: y, w: 0.45, h: 0.45,
      fontSize: 14, fontFace: FONT_EN, bold: true,
      color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
    });
    slide.addText(s.h, {
      x: rx + 0.6, y: y - 0.02, w: rw - 0.6, h: 0.32,
      fontSize: 12, fontFace: FONT_CN, bold: true,
      color: theme.primary, margin: 0
    });
    slide.addText(s.d, {
      x: rx + 0.6, y: y + 0.3, w: rw - 0.6, h: 0.42,
      fontSize: 10, fontFace: FONT_CN,
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
  slide.addText('以前的工具里, 想和做是两张皮 -- 想清楚的东西, 抄成待办的那一刻就蒸发了.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 12, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 4, 16);
}

module.exports = { createSlide };
