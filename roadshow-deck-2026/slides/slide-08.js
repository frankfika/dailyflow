// Slide 08 - Real product shot 2: AI in every part (2x2 grid)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'REAL PRODUCT  /  08');
  addTitle(slide, theme, 'AI 在工作的每个环节里', 'AI in every part of the work.');

  // 2x2 grid
  const cells = [
    {
      label: 'AI CHAT', zh: '多会话 AI',
      real: true,
      desc: '任何笔记可挂载为上下文.'
    },
    {
      label: 'NOTES', zh: '统一笔记',
      real: true,
      desc: '会议记录 . 日记 . AI 总结统一管理.'
    },
    {
      label: 'PLACEHOLDER 01', zh: '占位  01',
      real: false,
      desc: '你后续提供的截图位置  1.'
    },
    {
      label: 'PLACEHOLDER 02', zh: '占位  02',
      real: false,
      desc: '你后续提供的截图位置  2.'
    }
  ];

  const startX = 0.4, startY = 2.0;
  const cellW = 4.5, cellH = 1.4, gapX = 0.2, gapY = 0.15;

  cells.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = startX + col * (cellW + gapX);
    const y = startY + row * (cellH + gapY);

    // cell bg
    slide.addShape('rect', {
      x, y, w: cellW, h: cellH,
      fill: { color: c.real ? 'FFFFFF' : theme.light },
      line: { color: c.real ? theme.primary : theme.secondary, width: c.real ? 1.5 : 1, dashType: c.real ? 'solid' : 'dash' },
      rectRadius: 0.1
    });
    // label tag
    slide.addShape('rect', {
      x, y, w: 1.6, h: 0.35,
      fill: { color: c.real ? theme.primary : theme.secondary },
      line: { color: c.real ? theme.primary : theme.secondary, width: 0 },
      rectRadius: 0.05
    });
    slide.addText(c.label, {
      x, y, w: 1.6, h: 0.35,
      fontSize: 10, fontFace: FONT_EN, bold: true, charSpacing: 2,
      color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
    });
    // mock content area
    if (c.real) {
      // render 3 lines of mock content
      const mocks = [
        [{ x: x + 0.2, y: y + 0.5, w: 1.8, h: 0.12 }, { x: x + 2.1, y: y + 0.5, w: 1.0, h: 0.12 }],
        [{ x: x + 0.2, y: y + 0.75, w: 2.9, h: 0.12 }],
        [{ x: x + 0.2, y: y + 1.0, w: 1.5, h: 0.12 }, { x: x + 1.85, y: y + 1.0, w: 1.4, h: 0.12 }]
      ];
      mocks.forEach((rowM) => {
        rowM.forEach((m) => {
          slide.addShape('rect', {
            x: m.x, y: m.y, w: m.w, h: m.h,
            fill: { color: theme.secondary, transparency: 70 },
            line: { color: theme.secondary, width: 0 },
            rectRadius: 0.02
          });
        });
      });
    } else {
      // placeholder text in the middle
      slide.addText('[' + c.zh + ']', {
        x: x + 0.2, y: y + 0.5, w: cellW - 0.4, h: 0.5,
        fontSize: 22, fontFace: FONT_CN, bold: true,
        color: theme.secondary, align: 'center', valign: 'middle', margin: 0
      });
    }
    // zh label (bottom-right)
    slide.addText(c.zh, {
      x: x + cellW - 1.4, y, w: 1.3, h: 0.35,
      fontSize: 11, fontFace: FONT_CN, bold: true,
      color: c.real ? 'FFFFFF' : theme.primary,
      align: 'right', valign: 'middle', margin: 0
    });
  });

  // Bottom: version strip
  slide.addText('v1.8.0  .  99 个测试文件  .  macOS / Windows / Linux', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.4,
    fontSize: 11, fontFace: FONT_CN, italic: true,
    color: theme.secondary, align: 'center', margin: 0
  });

  addPageNumber(slide, theme, 8, 16);
}

module.exports = { createSlide };
