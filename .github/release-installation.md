<!-- dailyflow-installation-guide -->
## Downloads / 下载

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `DailyFlow_*_aarch64.dmg` |
| macOS (Intel) | `DailyFlow_*_x64.dmg` |
| Windows | `DailyFlow_*_x64-setup.exe` / `DailyFlow_*_x64_en-US.msi` |
| Linux | `DailyFlow_*_amd64.AppImage` / `DailyFlow_*_amd64.deb` |

## 🍎 macOS 安装与安全提示

1. 根据 Mac 芯片下载对应的 DMG，打开后将 DailyFlow 拖入“应用程序”。
2. 当前构建尚未经过 Apple 公证。如果系统提示“DailyFlow 已损坏”或无法验证开发者，请打开“终端”并运行：

   ```bash
   sudo xattr -rd com.apple.quarantine "/Applications/DailyFlow.app"
   ```

3. 回到 Finder 的“应用程序”，右键 DailyFlow，选择“打开”。

详细排查步骤：[macOS 安装问题处理指南](https://github.com/frankfika/dailyflow/blob/main/docs/MACOS_DAMAGED_FIX.md)。

> Download the DMG for your Mac chip and drag DailyFlow into Applications. This build is not notarized yet; if macOS blocks it, run the command above, then right-click the app and choose **Open**.
