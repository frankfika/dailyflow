// Slide 07 - Real product shot 1: thinking + execution (MINDMAP + TODAY)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'REAL PRODUCT  /  07');
  addTitle(slide, theme, '不是效果图, 是每天在用的产品', 'Not mockups -- a product in daily use.');

  // ---- Left 2/3: MINDMAP mock ----
  const mx = 0.4, my = 2.0, mw = 6.0, mh = 2.85;
  slide.addShape('rect', {
    x: mx, y: my, w: mw, h: mh,
    fill: { color: theme.light, transparency: 80 },
    line: { color: theme.light, width: 0 },
    rectRadius: 0.1
  });
  // title bar
  slide.addShape('rect', {
    x: mx, y: my, w: mw, h: 0.4,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('MINDMAP  .  想法摊开 . 拆解 . 节点一键变任务', {
    x: mx + 0.2, y: my, w: mw - 0.4, h: 0.4,
    fontSize: 11, fontFace: FONT_EN, bold: true, charSpacing: 2,
    color: 'FFFFFF', valign: 'middle', margin: 0
  });

  // root
  const rX = mx + mw / 2 - 0.7, rY = my + 0.7;
  slide.addShape('rect', {
    x: rX, y: rY, w: 1.4, h: 0.4,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('Q4 路线图', {
    x: rX, y: rY, w: 1.4, h: 0.4,
    fontSize: 10, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });
  // branches
  const nodes = [
    { x: mx + 0.3, y: rY + 0.6, w: 1.2, label: '用户调研', kind: 'idea' },
    { x: mx + 1.7, y: rY + 0.6, w: 1.2, label: '竞品分析', kind: 'idea' },
    { x: mx + 3.1, y: rY + 0.6, w: 1.2, label: '技术选型', kind: 'task' },
    { x: mx + 4.5, y: rY + 0.6, w: 1.2, label: '架构草图', kind: 'idea' },
    { x: mx + 0.7, y: rY + 1.4, w: 1.2, label: 'POC Demo', kind: 'task' },
    { x: mx + 2.4, y: rY + 1.4, w: 1.2, label: '风险清单', kind: 'risk' },
    { x: mx + 4.1, y: rY + 1.4, w: 1.2, label: '资源评估', kind: 'idea' }
  ];
  nodes.forEach((n) => {
    const fillCol = n.kind === 'task' ? theme.primary : (n.kind === 'risk' ? 'D90429' : 'FFFFFF');
    const textCol = n.kind === 'task' ? 'FFFFFF' : theme.primary;
    const borderCol = n.kind === 'task' ? theme.primary : (n.kind === 'risk' ? 'D90429' : theme.secondary);
    slide.addShape('rect', {
      x: n.x, y: n.y, w: n.w, h: 0.35,
      fill: { color: fillCol },
      line: { color: borderCol, width: 1 },
      rectRadius: 0.04
    });
    slide.addText((n.kind === 'task' ? '* ' : '') + n.label, {
      x: n.x, y: n.y, w: n.w, h: 0.35,
      fontSize: 9, fontFace: FONT_CN, bold: n.kind === 'task',
      color: textCol, align: 'center', valign: 'middle', margin: 0
    });
    // connector
    slide.addShape('line', {
      x: n.x + n.w / 2, y: rY + 0.4,
      w: 0, h: n.y - (rY + 0.4),
      line: { color: theme.secondary, width: 0.6 }
    });
  });
  // legend
  slide.addText('*  =  promoted to task    .  red  =  risk', {
    x: mx + 0.2, y: my + mh - 0.32, w: mw - 0.4, h: 0.25,
    fontSize: 8, fontFace: FONT_EN, italic: true,
    color: theme.secondary, margin: 0
  });

  // ---- Right 1/3: TODAY mock ----
  const tx = 6.6, ty = 2.0, tw = 3.0, th = 2.85;
  slide.addShape('rect', {
    x: tx, y: ty, w: tw, h: th,
    fill: { color: 'FFFFFF' },
    line: { color: theme.light, width: 1.5 },
    rectRadius: 0.1
  });
  slide.addShape('rect', {
    x: tx, y: ty, w: tw, h: 0.4,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('TODAY  .  今天', {
    x: tx + 0.2, y: ty, w: tw - 0.4, h: 0.4,
    fontSize: 11, fontFace: FONT_EN, bold: true, charSpacing: 2,
    color: 'FFFFFF', valign: 'middle', margin: 0
  });
  const today = [
    { h: '09:30  和投资人同步 Q4 节奏', overdue: false, done: true },
    { h: '14:00  评审 POC Demo 脚本',   overdue: false, done: false },
    { h: '17:00  风险清单过一遍',       overdue: true,  done: false }
  ];
  today.forEach((t, i) => {
    const y = ty + 0.55 + i * 0.65;
    // checkbox
    slide.addShape('rect', {
      x: tx + 0.2, y: y + 0.05, w: 0.25, h: 0.25,
      fill: { color: t.done ? theme.accent : 'FFFFFF' },
      line: { color: t.done ? theme.accent : theme.secondary, width: 1 }
    });
    if (t.done) {
      slide.addText('v', {
        x: tx + 0.2, y: y + 0.05, w: 0.25, h: 0.25,
        fontSize: 11, fontFace: FONT_EN, bold: true,
        color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
      });
    }
    slide.addText(t.h, {
      x: tx + 0.55, y: y, w: tw - 0.7, h: 0.4,
      fontSize: 10, fontFace: FONT_CN, bold: t.done,
      color: t.done ? theme.secondary : (t.overdue ? 'D90429' : theme.primary),
      valign: 'middle', margin: 0
    });
    if (t.overdue) {
      slide.addText('overdue', {
        x: tx + 0.55, y: y + 0.32, w: tw - 0.7, h: 0.2,
        fontSize: 8, fontFace: FONT_EN, italic: true,
        color: 'D90429', margin: 0
      });
    }
  });
  // footer
  slide.addText('1-3 件 . 逾期自动浮现', {
    x: tx + 0.2, y: ty + th - 0.3, w: tw - 0.4, h: 0.25,
    fontSize: 8, fontFace: FONT_EN, italic: true,
    color: theme.secondary, margin: 0
  });

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('左脑 . 把想法摊开 ; 右脑 . 把要做的事收敛到今天.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 12, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 7, 16);
}

module.exports = { createSlide };
