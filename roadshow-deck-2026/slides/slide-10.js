// Slide 10 - Competitive landscape (comparison table)
const { FONT_CN, FONT_EN, addPageNumber, addTopBar, addTitle } = require('./_common.js');

function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.bg };
  addTopBar(slide, theme, 'LANDSCAPE  /  10');
  addTitle(slide, theme, '这个位置, 目前是空的', 'This position is currently empty.');

  // Table
  const tableData = [
    [
      { text: '产品', options: { bold: true, color: 'FFFFFF', fill: { color: theme.primary }, fontFace: 'Microsoft YaHei', fontSize: 12, align: 'center', valign: 'middle' } },
      { text: '数据在哪', options: { bold: true, color: 'FFFFFF', fill: { color: theme.primary }, fontFace: 'Microsoft YaHei', fontSize: 12, align: 'center', valign: 'middle' } },
      { text: 'AI 记忆', options: { bold: true, color: 'FFFFFF', fill: { color: theme.primary }, fontFace: 'Microsoft YaHei', fontSize: 12, align: 'center', valign: 'middle' } },
      { text: '任务闭环', options: { bold: true, color: 'FFFFFF', fill: { color: theme.primary }, fontFace: 'Microsoft YaHei', fontSize: 12, align: 'center', valign: 'middle' } },
      { text: '开源', options: { bold: true, color: 'FFFFFF', fill: { color: theme.primary }, fontFace: 'Microsoft YaHei', fontSize: 12, align: 'center', valign: 'middle' } }
    ],
    [
      { text: '钉钉等企业协同', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '云端 (平台侧)', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '平台侧', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '协同任务', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '否', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } }
    ],
    [
      { text: 'Notion', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '云端', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '平台侧 AI', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '弱 (数据库型)', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '否', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } }
    ],
    [
      { text: 'Obsidian', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '本地  v', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle', bold: true } },
      { text: '靠插件, 无内置闭环', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '弱', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '否 (免费但闭源)', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } }
    ],
    [
      { text: '云端 AI 助手', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '云端', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '聊完就忘', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '无', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } },
      { text: '否', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: theme.primary, align: 'center', valign: 'middle' } }
    ],
    [
      { text: 'DailyFlow', options: { fontFace: 'Microsoft YaHei', fontSize: 12, color: 'FFFFFF', bold: true, fill: { color: theme.accent }, align: 'center', valign: 'middle' } },
      { text: '本地 Markdown  v', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: 'FFFFFF', bold: true, fill: { color: theme.accent }, align: 'center', valign: 'middle' } },
      { text: '证据记忆, 越用越懂你  v', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: 'FFFFFF', bold: true, fill: { color: theme.accent }, align: 'center', valign: 'middle' } },
      { text: '脑图  >  任务  >  复盘  v', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: 'FFFFFF', bold: true, fill: { color: theme.accent }, align: 'center', valign: 'middle' } },
      { text: 'Apache-2.0  v', options: { fontFace: 'Microsoft YaHei', fontSize: 11, color: 'FFFFFF', bold: true, fill: { color: theme.accent }, align: 'center', valign: 'middle' } }
    ]
  ];

  slide.addTable(tableData, {
    x: 0.4, y: 1.95, w: 9.2, h: 2.6,
    colW: [1.7, 2.1, 2.1, 1.8, 1.5],
    rowH: 0.42,
    border: { type: 'solid', color: theme.light, pt: 0.5 },
    fill: { color: 'FFFFFF' }
  });

  // Bottom one-liner
  slide.addShape('rect', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fill: { color: theme.primary },
    line: { color: theme.primary, width: 0 },
    rectRadius: 0.05
  });
  slide.addText('云端的帮你做事, 但不让你积累 ; 本地的让你积累, 但不管执行. 两头都占的, 目前只有 DailyFlow.', {
    x: 0.4, y: 4.95, w: 9.2, h: 0.45,
    fontSize: 11, fontFace: FONT_CN, bold: true,
    color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0
  });

  addPageNumber(slide, theme, 10, 16);
}

module.exports = { createSlide };
