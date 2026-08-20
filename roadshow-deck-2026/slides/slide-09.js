// Slide 09 - The vision: from workspace to asset base (3-line logic + closing)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'THE VISION  /  09');
  addTitle(slide, theme, '这些设计加在一起, 是什么 ? . 你的 个人 AI 资产基地', 'What does it add up to? Your personal AI asset base.');

  const lines = [
    {
      tag: '1',
      head: '模型在贬值',
      en: 'Models are commoditizing',
      d: '15+ 家供应商跑在同一接口后面. 聪明不再是壁垒, 随时可换.'
    },
    {
      tag: '2',
      head: '云端在失忆',
      en: 'Cloud AI forgets',
      d: '订阅制 AI 不会为你积累任何东西 -- 这是它的商业模式决定的.'
    },
    {
      tag: '3',
      head: 'DailyFlow 用户在积累',
      en: 'DailyFlow users accumulate',
      d: '每天的决策, 承诺, 会议原文都留在本地文件里. 模型随便换, 记忆不动.'
    }
  ];

  const startY = 2.0, rowH = 0.8, gap = 0.18;
  lines.forEach((l, i) => {
    const y = startY + i * (rowH + gap);
    const isOurs = i === 2;
    // row bg
    slide.addShape('rect', {
      x: 0.4, y, w: 9.2, h: rowH,
      fill: { color: isOurs ? theme.accent : theme.light, transparency: isOurs ? 0 : 75 },
      line: { color: isOurs ? theme.accent : theme.light, width: 0 },
      rectRadius: 0.08
    });
    // big tag circle
    slide.addShape('oval', {
      x: 0.55, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5,
      fill: { color: isOurs ? theme.primary : 'FFFFFF' },
      line: { color: isOurs ? theme.primary : theme.primary, width: 1 }
    });
    slide.addText(l.tag, {
      x: 0.55, y: y + (rowH - 0.5) / 2, w: 0.5, h: 0.5,
      fontSize: 18, fontFace: FONT_EN, bold: true,
      color: isOurs ? theme.accent : theme.primary,
      align: 'center', valign: 'middle', margin: 0
    });
    // head
    slide.addText(l.head, {
      x: 1.2, y: y + 0.1, w: 2.8, h: 0.4,
      fontSize: 18, fontFace: FONT_CN, bold: true,
      color: isOurs ? 'FFFFFF' : theme.primary, margin: 0
    });
    // en
    slide.addText(l.en, {
      x: 1.2, y: y + 0.5, w: 2.8, h: 0.28,
      fontSize: 10, fontFace: FONT_EN, italic: true,
      color: isOurs ? 'FFFFFF' : theme.secondary, margin: 0
    });
    // description
    slide.addText(l.d, {
      x: 4.2, y: y + 0.1, w: 5.3, h: rowH - 0.2,
      fontSize: 12, fontFace: FONT_CN,
      color: isOurs ? 'FFFFFF' : theme.primary,
      valign: 'middle', margin: 0
    });
  });

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('AI 时代, 每个人都需要一个自己的资产基地 -- 数据在你这里, 规则由你定, AI 为你工作.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 12, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 9, 16);
}

module.exports = { createSlide };
