/* ===== DailyFlow site interactions ===== */

(() => {
  'use strict';

  const REPO = 'frankfika/dailyflow';
  const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
  const REPO_API = `https://api.github.com/repos/${REPO}`;
  const RELEASE_PAGE = `https://github.com/${REPO}/releases`;
  const REPO_PAGE = `https://github.com/${REPO}`;

  // English is the default. The visitor's explicit choice is remembered.
  const TEXT = new Map([
    ['产品', 'Product'], ['工作流', 'Workflow'], ['对比', 'Compare'], ['界面', 'Screens'], ['下载', 'Download'],
    ['下载 v', 'Download v'], ['v1.0.1 · 精简上线：任务 + 笔记 + AI 对话', 'v1.0.1 · A focused release: Tasks + Notes + AI Chat'],
    ['专注今天。', 'Focus on today.'], ['让 AI 处理其余。', 'Let AI handle the rest.'],
    ['本地优先的任务与笔记系统。', 'A local-first workspace for tasks and notes.'],
    ['Markdown 为唯一数据源，自动迁移未完成任务，AI Chat 可挂载任意笔记与项目上下文。', 'Markdown is your source of truth, unfinished tasks roll forward automatically, and AI Chat can use any note or project as context.'],
    ['立即下载', 'Download now'], ['支持', 'Available for'], ['未完成任务自动滚动到今天…', 'Unfinished tasks roll forward to today…'],
    ['挂载笔记与项目上下文提问…', 'Ask with notes and project context…'], ['DailyFlow 是什么', 'What is DailyFlow?'],
    ['不是更复杂的工具，', 'Not another complicated tool,'], ['而是任务 + 笔记 + AI 对话的一体化桌面体验', 'but one desktop workflow for tasks, notes, and AI chat'],
    ['DailyFlow 相信：大多数任务没完成，是因为信息散落在各处。我们把 Today、Notes 和 AI Chat 连成一条链路，让你始终专注下一步。', 'Most work stalls because its context is scattered. DailyFlow connects Today, Notes, and AI Chat so the next step is always clear.'],
    ['今日任务自动迁移', 'Automatic task rollover'], ['未完成的任务次日自动滚动，保留来源日期。打开 Today 就能继续，不需要手动复制。', 'Unfinished tasks roll into the next day with their original date preserved. Open Today and keep going—no copying required.'],
    ['笔记即上下文', 'Notes are context'], ['任意笔记都能挂载到 AI Chat。提问时带上会议记录、项目资料或灵感片段，AI 的回答更贴合你的实际上下文。', 'Attach any note to AI Chat. Bring meeting notes, project material, or an idea into the conversation for answers grounded in your real work.'],
    ['AI 驱动执行', 'AI-assisted execution'], ['Brain Dump 自动提取待办，AI Chat 直接创建任务和笔记。让 AI 处理整理，你只做决策。', 'Brain Dump extracts action items, while AI Chat creates tasks and notes. Let AI organize the input so you can make the decisions.'],
    ['从灵感到执行，DailyFlow 给你一条最短路径。不再让想法死在备忘录里。', 'DailyFlow gives ideas the shortest path to action, so they do not disappear inside a notes app.'],
    ['捕获', 'Capture'], ['在 Today 快速添加任务，或在 Notes 里记录会议、灵感。Brain Dump 把零散想法自动归类。', 'Add a task in Today or capture meetings and ideas in Notes. Brain Dump organizes loose thoughts automatically.'],
    ['记录', 'Note'], ['用 Markdown + YAML 记录笔记，支持 `#project:名称`、标签、@提及。笔记与任务双向关联。', 'Write in Markdown + YAML with project references, tags, and @mentions. Notes and tasks link in both directions.'],
    ['提问', 'Ask'], ['在 AI Chat 中挂载今日任务、任意笔记或项目上下文。AI 帮你拆解、总结、生成下一步。', 'Attach today’s tasks, any note, or a project to AI Chat. AI can break work down, summarize it, and propose the next step.'],
    ['执行', 'Act'], ['AI 可直接创建任务、保存笔记。你在 Today 里完成它们，未完成的会自动滚动到明天。', 'AI can create tasks and save notes directly. Complete them in Today; anything unfinished rolls into tomorrow.'],
    ['为什么选 DailyFlow', 'Why DailyFlow'], ['把「记录」与「执行」连成一条链路', 'Connect capture directly to execution'],
    ['不是更花哨的工具，而是让任务、笔记和 AI 对话在同一个本地桌面里协同工作。', 'A focused local desktop where tasks, notes, and AI conversations work together.'],
    ['传统方式', 'Traditional workflow'], ['用 DailyFlow', 'With DailyFlow'], ['任务与笔记', 'Tasks and notes'],
    ['分散在 todo 和备忘录之间，缺少关联', 'Scattered across todo lists and notes'], ['一体化', 'in one workspace'],
    ['思考过程', 'Thinking process'], ['散落在聊天、文档、脑图工具之间', 'Split across chats, docs, and mind maps'],
    ['AI Chat 挂载笔记上下文', 'AI Chat uses note context'], ['，可追溯', ', with a traceable history'], ['任务来源', 'Task context'],
    ['经常忘记「为什么今天要干这个」', 'The reason behind today’s task gets lost'], ['笔记与项目标签', 'Notes and project tags'], ['自然关联', 'link naturally'], ['到任务', 'to tasks'],
    ['数据归属', 'Data ownership'], ['锁在 SaaS 平台', 'Locked inside a SaaS platform'], ['本地 Markdown', 'Local Markdown'], ['，完全可控', ', fully under your control'],
    ['网络依赖', 'Network dependency'], ['需要联网', 'Requires a connection'], ['离线优先，', 'Offline-first, with a '], ['内置 Node.js 运行时', 'bundled Node.js runtime'],
    ['AI 助手', 'AI assistant'], ['额外付费', 'A separate paid add-on'], ['内置 AI，', 'Built-in AI with '], ['15+ 模型供应商', '15+ model providers'],
    ['当日执行', 'Daily execution'], ['手动迁移未完成任务', 'Manually move unfinished work'], ['自动滚动', 'Rolls forward automatically'], ['到今日，打开即用', '—ready when Today opens'],
    ['界面预览', 'Product tour'], ['为专注今天而生的桌面体验', 'A desktop experience built for today’s focus'],
    ['原生桌面应用，玻璃质感、毛玻璃层级、Apple 风格动效。', 'A native desktop app with layered glass surfaces and restrained, Apple-inspired motion.'],
    ['挂载今日任务作为上下文', 'Attach today’s tasks as context'], ['挂载任意笔记或项目', 'Attach any note or project'],
    ['AI 可直接创建任务和笔记', 'AI can create tasks and notes'], ['15+ 模型供应商一键切换', 'Switch among 15+ model providers'],
    ['架构', 'Architecture'], ['一个完整的桌面系统', 'A complete desktop system'],
    ['Tauri 桌面壳 + 内置 Node.js 运行时 + 本地 Markdown 文件 — 零外部依赖。', 'A Tauri desktop shell, bundled Node.js runtime, and local Markdown files—with no external runtime dependencies.'],
    ['原生窗口、菜单、文件系统、自动更新。', 'Native windows, menus, filesystem access, and automatic updates.'],
    ['下载即用 — 用户机器', 'Ready after download—'], ['无需安装 Node', 'no Node installation required'],
    ['本地 HTTP API，操作 Markdown 文件、AI 调用、同步。', 'A local HTTP API for Markdown, AI calls, and sync.'],
    ['Vite 构建、Framer Motion 动效、玻璃质感 UI。', 'Built with Vite, Motion, and a layered glass interface.'],
    ['一键推 GitHub，IPFS 永久备份，15+ AI 供应商。', 'Push to GitHub, back up to IPFS, and connect 15+ AI providers.'],
    ['能力细节', 'Capabilities'], ['DailyFlow 还提供什么', 'More of what DailyFlow offers'], ['Timeline 推进记录', 'A timeline of progress'],
    ['每次 AI 输出、任务完成、决策都会留下痕迹。让思考过程可回溯、可审计。', 'AI output, completed tasks, and decisions leave a trail, making the thinking process traceable and auditable.'],
    ['Markdown 为唯一数据源', 'Markdown as the source of truth'], ['本地文件 + YAML frontmatter。你始终拥有自己的数据 — 可用 Git 同步，可读可写。', 'Local files with YAML frontmatter keep your data readable, writable, and ready to sync with Git.'],
    ['15+ AI 供应商', '15+ AI providers'], ['B.AI · DeepSeek · Kimi · GLM · Qwen · Claude · GPT · Gemini · Groq · 自定义 OpenAI 兼容 API。配一个 Key 即可。', 'B.AI · DeepSeek · Kimi · GLM · Qwen · Claude · GPT · Gemini · Groq · custom OpenAI-compatible APIs. Just add a key.'],
    ['本地优先 · 离线可用', 'Local-first · Works offline'], ['数据存于本地 Markdown，', 'Your data stays in local Markdown, with a '], ['，零外部依赖，下载即可使用。', ', so the app is ready to use after download.'],
    ['Git 同步 · IPFS 备份', 'Git sync · IPFS backup'], ['一键提交到 GitHub，侧边栏显示同步状态。通过 Pinata 上传去中心化备份，获得永久 CID。', 'Commit to GitHub in one click and see sync status in the sidebar. Create a decentralized Pinata backup with a permanent CID.'],
    ['自动迁移今日任务', 'Automatic daily rollover'], ['未完成的任务自动滚动到下一天，打开 Today 就能继续，不需要手动复制。', 'Unfinished tasks roll into the next day automatically. Open Today and continue without copying anything.'],
    ['下载并开始使用', 'Download and get started'], ['数据存于本地，应用', 'Your data stays local and the app works '], ['完全离线', 'fully offline'], ['可用。', '.'], ['最新版本：', 'Latest release: '],
    ['macOS 提示：遇到 “damaged” / “cannot be opened” 怎么办？', 'macOS: what if the app is “damaged” or “cannot be opened”?'],
    ['下载后执行一次（需 sudo）：', 'After downloading, run this once (sudo required):'],
    ['这是 Apple 给未签名应用加的隔离属性。DailyFlow 暂时未做 Apple 公证，本地应用请放心解除。', 'This removes Apple’s quarantine attribute for unsigned apps. DailyFlow is not yet notarized by Apple.'],
    ['从源码构建', 'Build from source'], ['需要 Node.js ≥ 20（仅开发）。', 'Node.js 20+ is required for development only.'],
    ['本地优先，专注今天。', 'Local-first. Focused on today.'], ['DailyFlow 是 Apache 2.0 开源项目，欢迎贡献、Star、或反馈。', 'DailyFlow is open source under Apache 2.0. Contributions, stars, and feedback are welcome.'],
    ['访问 GitHub 仓库', 'Visit the GitHub repository'], ['查看所有版本', 'View all releases']
  ]);

  const META = {
    en: {
      title: 'DailyFlow · Local-first tasks, notes, and AI',
      description: 'DailyFlow is a local-first workspace for tasks, notes, and AI-assisted work. Markdown stays yours, unfinished tasks roll forward, and AI works with your real context.',
      ogDescription: 'A local-first desktop workspace that brings tasks, notes, and AI chat into one focused workflow.'
    },
    zh: {
      title: 'DailyFlow · 本地优先的任务与笔记系统',
      description: 'DailyFlow 是一个本地优先的任务与笔记系统。以 Markdown 为唯一数据源，内置 AI 助手，自动迁移未完成任务，让你专注今天。',
      ogDescription: '本地优先的桌面工作区，把任务、笔记和 AI 对话连成一条专注的工作流。'
    }
  };
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  const requestedLanguage = new URLSearchParams(window.location.search).get('lang');
  let currentLanguage = requestedLanguage === 'zh' || requestedLanguage === 'en'
    ? requestedLanguage
    : (() => { try { return localStorage.getItem('dailyflow_site_language') || 'en'; } catch { return 'en'; } })();
  let lastReleaseData = null;

  const t = (en, zh) => currentLanguage === 'zh' ? zh : en;

  function translateTextNode(node) {
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node) || '';
    const trimmed = source.trim();
    const translated = TEXT.get(trimmed);
    if (!translated) {
      node.nodeValue = source;
      return;
    }
    const leading = source.match(/^\s*/)?.[0] || '';
    const trailing = source.match(/\s*$/)?.[0] || '';
    node.nodeValue = `${leading}${currentLanguage === 'zh' ? trimmed : translated}${trailing}`;
  }

  function applyLanguage(language) {
    currentLanguage = language === 'zh' ? 'zh' : 'en';
    document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('body *:not(script):not(style):not(pre):not(code)').forEach((element) => {
      element.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      });
      if (!originalAttributes.has(element)) {
        originalAttributes.set(element, { alt: element.getAttribute('alt'), title: element.getAttribute('title') });
      }
      const attrs = originalAttributes.get(element);
      ['alt', 'title'].forEach((name) => {
        const source = attrs?.[name];
        if (!source) return;
        const translated = TEXT.get(source);
        element.setAttribute(name, currentLanguage === 'zh' || !translated ? source : translated);
      });
    });

    const meta = META[currentLanguage];
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', meta.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', meta.ogDescription);

    const toggle = document.getElementById('languageToggle');
    if (toggle) {
      toggle.textContent = currentLanguage === 'zh' ? 'English' : '中文';
      const label = currentLanguage === 'zh' ? 'Switch to English' : '切换为中文';
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('title', label);
    }
    try { localStorage.setItem('dailyflow_site_language', currentLanguage); } catch { /* optional persistence */ }
    if (lastReleaseData) renderDownload(lastReleaseData);
  }

  // ---- Platform detection ----
  const ua = navigator.userAgent.toLowerCase();
  const isMac     = /mac/.test(ua);
  const isWin     = /windows/.test(ua);
  const isLinux   = /linux/.test(ua);
  const isAppleSilicon = isMac && /apple/.test(navigator.platform || '');

  // ---- Format helpers ----
  const fmtBytes = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  // ---- Pick asset for current OS ----
  // Tauri release assets naming: DailyFlow_<version>_<arch>.<ext>
  const pickAssets = (assets, version) => {
    const byName = (re) => assets.find(a => re.test(a.name));
    const v = version.replace(/^v/, '');

    return [
      {
        key: 'mac-arm',
        featured: isAppleSilicon || isMac,
        platform: 'macOS',
        sub: 'Apple Silicon · M1/M2/M3/M4',
        icon: macIcon(),
        file: byName(new RegExp(`DailyFlow[_-]?${v}[_-]?aarch64.*\\.dmg`, 'i'))
             || byName(/aarch64.*\.dmg/i)
             || byName(/arm64.*\.dmg/i),
        hint: t('Native Apple Silicon build', 'Apple Silicon 原生构建')
      },
      {
        key: 'mac-intel',
        featured: false,
        platform: 'macOS',
        sub: 'Intel · x86_64',
        icon: macIcon(),
        file: byName(new RegExp(`DailyFlow[_-]?${v}[_-]?x64.*\\.dmg`, 'i'))
             || byName(/x86_64.*\.dmg/i)
             || byName(/intel.*\.dmg/i),
        hint: t('For Intel Macs', 'Intel Mac 用户')
      },
      {
        key: 'win',
        featured: isWin,
        platform: 'Windows',
        sub: 'x64 · Win 10/11',
        icon: winIcon(),
        file: byName(/\.(exe|msi)$/i),
        hint: t('Windows installer', 'Windows 安装包')
      },
      {
        key: 'linux',
        featured: isLinux,
        platform: 'Linux',
        sub: 'AppImage · deb · rpm',
        icon: linuxIcon(),
        file: byName(/\.(AppImage|deb|rpm)$/i),
        hint: t('Linux packages', 'Linux 通用包')
      }
    ];
  };

  // ---- Icons ----
  function macIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.04c-.03-2.97 2.43-4.4 2.54-4.47-1.39-2.03-3.55-2.31-4.31-2.34-1.83-.19-3.59 1.08-4.52 1.08-.94 0-2.37-1.05-3.91-1.02-1.99.03-3.85 1.17-4.87 2.95-2.09 3.62-.53 8.97 1.5 11.91 1 1.44 2.18 3.05 3.71 2.99 1.49-.06 2.05-.96 3.86-.96 1.79 0 2.31.96 3.91.93 1.62-.03 2.64-1.46 3.62-2.91 1.15-1.67 1.62-3.29 1.64-3.37-.04-.02-3.14-1.21-3.17-4.79zM14.04 3.62c.81-1 1.36-2.37 1.21-3.74-1.17.05-2.6.78-3.45 1.77-.75.88-1.42 2.29-1.24 3.62 1.31.1 2.65-.66 3.48-1.65z"/></svg>`;
  }
  function winIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5.5l7.5-1.1V11H3V5.5zM3 12.5h7.5v6.6L3 18V12.5zM12 4.3l9-1.3V11h-9V4.3zM12 12.5h9v7.5l-9-1.3v-6.2z"/></svg>`;
  }
  function linuxIcon() {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-2 0-3 2-3 4 0 1.5.5 2.5.5 4-1.5 1.5-3 4-3 6 0 1.5.5 3 1.5 3.5.8.4 1.7.4 2.5.2.7-.2 1.3-.4 1.5-.4s.8.2 1.5.4c.8.2 1.7.2 2.5-.2 1-.5 1.5-2 1.5-3.5 0-2-1.5-4.5-3-6 0-1.5.5-2.5.5-4 0-2-1-4-3-4z"/><circle cx="10.5" cy="9" r="0.8" fill="currentColor"/><circle cx="13.5" cy="9" r="0.8" fill="currentColor"/></svg>`;
  }
  function downloadIcon() {
    return `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 1.5v8m0 0L4.5 7M7 9.5L9.5 7M2 11.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function arrowIcon() {
    return `<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7h8m0 0L7.5 3.5M11 7L7.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  // ---- Render download cards ----
  function renderDownload(data) {
    const grid = document.getElementById('downloadGrid');
    if (!grid) return;

    lastReleaseData = data;
    const version = (data?.tag_name || data?.name || 'v1.0.1').replace(/^v/, '');
    const displayVersion = data?.tag_name || `v${version}`;
    const date = data?.published_at ? fmtDate(data.published_at) : '';
    const assets = Array.isArray(data?.assets) ? data.assets : [];

    // Update header bits
    const vEl = document.getElementById('latestVersion');
    if (vEl) vEl.textContent = displayVersion;
    const nEl = document.getElementById('navVersion');
    if (nEl) nEl.textContent = version;
    const dEl = document.getElementById('releaseDate');
    if (dEl) dEl.textContent = date ? t(`Released ${date}`, `发布于 ${date}`) : '';

    const items = pickAssets(assets, version);

    grid.innerHTML = items.map(it => {
      const f = it.file;
      const has = !!f;
      const cls = ['dl-card', 'glass', it.featured ? 'featured' : ''].join(' ');
      const attrs = has
        ? `href="${f.browser_download_url}" rel="noopener"`
        : `href="${RELEASE_PAGE}" target="_blank" rel="noopener"`;
      const size = has ? fmtBytes(f.size) : t('View Releases', '查看 Releases');
      const filename = has ? f.name : (it.hint || '—');
      return `
        <a class="${cls}" ${attrs} data-key="${it.key}">
          <div class="dl-platform">
            ${it.icon}
            <div class="dl-platform-info">
              <span>${it.platform}</span>
              <small>${it.sub}</small>
            </div>
          </div>
          <div class="dl-meta" title="${filename}">${filename.length > 32 ? filename.slice(0, 30) + '…' : filename}</div>
          <div class="dl-meta">${size}</div>
          <span class="dl-btn">${downloadIcon()} ${has ? t('Download', '下载') : t('View', '查看')}</span>
        </a>
      `;
    }).join('');

    // Animate in
    requestAnimationFrame(() => {
      grid.querySelectorAll('.dl-card').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(8px)';
        el.style.transition = 'opacity 0.4s var(--ease), transform 0.4s var(--ease)';
        setTimeout(() => {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, 60 + i * 50);
      });
    });
  }

  // ---- Format star count ----
  function fmtStars(n) {
    if (n === undefined || n === null) return '…';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
    return String(n);
  }

  // ---- Render star count ----
  function renderStars(count) {
    const navStar = document.getElementById('navStar');
    const heroStar = document.getElementById('heroStar');
    const text = fmtStars(count);
    if (navStar) navStar.innerHTML = `★ ${text}`;
    if (heroStar) heroStar.innerHTML = `★ ${text}`;
  }

  // ---- Fetch stars ----
  async function loadStars() {
    try {
      const res = await fetch(REPO_API, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderStars(data.stargazers_count);
    } catch (err) {
      console.warn('[DailyFlow] stars fetch failed:', err);
      renderStars(null);
    }
  }

  // ---- Fetch release ----
  async function loadRelease() {
    try {
      const res = await fetch(RELEASE_API, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      renderDownload(data);
    } catch (err) {
      console.warn('[DailyFlow] release fetch failed:', err);
      // Fallback to README-known v1.0.1
      renderDownload({
        tag_name: 'v1.0.1',
        published_at: '2026-06-19',
        assets: []
      });
      const grid = document.getElementById('downloadGrid');
      if (grid) {
        const note = document.createElement('p');
        note.style.cssText = 'grid-column: 1/-1; text-align: center; color: var(--brand-mute); font-size: 13px; margin-top: 12px;';
        note.innerHTML = currentLanguage === 'zh'
          ? `未能从 GitHub 拉取最新版本，请直接前往 <a href="${RELEASE_PAGE}" target="_blank" rel="noopener" style="color: var(--accent); font-weight: 600;">Releases 页面</a> 下载。`
          : `Could not load the latest release from GitHub. Download it directly from the <a href="${RELEASE_PAGE}" target="_blank" rel="noopener" style="color: var(--accent); font-weight: 600;">Releases page</a>.`;
        grid.appendChild(note);
      }
    }
  }

  // ---- Scroll reveal ----
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
  }

  // ---- Smooth anchor + active section ----
  function initAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id && id.length > 1) {
          const target = document.querySelector(id);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });
  }

  // ---- Theme: respect prefers-color-scheme ----
  function initTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (dark) => {
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply(mq.matches);
    mq.addEventListener?.('change', (e) => apply(e.matches));
  }

  // Apply the preferred language while the parser is still blocked by this script,
  // so the first painted frame is already localized.
  applyLanguage(currentLanguage);

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    document.getElementById('languageToggle')?.addEventListener('click', () => {
      applyLanguage(currentLanguage === 'zh' ? 'en' : 'zh');
    });
    initReveal();
    initAnchors();
    loadStars();
    loadRelease();
  });
})();
