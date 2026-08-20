// Slide 05 - Highlight 2: Sovereign AI (3 rules)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'HIGHLIGHT 2  /  05');
  addTitle(slide, theme, '亮点二 . 主权 AI: 绝对控制权在你手里', 'Sovereign AI: absolute control stays with you.');

  const rules = [
    {
      n: '01',
      head: '文件在你自己的磁盘上',
      en: 'Your files, your disk',
      body: '全是 Markdown 纯文本, 任何编辑器都能打开, 0 字节上传. 哪天不用 DailyFlow 了, 文件还是你的.'
    },
    {
      n: '02',
      head: 'AI 只提建议, 不直接改',
      en: 'AI suggests, never overwrites',
      body: '任何修改先生成一张 建议单, 写清楚要改什么. 你确认之后才写入, 写错了可以撤回.'
    },
    {
      n: '03',
      head: '回答必须带出处',
      en: 'Answers come with sources',
      body: '引用你文件里的原文片段, 标明来自哪里. 查不到出处的, 它不瞎编.'
    }
  ];

  // 3 rules laid out as full-width rows
  const startY = 2.0;
  const rowH = 0.85;
  const gap = 0.15;

  rules.forEach((r, i) => {
    const y = startY + i * (rowH + gap);
    // row bg
    slide.addShape('rect', {
      x: 0.4, y, w: 9.2, h: rowH,
      fill: { color: theme.light, transparency: 80 },
      line: { color: theme.light, width: 0 },
      rectRadius: 0.08
    });
    // number block
    slide.addShape('rect', {
      x: 0.4, y, w: 0.95, h: rowH,
      fill: { color: theme.primary },
      line: { color: theme.primary, width: 0 },
      rectRadius: 0.08
    });
    slide.addText(r.n, {
      x: 0.4, y, w: 0.95, h: rowH,
      fontSize: 30, fontFace: FONT_EN, bold: true,
      color: theme.accent, align: 'center', valign: 'middle', margin: 0
    });
    // head
    slide.addText(r.head, {
      x: 1.5, y: y + 0.1, w: 5.0, h: 0.35,
      fontSize: 16, fontFace: FONT_CN, bold: true,
      color: theme.primary, margin: 0
    });
    // head en
    slide.addText(r.en, {
      x: 1.5, y: y + 0.45, w: 5.0, h: 0.28,
      fontSize: 10, fontFace: FONT_EN, italic: true,
      color: theme.secondary, margin: 0
    });
    // body
    slide.addText(r.body, {
      x: 6.6, y: y + 0.1, w: 2.9, h: rowH - 0.2,
      fontSize: 10, fontFace: FONT_CN,
      color: theme.primary, valign: 'middle', margin: 0
    });
  });

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('规矩写在代码里, 不是提示词约定 -- 例如 等待中 的事项, AI 排计划时无权放进今天.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 11, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 5, 16);
}

module.exports = { createSlide };
