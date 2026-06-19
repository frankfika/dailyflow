# DailyFlow v1.0.0 上线前最终检测评估报告

> 检测时间：2026-06-19  
> 项目：DailyFlow（本地优先任务与思考管理桌面应用）  
> 技术栈：Tauri 2 + React 19 + TypeScript + Express + Tailwind CSS 4

---

## 一、检测概览

| 检测项 | 状态 | 说明 |
|--------|------|------|
| TypeScript 类型检查 | ✅ 通过 | `tsc --noEmit` 0 错误 |
| 单元测试（149 个） | ✅ 通过 | 16 个测试文件全部通过 |
| 前端生产构建 | ✅ 通过 | Vite 构建成功，858KB JS + 89KB CSS |
| 后端生产构建 | ✅ 通过 | esbuild 1.3MB + Node 运行时 bundled |
| Linux 产物 | ✅ 正常 | AppImage / deb / rpm 已上传 |
| macOS Apple Silicon | ✅ 正常 | DMG + app.tar.gz 已上传 |
| **macOS Intel** | ❌ **缺失** | CI 未配置 x64 构建 |
| **Windows 产物** | ❌ **完全缺失** | Release workflow 中 Windows job 失败 |
| 依赖安全扫描 | ⚠️ 未执行 | 镜像源不支持 `npm audit` |
| Git 状态 | ⚠️ 有变更 | `src-tauri/Cargo.lock` 未提交 |

---

## 二、🔴 严重阻塞问题（必须修复后方可上线）

### 1. Windows 端构建完全失败 — 产物缺失

**现状**：GitHub Release v1.0.0 中完全没有 Windows 安装包（`.exe` / `.msi`）。README 明确宣传支持 Windows，但用户无法下载。

**根本原因**：`src-tauri/src/server.rs` 第 2 行存在 Unix-only 的导入：

```rust
use std::os::unix::fs::PermissionsExt;  // ❌ 未用 #[cfg(unix)] 包裹
```

该模块在 Windows 上不存在，导致 `cargo build` 编译失败。`PermissionsExt` 仅在 `ensure_executable` 函数中使用（该函数已有 `#[cfg(unix)]`），但顶层的 `use` 语句没有条件编译保护。

**修复方案**：

```rust
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
```

**影响**：修复后需重新触发 Release workflow，Windows 端产物方可生成。

---

### 2. macOS Intel (x64) 端缺失

**现状**：CI (`release.yml`) 只配置了 `macos-14` + `aarch64-apple-darwin`（Apple Silicon），没有配置 Intel Mac 的 `x86_64-apple-darwin` 构建。README 却宣称支持 Intel Mac。

**修复方案**：在 `release.yml` 的 matrix 中添加：

```yaml
- name: macOS Intel
  os: macos-13
  target: x86_64-apple-darwin
  args: --target x86_64-apple-darwin
```

---

### 3. Cargo.lock 未提交

**现状**：`git status` 显示 `M src-tauri/Cargo.lock` 有未提交的变更。Rust 项目的 `Cargo.lock` 必须版本控制，否则不同构建环境可能产生不一致的依赖解析。

**修复方案**：`git add src-tauri/Cargo.lock && git commit -m "chore: update Cargo.lock for v1.0.0"`

---

### 4. 应用内更新（Updater）可能不工作

**现状**：`tauri.conf.json` 中配置了 `includeUpdaterJson: true`，但 Release v1.0.0 的 assets 中没有 `latest.json` 文件。`tauri-action` 的 `includeUpdaterJson` 需要 `TAURI_SIGNING_PRIVATE_KEY` 正确配置且签名成功才能生成。

**修复方案**：检查 Release workflow 日志中的签名步骤，确认 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets 是否正确设置。或者暂时移除 README 中"应用内更新"的宣传，改为手动下载更新。

---

## 三、🟡 中等问题（建议修复，提升质量）

### 5. CSP 安全策略为 null

**现状**：`tauri.conf.json` 中 `"csp": null`，表示未设置 Content Security Policy。WebView 中的 XSS 攻击可能通过恶意 Markdown 内容或 AI 返回的 HTML 执行恶意脚本。

**建议配置**：

```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.github.com https://api.pinata.cloud https://*;"
}
```

---

### 6. 前端 JS Bundle 体积过大

**现状**：`dist/assets/index-BbXcgUAc.js` 858KB（gzip 250KB），超过 Vite 默认 500KB 警告阈值。首屏加载时间可能较长，尤其是低端设备。

**建议**：使用 `build.rollupOptions.output.manualChunks` 进行代码拆分，将 React 生态、Motion、Markdown 解析器等拆分为独立 chunk。

---

### 7. UI 警告：`whileHover` prop 误用

**现状**：测试中出现 `React does not recognize the whileHover prop on a DOM element` 警告。在 `App.tsx:1576`、`NoteCard.tsx:142`、`AIWorkflow.tsx:182` 中，`whileHover` 被用在了非 `motion` 组件的原生 DOM 元素上。

**建议**：将对应的 HTML 元素替换为 `motion.div` 或移除 `whileHover` 动画。

---

### 8. 测试 mock 不完整

**现状**：`AIChat.test.tsx` 中 `vi.mock` 缺少 `sortSkillsByUsage` 导出，导致测试运行时有 stderr 警告。虽然测试本身通过，但会影响 CI 日志的可读性。

**建议**：在对应的 mock 文件中添加 `sortSkillsByUsage: vi.fn()`。

---

## 四、✅ 通过检测项

| 项目 | 结果 |
|------|------|
| TypeScript 严格模式 | 0 错误，通过 |
| Vitest 单元测试 | 149/149 通过，覆盖率良好 |
| Vite 生产构建 | 成功，生成 dist/ |
| esbuild 后端构建 | 成功，生成 dist-server/index.cjs + node 运行时 |
| Tauri 图标文件 | 齐全（.icns / .ico / .png 各尺寸） |
| Linux 产物 | AppImage (114MB) / deb (40MB) / rpm (40MB) 已上传 |
| macOS Apple Silicon | DMG (34MB) + app.tar.gz (34MB) 已上传 |
| Rust 发布优化 | `lto=true`, `opt-level=3`, `strip=true` 配置良好 |
| 后端 Node 运行时打包 | `bundle-node.mjs` 支持 darwin/linux/win32 全平台 |
| 版本号一致性 | `package.json` / `tauri.conf.json` / `Cargo.toml` 均为 `1.0.0` ✅ |

---

## 五、上线建议

### 必须完成（🔴 阻塞项）

1. **立即修复 `server.rs` 的 `#[cfg(unix)]` 导入**，提交后重新触发 Release workflow
2. **提交 `Cargo.lock`** 到版本控制
3. **确认 `TAURI_SIGNING_PRIVATE_KEY` secrets 是否配置**，否则移除 updater 功能或手动处理更新
4. **重新触发 Release workflow**，验证 Windows 产物成功生成
5. **可选**：添加 macOS Intel 构建配置，扩大用户覆盖

### 建议完成（🟡 质量项）

6. 配置 CSP 安全策略
7. 前端代码拆分，减小 bundle 体积
8. 修复 `whileHover` 和测试 mock 警告

### 当前结论

**❌ 不建议立即上线。** Windows 端完全缺失是致命问题，对于宣称"全平台支持"的桌面应用而言，这是不可接受的。修复 `server.rs` 的编译问题并重新构建 Windows 产物后，方可上线。

---

*报告生成：DailyFlow v1.0.0 上线前检测*
