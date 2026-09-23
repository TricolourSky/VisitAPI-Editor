# VisitAPI Editor

> SPT 4.1.x 的可视化编辑器 —— 剧本 · 章节 · 任务 · BOT 服装 · 商人货架

**中文** · [English](README.md)

---

让**不写代码的人**也能给 SPT 商人做内容。

| | |
|---|---|
| **对话编辑** | 打开 `.dlg` 剧本，一边写台词一边看到它在游戏对话框里长什么样——背景图、视频、语音、BGM 都能接，右边实时画出整张分支流程图。视口上方的语言页签让你把 SPT 的 17 种语言都在原位写好。游戏会当没写的写法，保存前就点名。配合 [VisitAPI](https://github.com/TricolourSky/VisitAPI) 商人对话框架使用。 |
| **章节编辑** | 把若干任务串成剧情页的一章：卡片照 1.1 剧情页的样子摆出来（图标横幅、主要/可选目标、日记、相关物品），直接在上面改；子任务顺序、自动接/自动交、串成链、商人定时联系、多个结局一键搞定。要装 VisitAPI 1.2+（区域、定时联系、多结局要 1.3.3）。 |
| **任务编辑** | 做的是标准 SPT 任务文件，**不依赖 VisitAPI**。目标（含区域到访）、奖励、失败分支、邮件全都能改；物品/地图/商人清单直接读游戏自带数据，不用背 24 位 id。 |
| **BOT 服装** | 把你模组做的衣服穿到任意 SPT bot 类型上。「只换上装不换手 → 进游戏露出中空手臂」保存前就拦住。 |
| **商人售卖** | 在 1:1 照搬的塔科夫货架上摆你要卖的东西，并把服务端从来不报的错指出来——弹药盒卖成空盒、商品有价格却没解锁等级。 |
| **还原备份** | 每次覆盖都会留一份 `.bak`，这一页负责把它换回去。 |

对话和任务之间连着：任务能挂到「玩家点哪句话才接到它」的那个选项上，点一下就在两边跳转。

每个模块第一次打开都会自己带你走一遍——逐步指到真按钮上的引导，只带一次；
想再看在「设置」里点「重看新手引导」。

## 安装

1. 从 [Releases](../../releases) 下载 `VisitAPI.Editor.exe`
   —— [VisitAPI](https://github.com/TricolourSky/VisitAPI) 的发布包根目录里就带着同一份 exe，装过那个包就不用重复下载
2. 放进 EFT 根目录（和 `EscapeFromTarkov.exe` 同级），双击
3. 浏览器自动打开——那就是编辑器

放别的地方也行，第一次会让你指一下目录，之后记住。

**需要 .NET 10 + ASP.NET Core 10 运行时**——装了 SPT 就已经有了。
只监听 `127.0.0.1`，每个请求都要带本次运行的随机令牌，不对局域网暴露任何东西。

编辑器 1.3.3 和 VisitAPI 1.3.3 配套；老版本框架也能打开，只是帮助文字和校验规则按新版走。

## 东西放哪

| | |
|---|---|
| 剧本 | `<EFT>\BepInEx\config\VisitAPI\*.dlg` |
| 背景 · 音频 | `…\VisitAPI\backgrounds\` · `…\VisitAPI\audio\` |
| 任务 | VisitAPI 的**内容包**：`<EFT>\SPT_Runtime\user\mods\VisitAPI-Server\packs\<包名>\`，里面是 `quests\`、`locales\`、`images\banners\`、`images\icons\`（`zones\` 只读、供挑选）；一个包就是一个文件夹，新建任务库就是新建一个包。存到别的模组的 `db\quests\` + `db\locales\` 也行，存哪由你定 |
| BOT 服装 · 商人货架 | 任意模组的 `db\`（WTT 那套约定） |

有一件事得说清：**SPT 不会自动加载任意目录下的任务**，它们必须存在一个**会去读它**的模组下面。
VisitAPI-Server 读自己 `packs\` 下的每一个包；编辑器启动时会扫你的模组，把候选列出来让你挑。

覆盖前都会自动留一份 `.bak`；保存不会重排你的文件、不会吃掉你写的注释、也不会把空行压扁。
没动过的值、编辑器不认识的字段、文件自己的样式，逐字节原样保住。

## 从源码构建

```powershell
.\build.ps1              # 产出 publish\VisitAPI.Editor.exe
```

需要 [.NET 10 SDK](https://dotnet.microsoft.com/download)。产出是单文件、不自带运行时的 exe。

`src\` 下四块：

| | |
|---|---|
| `VisitAPI.Dlg` | `.dlg` 的解析与回写（netstandard2.0） |
| `VisitAPI.Packs` | 什么算一个内容包：文件夹布局、图片路由、版本要求 |
| `VisitAPI.Quests` | 所有碰磁盘文件的东西：任务、内容包、BOT 服装、商人货架，以及它们的校验器 |
| `VisitAPI.Server` | 本地网页服务器和界面，整包嵌进 exe |

`VisitAPI.Dlg` 和 `VisitAPI.Packs` **与游戏插件共用**：[VisitAPI](https://github.com/TricolourSky/VisitAPI)
仓库把它们链源码编进去，并要求本仓库以 `VisitAPI Editor` 为文件夹名与它并列。一份剧本、一个包是什么意思，
只有这一处定义，改它就是改游戏——两边一起重编。

## License

[MIT](LICENSE) · © 2026 TricolourSky
