# DailyFlow 版本发布流程

本文档描述 DailyFlow 项目的完整版本发布流程。

## 版本号规范

遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)：

- **主版本号 (Major)**: 不兼容的 API 修改 (1.0.0 → 2.0.0)
- **次版本号 (Minor)**: 向下兼容的功能性新增 (0.3.0 → 0.4.0)
- **修订号 (Patch)**: 向下兼容的问题修正 (0.3.0 → 0.3.1)

### 示例

| 变更类型 | 版本升级 | 示例 |
|---------|---------|------|
| 新增 Tags 视图功能 | Minor | 0.3.0 → 0.4.0 |
| 修复任务迁移 bug | Patch | 0.3.0 → 0.3.1 |
| 重构 API（破坏性） | Major | 0.9.0 → 1.0.0 |

## 完整发布流程

### 前置条件

- ✅ 所有新功能已开发完成并测试
- ✅ 代码已推送到 main 分支
- ✅ TypeScript 编译通过 (`npm run lint`)
- ✅ 单元测试通过 (`npm test`)
- ✅ 构建成功 (`npm run build`)

### 步骤 1: 升级版本号

使用项目提供的 bump 脚本：

```bash
# 升级到指定版本
npm run bump X.Y.Z

# 例如：升级到 0.4.0
npm run bump 0.4.0
```

这会自动更新：
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

### 步骤 2: 手动更新其他文件

**必须手动更新以下文件：**

1. **src/api/updater.ts**
   ```typescript
   const CURRENT_VERSION = '0.4.0'; // 更新这里
   ```

2. **README.md**（中英双语，版本 badge）
   ```markdown
   ![Version](https://img.shields.io/badge/Version-0.4.0-blue?style=flat-square)
   ```

### 步骤 3: 提交版本变更

```bash
# 添加所有变更
git add -A

# 提交（使用标准格式）
git commit -m "chore: bump version to X.Y.Z"

# 推送到远程
git push origin main
```

### 步骤 4: 创建 Git Tag

#### 4.1 删除旧 tag（如果存在）

```bash
# 删除本地 tag
git tag -d vX.Y.Z

# 删除远程 tag
git push origin :refs/tags/vX.Y.Z
```

#### 4.2 创建新 tag

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z: [一句话概括主要功能]

[详细的 Changelog]

Major New Features:
- 功能 1
- 功能 2

Improvements:
- 改进 1
- 改进 2

Technical:
- 技术细节 1
- 技术细节 2

Breaking Changes: [如果有]

Migration: [如果需要迁移]"
```

**Changelog 模板示例：**

```bash
git tag -a v0.4.0 -m "Release v0.4.0: Tags View + In-app Update Checker

Major New Features:

🏷️ Tags View
- Tag-based content organization with aggregation
- Card-based layout with statistics
- Real-time search and filtering
- Context-aware (Work/Life)

🔄 In-app Update Checker
- Auto-detect new versions from GitHub Releases
- Top banner notification
- Manual check in Settings
- Smart platform detection

Improvements:
- Enhanced UX with better component organization
- Better error handling and loading states

Technical:
- TypeScript type safety improvements
- Zero circular dependencies
- 78 unit tests passing (69% coverage)

Breaking Changes: None

Migration: No migration needed"
```

#### 4.3 推送 tag

```bash
git push origin vX.Y.Z
```

### 步骤 5: 验证 GitHub Actions

```bash
# 查看最近的 workflow 运行
gh run list --limit 3

# 查看特定 run 的详情
gh run view <run-id>
```

确认 Release workflow 已触发，正在构建以下平台：
- ✅ Linux x64
- ✅ Windows x64
- ✅ macOS Apple Silicon
- ✅ macOS Intel

### 步骤 6: 等待构建完成

构建通常需要 10-20 分钟。完成后：

1. 访问 [Releases 页面](https://github.com/frankfika/dailyflow/releases)
2. 确认新版本已发布
3. 检查所有平台的安装包是否都已上传
4. 测试下载链接是否正常

## 快速检查清单

发布前检查：

- [ ] 代码已推送到 main
- [ ] TypeScript 编译通过
- [ ] 单元测试通过
- [ ] 构建成功
- [ ] 确定版本号（Major/Minor/Patch）

版本升级：

- [ ] 运行 `npm run bump X.Y.Z`
- [ ] 更新 `src/api/updater.ts`
- [ ] 更新 `README.md`（中英双语版本 badge）
- [ ] 提交并推送

创建 Release：

- [ ] 删除旧 tag（如果需要）
- [ ] 创建新 tag（包含详细 changelog）
- [ ] 推送 tag
- [ ] 验证 GitHub Actions 触发
- [ ] 等待构建完成
- [ ] 验证 Release 发布成功

## 常见问题

### Q: 忘记升级版本号就推送了怎么办？

A: 立即执行版本升级流程，创建新的 commit 和 tag。

### Q: 版本号写错了怎么办？

A: 删除错误的 tag，重新创建正确的 tag：

```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
# 然后重新创建正确的 tag
```

### Q: GitHub Actions 构建失败怎么办？

A: 
1. 查看失败日志：`gh run view <run-id> --log-failed`
2. 修复问题后重新推送
3. 删除旧 tag，创建新 tag 重新触发

### Q: 需要发布 beta 版本怎么办？

A: 使用预发布版本号：

```bash
npm run bump 0.4.0-beta.1
# 创建 tag 时标记为 pre-release
gh release create v0.4.0-beta.1 --prerelease
```

## 自动化改进建议

未来可以考虑：

- [ ] 创建 `release.sh` 脚本自动化整个流程
- [ ] 使用 GitHub Actions 自动创建 Release Notes
- [ ] 集成 Changelog 自动生成工具
- [ ] 添加版本号一致性检查的 CI 步骤

## 相关文档

- [语义化版本规范](https://semver.org/lang/zh-CN/)
- [GitHub Releases 文档](https://docs.github.com/en/repositories/releasing-projects-on-github)
- [Tauri 发布指南](https://tauri.app/v1/guides/distribution/)
