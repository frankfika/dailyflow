# DailyFlow v0.6.1 Release Notes

## 🎯 主要改进：应用内自动更新体验优化

### 问题背景

用户反馈 DailyFlow 不能像 Codex 或其他 macOS 应用一样在应用内直接更新，需要手动访问官网下载新版本。

经过诊断，发现了两个核心问题：

1. **CI/CD 配置问题**：GitHub Actions 没有生成 `latest.json` 更新清单文件
2. **用户体验问题**：虽然有更新检查功能，但入口隐藏太深，没有主动通知

### 解决方案

#### 1. 修复 CI/CD 配置

**修改文件**: `.github/workflows/release.yml`

**变更**：
- ❌ 移除过时的 `updaterJsonPreferNsis` 和 `updaterJsonKeepUniversal` 参数（仅 Tauri v1 支持）
- ✅ 添加 `updater: true` 参数（Tauri v2 正确配置）

**影响**：
- 下次发布时会自动生成 `latest.json` 到 GitHub Release
- 应用内更新功能正式可用

#### 2. 增加更新通知模态窗口

**新增文件**: `src/components/UpdateNotificationModal.tsx`

**功能特性**：
- 🎯 **主动弹窗通知**：检测到新版本后自动弹出模态窗口
- 📝 **显示更新日志**：展示新版本的 Release Notes
- 📥 **实时下载进度**：显示下载百分比和进度条
- ⏭️ **跳过版本**：用户可选择忽略某个版本的更新
- ⏰ **稍后提醒**：用户可暂时关闭，下次启动再提醒

**用户体验优化**：
- ✅ 应用启动 3 秒后自动检查更新（静默）
- ✅ 检测到更新后立即弹窗通知
- ✅ 一键下载并安装，自动重启应用
- ✅ 全程进度可视化，用户可掌控

#### 3. 增强视觉提示

**修改文件**: `src/App.tsx`

**变更**：
- 设置按钮的更新提示从小圆点改为**蓝色感叹号徽章**
- 徽章更大、更醒目，带白色边框

### 完整更新流程

```
1. 应用启动
   ↓
2. 3 秒后自动检查更新（后台）
   ↓
3. 如果有新版本
   ├─ 自动弹出更新通知模态
   ├─ 设置按钮显示蓝色徽章
   └─ 可选择：立即更新 / 跳过此版本 / 稍后提醒
   ↓
4. 点击"立即更新"
   ├─ 显示下载进度条
   ├─ 下载完成后自动安装
   └─ 重启应用以应用更新
```

### 本地持久化

**localStorage 使用**：
- `dailyflow_skipped_version`: 记录用户跳过的版本号
- 如果用户选择"跳过此版本"，该版本不再弹窗提醒
- 设置按钮的徽章仍然会显示，用户可在设置页面手动检查

### 技术实现

#### 核心 API (src/api/updater.ts)

| 函数 | 功能 |
|------|------|
| `checkForUpdates()` | 检查是否有新版本，返回版本信息和更新日志 |
| `downloadUpdate(onProgress)` | 下载更新，支持进度回调 |
| `relaunchApp()` | 重启应用以应用更新 |

#### 更新通知组件 (UpdateNotificationModal.tsx)

- 使用 Tailwind CSS 实现现代化 UI
- 支持深色模式
- 响应式设计
- 动画流畅

#### 状态管理 (App.tsx)

新增状态：
```typescript
const [showUpdateModal, setShowUpdateModal] = useState(false);
const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
```

### 验证步骤

#### 开发者验证

1. **本地测试**：
   ```bash
   npm run dev
   # 启动后 3 秒会自动检查更新
   ```

2. **发布新版本**：
   ```bash
   npm run bump 0.6.1
   git commit -am "chore: bump version to 0.6.1"
   git tag v0.6.1
   git push && git push --tags
   ```

3. **验证 GitHub Release**：
   - 访问 https://github.com/frankfika/dailyflow/releases/latest
   - 确认存在 `latest.json` 文件
   - 下载并查看内容：
     ```bash
     curl -L https://github.com/frankfika/dailyflow/releases/latest/download/latest.json
     ```

4. **测试更新流程**：
   - 运行旧版本应用
   - 等待更新通知弹窗
   - 点击"立即更新"
   - 观察下载进度
   - 确认自动重启

#### 用户验证

1. **自动通知**：
   - 启动应用后 3 秒内会看到更新通知（如果有新版本）
   - 模态窗口显示新版本号和更新日志

2. **手动检查**：
   - 点击设置按钮（右上角）
   - 切换到 "About" 标签
   - 点击 "Check for Updates" 按钮

3. **更新选项**：
   - **Update Now**：立即下载并安装
   - **Skip This Version**：不再提醒此版本
   - **Remind Me Later**：关闭窗口，下次启动再提醒

### 相关文件

| 文件 | 说明 |
|------|------|
| `.github/workflows/release.yml` | CI/CD 配置，生成 `latest.json` |
| `src/api/updater.ts` | 更新 API 封装 |
| `src/components/UpdateNotificationModal.tsx` | 更新通知模态组件 |
| `src/App.tsx` | 集成更新检查和通知逻辑 |
| `src-tauri/tauri.conf.json` | Tauri updater 配置 |

### 与 Codex 等应用的对比

| 特性 | DailyFlow (v0.6.1+) | Codex / VS Code |
|------|---------------------|-----------------|
| 自动检查更新 | ✅ | ✅ |
| 主动弹窗通知 | ✅ | ✅ |
| 显示更新日志 | ✅ | ✅ |
| 实时下载进度 | ✅ | ✅ |
| 跳过版本 | ✅ | ✅ |
| 代码签名验证 | ✅ | ✅ |
| 自动重启应用 | ✅ | ✅ |

**结论**：DailyFlow 现在具备与 Codex、VS Code 等应用相同的更新体验。

### 已知限制

1. **macOS Gatekeeper**：
   - 应用未公证（notarized），首次打开需右键选择"打开"
   - 更新后的版本同样需要此操作

2. **网络要求**：
   - 更新文件托管在 GitHub Releases
   - 需要稳定的网络连接
   - 国内用户可能需要代理

3. **存储空间**：
   - 更新过程需要额外的磁盘空间（约 4MB）
   - 旧版本会被自动替换

### 未来优化

- [ ] 增加国内镜像支持（如 Gitee、腾讯云）
- [ ] 支持差量更新（减少下载大小）
- [ ] 自动公证 macOS 应用
- [ ] 增加更新失败时的回退机制

### 致谢

感谢用户反馈，让我们发现并修复了更新机制的问题！

---

**发布日期**: 2026-06-02  
**版本**: v0.6.1  
**作者**: DailyFlow Team
