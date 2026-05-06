# DailyFlow Git 同步功能使用指南

## 📍 功能位置

Git 同步按钮位于：**侧边栏底部的 "Version Control" 区域**

```
┌─────────────────────────┐
│  DailyFlow              │
│  ├─ Timeline            │
│  ├─ Workspace           │
│  ├─ Categories          │
│  ├─ Projects            │
│  ├─ AI Summary          │
│  └─ Configuration       │
│                         │
│  ┌───────────────────┐  │
│  │ Version Control   │  │ ← 在这里！
│  │ ○ Up to date      │  │
│  │ [Commit to GitHub]│  │
│  └───────────────────┘  │
└─────────────────────────┘
```

---

## 🚀 快速开始（3 步配置）

### 第 1 步：创建 GitHub 仓库

1. 访问 [GitHub](https://github.com)
2. 点击右上角 "+" → "New repository"
3. 输入仓库名称（如 `my-dailyflow-notes`）
4. 选择 **Public** 或 **Private**
5. **不要**勾选 "Initialize this repository with a README"
6. 点击 "Create repository"
7. 复制仓库 URL（如 `https://github.com/username/my-dailyflow-notes`）

### 第 2 步：配置 DailyFlow

1. 打开 DailyFlow 应用
2. 点击侧边栏底部的 **"Configuration"** 按钮
3. 找到 **"GitHub Repository"** 输入框
4. 粘贴你的 GitHub 仓库 URL
5. 点击旁边的 **验证按钮**（GitHub 图标）
6. 看到 ✓ "Repository verified" 后，点击 **"Save Settings"**

### 第 3 步：首次同步

1. 返回主界面
2. 侧边栏底部会显示 **"Uncommitted changes"**（橙色圆点）
3. 点击 **"Commit to GitHub"** 按钮
4. 等待几秒，看到成功提示 ✓
5. 访问你的 GitHub 仓库，查看已同步的笔记！

---

## 💡 使用说明

### 何时同步？

**自动检测更改**：
- 添加/编辑/删除任务时
- 修改笔记内容时
- 侧边栏会显示 "Uncommitted changes"（橙色圆点）

**手动同步**：
- 点击 "Commit to GitHub" 按钮
- 自动提交所有更改并推送到 GitHub

### 同步内容

Git 会同步以下内容：
- ✅ 所有日期的笔记文件（`Daily/YYYY/MM/DD.md`）
- ✅ 项目文件（`Projects/*.md`）
- ✅ 配置文件（`config.json`）

### 提交信息格式

自动生成的提交信息格式：
```
Update daily notes: 2026-05-05 11:30:45
```

---

## 🔧 高级配置

### 配置 Git 用户信息（可选）

如果需要自定义提交者信息：

```bash
cd /path/to/your/workspace
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### 配置 SSH 密钥（推荐）

使用 SSH 可以避免每次推送时输入密码：

1. 生成 SSH 密钥：
```bash
ssh-keygen -t ed25519 -C "your.email@example.com"
```

2. 添加到 GitHub：
   - 复制公钥：`cat ~/.ssh/id_ed25519.pub`
   - 访问 GitHub → Settings → SSH and GPG keys → New SSH key
   - 粘贴公钥并保存

3. 修改仓库 URL 为 SSH 格式：
   - 在 Configuration 中输入：`git@github.com:username/repo.git`

---

## ❓ 常见问题

### Q1: 按钮一直是灰色的？

**原因**：没有未提交的更改

**解决**：
- 修改任务或笔记内容
- 等待几秒，按钮会自动启用

### Q2: 提示 "Push failed: Authentication failed"？

**原因**：GitHub 需要身份验证

**解决方案 1**（推荐）：使用 Personal Access Token
1. 访问 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 点击 "Generate new token (classic)"
3. 勾选 `repo` 权限
4. 生成并复制 token
5. 首次推送时，用户名输入 GitHub 用户名，密码输入 token

**解决方案 2**：使用 SSH（见上方"高级配置"）

### Q3: 提示 "Not a git repository"？

**原因**：工作区未初始化为 Git 仓库

**解决**：
```bash
cd /path/to/your/workspace
git init
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

### Q4: 如何查看同步历史？

访问你的 GitHub 仓库，点击 "Commits" 查看所有同步记录。

### Q5: 可以同步到其他 Git 服务吗？

可以！支持任何 Git 服务（GitLab、Gitee、Bitbucket 等）：
1. 创建仓库并获取 URL
2. 在 Configuration 中输入仓库 URL
3. 配置相应的身份验证

---

## 🎯 最佳实践

### 1. 定期同步
- 每天结束时点击同步
- 或者在完成重要任务后立即同步

### 2. 使用私有仓库
- 如果笔记包含敏感信息，使用 Private 仓库

### 3. 备份策略
- Git 同步是实时备份
- 建议定期下载仓库到本地作为额外备份

### 4. 多设备同步
- 在另一台设备上 clone 仓库
- 配置相同的工作区路径
- 使用 DailyFlow 打开该路径

---

## 🆘 获取帮助

如果遇到问题：

1. **查看控制台日志**：
   - 打开浏览器开发者工具（F12）
   - 查看 Console 标签页的错误信息

2. **检查后端日志**：
   - 查看终端中运行 `npm run dev:all` 的输出

3. **提交 Issue**：
   - 访问 [GitHub Issues](https://github.com/yourusername/dailyflow/issues)
   - 描述问题并附上错误信息

---

## 📚 相关文档

- [Git 基础教程](https://git-scm.com/book/zh/v2)
- [GitHub 文档](https://docs.github.com/zh)
- [DailyFlow README](./README.md)

---

**祝你使用愉快！** 🎉

如有问题，欢迎反馈！
