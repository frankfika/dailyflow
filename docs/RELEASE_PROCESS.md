# DailyFlow 版本发布流程

DailyFlow 使用 Release Please + GitHub Actions 管理版本。日常开发不再手动修改版本号、创建 Tag 或创建 GitHub Release。

## 自动发布流程

1. 功能或修复 PR 合并到 `main`。
2. Release Please 自动创建或更新一个 Release PR。
3. Release PR 自动汇总变更，并同步更新：
   - `CHANGELOG.md`
   - `package.json` 与 `package-lock.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock`
   - `.release-please-manifest.json`
4. 确认 Release PR 的 CI 通过后，将其合并。
5. Release Please 自动创建语义化版本 Tag 和 GitHub Release。
6. 同一个 Release workflow 自动构建并上传：
   - macOS Apple Silicon
   - macOS Intel
   - Windows x64
   - Linux x64

发布通常需要 10–20 分钟。进度可在仓库的 Actions 和 Releases 页面查看。

## 如何决定版本号

Release Please 根据 Conventional Commits 自动选择版本：

| 合并提交或 PR 标题                   | 版本变化       | 示例          |
| ------------------------------------ | -------------- | ------------- |
| `fix:`                               | Patch          | 1.4.1 → 1.4.2 |
| `feat:`                              | Minor          | 1.4.1 → 1.5.0 |
| `feat!:` 或正文含 `BREAKING CHANGE:` | Major          | 1.4.1 → 2.0.0 |
| `docs:`、`test:`、`ci:`、`chore:`    | 默认不单独发版 | —             |

推荐使用 Squash merge，并让 PR 标题采用以下格式：

```text
feat: add calendar week view
fix: prevent mind map autosave conflicts
docs: clarify local setup
```

## 日常发布操作

开发者只需要：

1. 合并正常的功能或修复 PR。
2. 等待机器人更新 Release PR。
3. 需要发版时，检查并合并 Release PR。

不要在普通开发 PR 中手动修改版本文件，也不要重复创建相同版本的 Tag。

## 应急手动发布

自动流程不可用时，可以从 Actions 页面手动运行 `Release` workflow，并填写一个已经存在、且版本文件已同步的 Tag，例如 `v1.4.2`。

应急发布前必须确认以下命令通过：

```bash
npm run lint
npm test
npm run build
npm run check:version
cargo check --manifest-path src-tauri/Cargo.toml
```

## 发布验证

每次正式发布需确认：

- Release workflow 的四个平台任务全部成功。
- GitHub Release 不是 Draft 或 Prerelease（除非本次明确发布测试版）。
- macOS、Windows、Linux 安装文件均已上传。
- `main`、版本 Tag 与 Release PR 中的版本号一致。

## 配置文件

- `release-please-config.json`：版本规则与需要同步的文件。
- `.release-please-manifest.json`：记录最近一次自动发布版本。
- `.github/workflows/release.yml`：Release PR、Tag、GitHub Release 和多平台构建。

## 相关文档

- [Release Please](https://github.com/googleapis/release-please)
- [语义化版本规范](https://semver.org/lang/zh-CN/)
- [GitHub Releases 文档](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Tauri 发布指南](https://v2.tauri.app/distribute/)
