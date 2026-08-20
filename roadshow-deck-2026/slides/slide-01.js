// Slide 01 - Cover
// Layout: Asymmetric left (text) + right (asset-base visual with 4 satellites)
const { FONT_CN, FONT_EN } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };

  // Top brand bar
  slide.addText('DAILYFLOW  |  TODO  NOTES  MINDMAP  AI  |  LOCAL-FIRST  |  ROADSHOW 2026', {
    x: 0.4, y: 0.3, w: 9.2, h: 0.3,
    fontSize: 10, fontFace: FONT_EN,
    color: theme.secondary, charSpacing: 3, margin: 0
  });
  slide.addShape('rect', {
    x: 0.4, y: 0.65, w: 0.5, h: 0.05,
    fill: { color: theme.accent }, line: { color: theme.accent, width: 0 }
  });

  // English brand (large)
  slide.addText('DailyFlow', {
    x: 0.4, y: 0.95, w: 5.5, h: 1.0,
    fontSize: 64, fontFace: FONT_EN, bold: true,
    color: theme.primary, margin: 0
  });

  // Chinese title (split into 3 lines for impact)
  slide.addText('你的个人', {
    x: 0.4, y: 2.0, w: 5.5, h: 0.55,
    fontSize: 36, fontFace: FONT_CN, bold: true,
    color: theme.primary, margin: 0
  });
  slide.addText('AI 资产基地.', {
    x: 0.4, y: 2.55, w: 5.5, h: 0.7,
    fontSize: 44, fontFace: FONT_CN, bold: true,
    color: theme.accent, margin: 0
  });

  // Subtitle (mixed CN/EN)
  slide.addText('一个 AI 工作台: 待办, 笔记, 脑图, 日历, 加上帮你整理和记忆的 AI.', {
    x: 0.4, y: 3.4, w: 5.5, h: 0.5,
    fontSize: 12, fontFace: FONT_CN,
    color: theme.primary, margin: 0
  });
  slide.addText('An AI workspace: todos, notes, mindmaps, calendar, plus an AI that tidies and remembers.', {
    x: 0.4, y: 3.85, w: 5.5, h: 0.4,
    fontSize: 10, fontFace: FONT_EN, italic: true,
    color: theme.secondary, margin: 0
  });
  slide.addText('所有数据存在你自己的文件里 -- 用得越久, 它越懂你, 这份积累就是你的资产.', {
    x: 0.4, y: 4.3, w: 5.5, h: 0.4,
    fontSize: 11, fontFace: FONT_CN,
    color: theme.secondary, margin: 0
  });

  // Data bar at bottom
  slide.addText('0 字节上传  /  15+ 模型一键接入  /  99 个测试文件  /  v1.8.0  /  macOS . Win . Linux', {
    x: 0.4, y: 5.15, w: 7.5, h: 0.3,
    fontSize: 10, fontFace: FONT_CN,
    color: theme.primary, margin: 0
  });

  // ---- Right side: center "asset base" + 4 satellite chips ----
  // Center
  const cx = 7.85, cy = 2.8;
  const cr = 1.1;
  slide.addShape('oval', {
    x: cx - cr / 2, y: cy - cr / 2, w: cr, h: cr,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 }
  });
  slide.addText('你的\n资产基地', {
    x: cx - cr / 2, y: cy - cr / 2, w: cr, h: cr,
    fontSize: 15, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  // 4 chips
  const chips = [
    { label: '待办',  en: 'Todos',    x: 6.3, y: 1.05, w: 1.4, h: 0.5 },
    { label: '笔记',  en: 'Notes',    x: 8.1, y: 1.05, w: 1.4, h: 0.5 },
    { label: '脑图',  en: 'Mindmap',  x: 6.3, y: 4.05, w: 1.4, h: 0.5 },
    { label: 'AI',    en: 'AI',       x: 8.1, y: 4.05, w: 1.4, h: 0.5 }
  ];
  chips.forEach((c) => {
    slide.addShape('rect', {
      x: c.x, y: c.y, w: c.w, h: c.h,
      fill: { color: theme.accent },
      line: { color: theme.accent, width: 0 },
      rectRadius: 0.08
    });
    slide.addText(`${c.label}  ${c.en}`, {
      x: c.x, y: c.y, w: c.w, h: c.h,
      fontSize: 11, fontFace: FONT_CN, bold: true,
      color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
    });
  });
}

module.exports = { createSlide };
