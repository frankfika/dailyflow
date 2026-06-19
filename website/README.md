# DailyFlow 官网

这是 DailyFlow 项目的官方营销网站源代码，纯静态 HTML/CSS/JS，零构建依赖。

## 目录结构

```
website/
├── index.html        # 主页面
├── styles.css        # 玻璃态 + OKLCH 设计系统
├── script.js         # GitHub Release 拉取 + 滚动揭示
└── README.md
```

截图资源直接从 `../docs/assets/` 引用，无需复制。

## 本地预览

```bash
# 任意静态文件服务器都可以
cd website
python3 -m http.server 8080
# 或
npx serve .
```

然后打开 http://localhost:8080

## 部署

可部署到任意静态托管：

- 腾讯云 EdgeOne Pages（推荐，国内加速）
- Vercel / Netlify / Cloudflare Pages
- GitHub Pages

详见 `../scripts/deploy-website.md`（如有）。

## 设计要点

- **风格**：Silicon Valley Glassmorphic（玻璃 + 极光 + 弹簧动效）
- **品牌色**：呼应项目 logo 的黑白极简（主色 `#0A0A0A`）+ 紫色 / 蓝色玻璃高光
- **字体**：Inter (sans) + Source Serif Pro (serif, 大标题) + JetBrains Mono (code)
- **色彩空间**：OKLCH（perceptual uniform）
- **响应式**：mobile-first，1 列 → 2 列 → 3 列
- **无障碍**：`prefers-reduced-motion` 尊重，`prefers-color-scheme` 自动适配暗色

## GitHub Release 自动拉取

`scipt.js` 在加载时调用 `https://api.github.com/repos/frankfika/dailyflow/releases/latest`，
按当前 UA 自动识别平台（macOS Apple Silicon / Intel / Windows / Linux），并把对应 asset 标为 featured。

若 fetch 失败（限流 / 离线），回退到 README 中的 v1.0.0，并提示用户前往 Releases 页面下载。