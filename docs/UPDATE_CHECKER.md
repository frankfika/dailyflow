# 应用内更新检测功能 / In-App Update Checker

## 功能概述 / Overview

DailyFlow 现在支持应用内自动检测更新，无需手动访问 GitHub Releases 页面查找新版本。

DailyFlow now supports in-app automatic update detection, eliminating the need to manually visit the GitHub Releases page.

## 功能特性 / Features

### 1. 自动检测 / Auto-Detection

- 应用启动后 3 秒自动检查 GitHub Releases 的最新版本
- Auto-checks GitHub Releases for the latest version 3 seconds after app launch

### 2. 顶部横幅提示 / Top Banner Notification

当检测到新版本时，会在应用顶部显示蓝色横幅提示：
- 显示当前版本和最新版本号
- 一键跳转到下载页面
- 可手动关闭横幅

When a new version is detected, a blue banner appears at the top:
- Shows current and latest version numbers
- One-click jump to download page
- Can be manually dismissed

### 3. 设置页面手动检查 / Manual Check in Settings

在设置页面的"通用"标签中：
- 点击"检查更新"按钮手动检查
- 显示当前版本和最新版本对比
- 如果有更新，显示下载按钮
- 如果已是最新版本，显示绿色提示

In the "General" tab of Settings:
- Click "Check for Updates" button for manual check
- Shows current vs. latest version comparison
- If update available, shows download button
- If up-to-date, shows green confirmation

### 4. 智能平台识别 / Smart Platform Detection

根据当前操作系统自动推荐对应的安装包：
- macOS: `.dmg` 或 `.app.tar.gz`
- Windows: `.msi` 或 `.exe`
- Linux: `.AppImage` 或 `.deb`

Automatically recommends the appropriate installer based on your OS:
- macOS: `.dmg` or `.app.tar.gz`
- Windows: `.msi` or `.exe`
- Linux: `.AppImage` or `.deb`

## 技术实现 / Technical Implementation

### 版本比较算法 / Version Comparison

使用语义化版本号比较（Semantic Versioning）：
```
0.3.0 > 0.2.0
1.0.0 > 0.9.9
```

### API 调用 / API Calls

使用 GitHub REST API v3：
```
GET https://api.github.com/repos/frankfika/dailyflow/releases/latest
```

### 文件结构 / File Structure

```
src/
├── api/
│   └── updater.ts          # 更新检测核心逻辑
├── components/
│   └── SettingsModal.tsx   # 设置页面集成
└── App.tsx                 # 主应用集成（横幅提示）
```

## 使用方法 / Usage

### 查看更新提示 / View Update Notification

1. 启动应用后等待 3 秒
2. 如果有新版本，顶部会显示蓝色横幅
3. 点击"下载"按钮跳转到 GitHub Releases

1. Wait 3 seconds after app launch
2. If a new version is available, a blue banner appears at the top
3. Click "Download" button to jump to GitHub Releases

### 手动检查更新 / Manual Update Check

1. 点击右上角设置图标
2. 在"通用"标签中找到"应用更新"部分
3. 点击"检查更新"按钮
4. 查看版本信息和下载链接

1. Click the settings icon in the top right
2. Find "App Update" section in the "General" tab
3. Click "Check for Updates" button
4. View version info and download link

## 配置 / Configuration

### 修改仓库地址 / Change Repository

如果你 fork 了这个项目，需要修改 `src/api/updater.ts` 中的仓库地址：

If you forked this project, update the repository in `src/api/updater.ts`:

```typescript
const GITHUB_REPO = 'your-username/your-repo-name';
```

### 修改当前版本 / Update Current Version

当前版本号从 `package.json` 同步，发布新版本时记得更新：

Current version syncs from `package.json`, remember to update when releasing:

```json
{
  "version": "0.3.0"
}
```

## 注意事项 / Notes

1. **网络要求** / Network Required: 需要能访问 GitHub API（国内可能需要代理）
2. **频率限制** / Rate Limit: GitHub API 有频率限制（未认证：60次/小时）
3. **隐私** / Privacy: 仅检查版本号，不收集任何用户数据
4. **离线模式** / Offline: 如果无法连接 GitHub，会静默失败，不影响应用使用

## 未来改进 / Future Improvements

- [ ] 支持自动下载和安装更新
- [ ] 显示更新日志（Release Notes）
- [ ] 支持跳过特定版本
- [ ] 添加更新检查频率设置

- [ ] Support automatic download and installation
- [ ] Display release notes
- [ ] Support skipping specific versions
- [ ] Add update check frequency settings
