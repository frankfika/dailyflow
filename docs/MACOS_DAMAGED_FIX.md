# macOS "damaged" 错误解决方案

## 问题

在 macOS 上打开 DailyFlow 时显示：
```
"DailyFlow" is damaged and can't be opened. You should move it to the Trash.
```

## 原因

这是因为应用**没有经过 Apple 公证**（notarization）。macOS Gatekeeper 会阻止未签名/未公证的应用。

## 解决方案

### 方法 1: 移除隔离属性（推荐）

打开终端，执行以下命令：

```bash
# 移除隔离属性
sudo xattr -rd com.apple.quarantine /Applications/DailyFlow.app

# 或者如果应用在其他位置
sudo xattr -rd com.apple.quarantine /path/to/DailyFlow.app
```

输入密码后，应用就可以正常打开了。

### 方法 2: 通过系统设置允许

1. 尝试打开 DailyFlow
2. 看到 "damaged" 错误后，点击 "Cancel"
3. 打开 **系统设置 → 隐私与安全性**
4. 向下滚动，找到 "仍要打开" 按钮
5. 点击 "打开" 确认

### 方法 3: 右键打开（可能不适用）

1. 在访达中找到 DailyFlow.app
2. 按住 Control 键点击（或右键点击）
3. 选择 "打开"
4. 在弹出的对话框中点击 "打开"

**注意**: 对于 "damaged" 错误，方法 3 可能不起作用，建议使用方法 1。

## 为什么会这样？

DailyFlow 是开源项目，目前没有 Apple Developer 账号进行代码签名和公证。这需要：
- Apple Developer 账号（$99/年）
- 代码签名证书
- 公证流程

## 安全性说明

- ✅ DailyFlow 是开源项目，代码完全透明
- ✅ 可以在 GitHub 上查看所有源代码
- ✅ 构建过程通过 GitHub Actions 自动化
- ✅ 没有恶意代码或后门

移除隔离属性是安全的，因为：
1. 你可以审查源代码
2. 构建过程是公开的
3. 这只是绕过 Gatekeeper 的检查

## 未来计划

考虑以下选项：
- [ ] 申请 Apple Developer 账号进行签名
- [ ] 使用社区��名服务
- [ ] 提供详细的验证指南

## 相关链接

- [Apple 公证文档](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Tauri 代码签名指南](https://tauri.app/v1/guides/distribution/sign-macos)
- [GitHub 源代码](https://github.com/frankfika/dailyflow)
