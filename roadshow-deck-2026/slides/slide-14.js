// Slide 14 - Portable AI: knows your todos (positioning + 3 capabilities + why hardware)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'NEXT  /  14');
  addTitle(slide, theme, '下一步 . 一个 懂你待办 的随身 AI', 'A portable AI that knows your todos.');

  // Positioning one-liner
  slide.addShape('rect', {
    x: 0.4, y: 1.85, w: 9.2, h: 0.55,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('不是录音笔, 也不是替代手机 -- 是把你的资产基地带在身上: 它知道你的任务, 记得你的承诺, 随时接得住你的想法.', {
    x: 0.55, y: 1.85, w: 8.9, h: 0.55,
    fontSize: 11, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', valign: 'middle', margin: 0
  });

  // 3 capabilities
  const caps = [
    {
      h: '随身待办',
      en: 'Always-on todos',
      d: '今天的三件重点, 快逾期的承诺 -- 抬手就能看, 随口就能问.'
    },
    {
      h: '随时捕获',
      en: 'Capture anywhere',
      d: '会议, 口头约定, 路上的灵感 -- 按一下就记下来 (mindmap / note / task).'
    },
    {
      h: '回到桌前自动归位',
      en: 'Auto-sorted at desk',
      d: '录下的内容汇入工作区: 变笔记, 抽行动项, 等你确认. 记忆与智能层现成复用.'
    }
  ];
  const startX = 0.4, startY = 2.55;
  const cardW = 3.0, cardH = 1.6, gap = 0.1;
  caps.forEach((c, i) => {
    const x = startX + i * (cardW + gap);
    slide.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: theme.light, transparency: 75 },
      line: { color: theme.light, width: 0 },
      rectRadius: 0.1
    });
    // number circle
    slide.addShape('oval', {
      x: x + 0.2, y: startY + 0.2, w: 0.45, h: 0.45,
      fill: { color: theme.accent },
      line: { color: theme.accent, width: 0 }
    });
    slide.addText(String(i + 1), {
      x: x + 0.2, y: startY + 0.2, w: 0.45, h: 0.45,
      fontSize: 16, fontFace: FONT_EN, bold: true,
      color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
    });
    // head
    slide.addText(c.h, {
      x: x + 0.75, y: startY + 0.2, w: cardW - 0.85, h: 0.3,
      fontSize: 14, fontFace: FONT_CN, bold: true,
      color: theme.primary, margin: 0
    });
    // en
    slide.addText(c.en, {
      x: x + 0.75, y: startY + 0.5, w: cardW - 0.85, h: 0.25,
      fontSize: 9, fontFace: FONT_EN, italic: true,
      color: theme.secondary, margin: 0
    });
    // body
    slide.addText(c.d, {
      x: x + 0.2, y: startY + 0.85, w: cardW - 0.4, h: 0.7,
      fontSize: 10, fontFace: FONT_CN,
      color: theme.primary, valign: 'top', margin: 0
    });
  });

  // Why hardware (2 lines)
  slide.addText('为什么是硬件 ?', {
    x: 0.4, y: 4.3, w: 9.2, h: 0.3,
    fontSize: 12, fontFace: FONT_CN, bold: true,
    color: theme.accent, margin: 0
  });
  slide.addText('重要的话都不在电脑前说 ; 手机掏出来, 解锁, 打开 App -- 冲动已经过去了.', {
    x: 0.4, y: 4.55, w: 9.2, h: 0.3,
    fontSize: 10, fontFace: FONT_CN,
    color: theme.primary, margin: 0
  });
  slide.addText('AI Pin / Rabbit 想替代手机都失败了 -- 我们不替代手机, 只做 随身 这一件事.', {
    x: 0.4, y: 4.8, w: 9.2, h: 0.3,
    fontSize: 10, fontFace: FONT_CN,
    color: theme.primary, margin: 0
  });

  // Status pill
  slide.addShape('rect', {
    x: 0.4, y: 5.18, w: 4.5, h: 0.32,
    fill: { color: theme.accent },
    line: { color: theme.accent, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('方案推进中 . 寻找硬件共创伙伴 (供应链 + 端侧模型厂商)', {
    x: 0.4, y: 5.18, w: 4.5, h: 0.32,
    fontSize: 9, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 14, 16);
}

module.exports = { createSlide };
