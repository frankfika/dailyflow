/* ===== DailyFlow site interactions ===== */

(() => {
  'use strict';

  const REPO = 'frankfika/dailyflow';
  const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
  const REPO_API = `https://api.github.com/repos/${REPO}`;
  const RELEASE_PAGE = `https://github.com/${REPO}/releases`;
  const REPO_PAGE = `https://github.com/${REPO}`;

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
    return d.toLocaleDateString(navigator.language || 'zh-CN', {
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
        hint: 'Apple Silicon 原生构建'
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
        hint: 'Intel Mac 用户'
      },
      {
        key: 'win',
        featured: isWin,
        platform: 'Windows',
        sub: 'x64 · Win 10/11',
        icon: winIcon(),
        file: byName(/\.(exe|msi)$/i),
        hint: 'Windows 安装包'
      },
      {
        key: 'linux',
        featured: isLinux,
        platform: 'Linux',
        sub: 'AppImage · deb · rpm',
        icon: linuxIcon(),
        file: byName(/\.(AppImage|deb|rpm)$/i),
        hint: 'Linux 通用包'
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
    if (dEl) dEl.textContent = date ? `发布于 ${date}` : '';

    const items = pickAssets(assets, version);

    grid.innerHTML = items.map(it => {
      const f = it.file;
      const has = !!f;
      const cls = ['dl-card', 'glass', it.featured ? 'featured' : ''].join(' ');
      const attrs = has
        ? `href="${f.browser_download_url}" rel="noopener"`
        : `href="${RELEASE_PAGE}" target="_blank" rel="noopener"`;
      const size = has ? fmtBytes(f.size) : '查看 Releases';
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
          <span class="dl-btn">${downloadIcon()} ${has ? '下载' : '查看'}</span>
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
        note.innerHTML = `未能从 GitHub 拉取最新版本，请直接前往 <a href="${RELEASE_PAGE}" target="_blank" rel="noopener" style="color: var(--accent); font-weight: 600;">Releases 页面</a> 下载。`;
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

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initReveal();
    initAnchors();
    loadStars();
    loadRelease();
  });
})();