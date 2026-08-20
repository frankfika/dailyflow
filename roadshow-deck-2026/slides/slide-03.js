// Slide 03 - Product loop: collect -> organize -> execute -> review
// Layout: 4-step horizontal process with arrows + bottom one-liner
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'THE LOOP  /  03');
  addTitle(slide, theme, 'DailyFlow 做的事: 把散掉的工作闭合成一个循环', 'Close the loop on a scattered workday.');

  // 4 steps
  const steps = [
    { num: '01', head: '收集', en: 'Collect',  body: 'Inbox 随手记, 笔记, 会议录音 (本地转写). 先进来再说.' },
    { num: '02', head: '整理', en: 'Organize', body: 'AI 帮你拆解 -- 脑图节点一键变任务, 会议内容变成行动项.' },
    { num: '03', head: '执行', en: 'Execute',  body: 'Today 视图每天收敛到 1-3 件真正要推进的事. 逾期自动浮现.' },
    { num: '04', head: '复盘', en: 'Review',   body: '日报周报自动生成. 做完了什么, 什么被推迟, 全部存回文件.' }
  ];

  const startX = 0.4, startY = 2.1;
  const cardW = 2.15, cardH = 2.6, gap = 0.15;

  steps.forEach((s, i) => {
    const x = startX + i * (cardW + gap);
    // card body
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: 'FFFFFF' },
      line: { color: theme.light, width: 1.5 },
      rectRadius: 0.1
    });
    // number block top
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: 0.55,
      fill: { color: theme.primary },
      line: { color: theme.primary, width: 0 },
      rectRadius: 0.05
    });
    // mask the bottom of the number block to keep top-rounded only
    slide.addShape('rect', {
      x, y: startY + 0.3, w: cardW, h: 0.25,
      fill: { color: theme.primary },
      line: { color: theme.primary, width: 0 }
    });
    slide.addText(s.num, {
      x, y: startY, w: cardW, h: 0.55,
      fontSize: 18, fontFace: FONT_EN, bold: true,
      color: theme.accent, align: 'center', valign: 'middle', margin: 0
    });
    // head CN
    slide.addText(s.head, {
      x: x + 0.15, y: startY + 0.7, w: cardW - 0.3, h: 0.45,
      fontSize: 22, fontFace: FONT_CN, bold: true,
      color: theme.primary, align: 'center', margin: 0
    });
    // head EN
    slide.addText(s.en, {
      x: x + 0.15, y: startY + 1.15, w: cardW - 0.3, h: 0.3,
      fontSize: 11, fontFace: FONT_EN, italic: true,
      color: theme.secondary, align: 'center', margin: 0
    });
    // body
    slide.addText(s.body, {
      x: x + 0.18, y: startY + 1.5, w: cardW - 0.36, h: 1.05,
      fontSize: 10, fontFace: FONT_CN,
      color: theme.primary, valign: 'top', margin: 0
    });
  });

  // Arrows between cards (small accent triangles)
  for (let i = 0; i < 3; i++) {
    const ax = startX + (i + 1) * cardW + i * gap + 0.01;
    const ay = startY + cardH / 2 - 0.06;
    slide.addShape('rect', {
      x: ax, y: ay, w: 0.12, h: 0.12,
      fill: { color: theme.accent },
      line: { color: theme.accent, width: 0 },
      rotate: 45
    });
  }

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('每一步的数据都落在你自己磁盘上的 Markdown 文件里 -- 循环每转一圈, 积累就多一层.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 12, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 3, 16);
}

module.exports = { createSlide };
