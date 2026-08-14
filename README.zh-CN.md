# VisitAPI Editor

> SPT 4.1.1 的可视化编辑器 —— 剧本 · 任务 · BOT 服装 · 商人货架

**中文** · [English](README.md)

---

让**不写代码的人**也能给 SPT 商人做内容。

| | |
|---|---|
| **对话编辑** | 打开 `.dlg` 剧本，一边写台词一边看到它在游戏对话框里长什么样——背景图、视频、语音、BGM 都能接，右边实时画出整张分支流程图。配合 VisitAPI 商人对话框架使用。 |
| **任务编辑** | 做的是标准 SPT 任务文件，**不依赖 VisitAPI**。目标、奖励、失败分支、邮件全都能改；物品/地图/商人清单直接读游戏自带数据，不用背 24 位 id。 |
| **BOT 服装** | 把你模组做的衣服穿到任意 SPT bot 类型上。「只换上装不换手 → 进游戏露出中空手臂」保存前就拦住。 |
| **商人售卖** | 在 1:1 照搬的塔科夫货架上摆你要卖的东西，并把服务端从来不报的错指出来——弹药盒卖成空盒、商品有价格却没解锁等级。 |
| **还原备份** | 每次覆盖都会留一份 `.bak`，这一页负责把它换回去。 |

对话和任务之间连着：任务能挂到「玩家点哪句话才接到它」的那个选项上，点一下就在两边跳转。

## 安装

1. 从 [Releases](../../releases) 下载 `VisitAPI.Editor.exe`
2. 放进 EFT 根目录（和 `EscapeFromTarkov.exe` 同级），双击
3. 浏览器自动打开——那就是编辑器

放别的地方也行，第一次会让你指一下目录，之后记住。

**需要 .NET 10 + ASP.NET Core 10 运行时**——装了 SPT 就已经有了。
只监听 `127.0.0.1`，每个请求都要带本次运行的随机令牌，不对局域网暴露任何东西。

## 东西放哪

| | |
|---|---|
| 剧本 | `<EFT>\BepInEx\config\VisitAPI\*.dlg` |
| 背景 · 音频 | `…\VisitAPI\backgrounds\` · `…\VisitAPI\audio\` |
| 任务 | 任意模组的 `db\quests\` + `db\locales\`，存哪由你定 |
| BOT 服装 · 商人货架 | 任意模组的 `db\`（WTT 那套约定） |

有一件事得说清：**SPT 不会自动加载任意目录下的任务**，它们必须存在一个**会去读它**的模组下面。
编辑器启动时会扫你的模组，把候选列出来让你挑。

覆盖前都会自动留一份 `.bak`；保存不会重排你的文件、不会吃掉你写的注释、也不会把空行压扁。

## 从源码构建

```powershell
.\build.ps1              # 产出 publish\VisitAPI.Editor.exe
.\tests\run-all.ps1      # 986 项回归测试
```

需要 [.NET 10 SDK](https://dotnet.microsoft.com/download)。产出是单文件、不自带运行时的 exe。
内部怎么搭的见 [docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md)。

## License

[MIT](LICENSE) · © 2026 TricolourSky
