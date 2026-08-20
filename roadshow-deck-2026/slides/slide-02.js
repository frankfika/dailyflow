// Slide 02 - Problem: how the workday falls apart
// Layout: 3 cards in a row + bottom one-liner
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'THE PROBLEM  /  02');
  addTitle(slide, theme, '事情是这样散掉的', 'How the workday falls apart.');

  const cards = [
    {
      tag: '01',
      head: '事情散在各处',
      en: 'Scattered everywhere',
      body: '想法在微信里, 会议在录音里, 任务在脑子里. 到了晚上, 谁也不记得谁.'
    },
    {
      tag: '02',
      head: '工具要人伺候',
      en: 'Tools need you to behave',
      body: '待办工具假设你自律 -- 每天整理, 每周归档. 但你需要工具恰恰因为你不自律. 三个月, 系统就长满杂草.'
    },
    {
      tag: '03',
      head: 'AI 聊完就忘',
      en: 'AI forgets after the chat',
      body: '云端助手每次对话从零开始. 你教它的偏好, 告诉它的背景, 散场就没了.'
    }
  ];

  cards.forEach((c, i) => {
    const x = 0.4 + i * 3.15;
    // card body
    slide.addShape('rect', {
      x, y: 2.0, w: 3.0, h: 2.7,
      fill: { color: theme.light, transparency: 75 },
      line: { color: theme.light, width: 0 },
      rectRadius: 0.1
    });
    // accent vertical bar
    slide.addShape('rect', {
      x, y: 2.0, w: 0.08, h: 2.7,
      fill: { color: theme.accent },
      line: { color: theme.accent, width: 0 }
    });
    // tag
    slide.addText(c.tag, {
      x: x + 0.25, y: 2.15, w: 0.8, h: 0.4,
      fontSize: 20, fontFace: FONT_EN, bold: true,
      color: theme.accent, margin: 0
    });
    // head
    slide.addText(c.head, {
      x: x + 0.25, y: 2.55, w: 2.6, h: 0.4,
      fontSize: 18, fontFace: FONT_CN, bold: true,
      color: theme.primary, margin: 0
    });
    // head en
    slide.addText(c.en, {
      x: x + 0.25, y: 2.95, w: 2.6, h: 0.3,
      fontSize: 10, fontFace: FONT_EN, italic: true,
      color: theme.secondary, margin: 0
    });
    // body
    slide.addText(c.body, {
      x: x + 0.25, y: 3.3, w: 2.6, h: 1.3,
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
  slide.addText('散掉的不是任务, 是 上下文 -- 而它本该是能攒下来的东西.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 13, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 2, 16);
}

module.exports = { createSlide };
