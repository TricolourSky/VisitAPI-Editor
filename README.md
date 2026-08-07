# VisitAPI Editor

> 给 [VisitAPI](https://github.com/) 商人对话框架配套的可视化剧本编辑器 · SPT 4.1.1
> A visual script editor for the VisitAPI trader-dialogue framework · SPT 4.1.1

**[中文](#中文) · [English](#english)**

---

## 中文

让**不写代码的人**也能给 SPT 商人写剧情。打开 `.dlg` 剧本，一边写台词一边看到它在游戏对话框里长什么样，
顺手接背景图、视频、语音、BGM，右边实时画出整张分支流程图。

### 它长什么样

一个本地网页应用：双击 exe → 自己起一个只监听 `127.0.0.1` 的小服务 → 自动打开浏览器。
没有安装程序，没有依赖，**一个 300 KB 的 exe 就是全部**。

```
侧脊 · 数据头 · 左视口 / 右流程 · 遥测条
```

- **实时预览** — 背景（PNG/JPG/MP4/WebM）+ 塔科夫原生版式的对话框，点选项就能走分支
- **流程图** — 自动分层布局，一眼看清 35 个节点怎么连；断链会标红
- **章节索引条** — 每条独立故事线一根刻度，点一下跳过去
- **分拍编辑** — 一个节点里的多段旁白各自独立，能配各自的背景和语音
- **音频** — BGM（节点级）与语音（每拍），选择时可直接试听
- **保注释保行序** — 保存不会把你写的注释和排版洗掉（见下方「回写保真」）
- 深浅双主题、中英双语

### 安装与使用

1. 从 [Releases](../../releases) 下载 `VisitAPI.Editor.exe`
2. **放进 EFT 根目录**（和 `EscapeFromTarkov.exe` 同级），双击
3. 浏览器自动打开；剧本从 `<EFT>\BepInEx\config\VisitAPI\` 里挑

放别的地方也行，第一次会让你指一下 `.dlg` 所在目录，之后记住。

**需要 .NET 10 桌面运行时 + ASP.NET Core 10。** 装了 SPT 就已经有了——
SPT 服务端自己的 `runtimeconfig.json` 就依赖这两个，所以这里不额外要求任何东西。

### 素材放哪

跟插件读的是同两个目录，所以编辑器里能选的，游戏里一定找得到：

| 类型 | 目录 | 格式 |
|---|---|---|
| 背景 | `<EFT>\BepInEx\config\VisitAPI\backgrounds\` | `.png` `.jpg` `.webp` `.gif` `.bmp` `.mp4` `.webm` |
| 音频 | `<EFT>\BepInEx\config\VisitAPI\audio\` | `.ogg` `.mp3` `.wav` |

### 回写保真

编辑器保存时**不会重排你的文件**：

- 文件头按原顺序重放，**注释原文照抄**
- 节点体里的注释挂在它后面那个元素上，一个字不丢
- 触发器行**原文保留**（坐标是 `float`，重新格式化会把手填的 `0.09` 印成 `0.090000003576`）
- 任务别名反查回原名，不会把 `quest sora = 5043…` 下面全变成裸 ID
- 解析不了的行降级成原文保留，绝不假装能重新生成

实测：一份 179 行的真实剧本，打开→立刻保存，**177 行逐字节一致**，
唯二两处是原文件行尾多打的空格被去掉了。

覆盖前还会自动留一份 `.bak`。

### 安全

这是一个能读写你硬盘的本地服务，所以：

- **只绑 `127.0.0.1`**，绝不绑 `0.0.0.0`
- 端口每次启动**动态分配**
- 每次启动生成**随机令牌**注入页面，所有接口都要验；别的网页跨域读不到我们的页面，就拿不到令牌
- 所有路径**必须落在工作区内**，`..` 穿越一律拒绝
- 只服务白名单内的媒体类型

### 从源码构建

```powershell
git clone <this-repo>
cd "VisitAPI Editor"
.\build.ps1              # 产出 dist\VisitAPI.Editor.exe
```

或者手动：

```powershell
dotnet publish src\VisitAPI.Server\VisitAPI.Server.csproj -c Release
```

需要 [.NET 10 SDK](https://dotnet.microsoft.com/download)。产出是**单文件、不自带运行时**的 exe。

### 项目结构

```
src/
├─ VisitAPI.Dlg/      .dlg 解析与回写（netstandard2.0）—— 插件也用这份源码
├─ VisitAPI.Server/   自托管服务端 + 界面（界面整包嵌进 exe）
└─ VisitAPI.Quests/   SPT 任务模型（占位，尚未动工）
```

**`VisitAPI.Dlg` 是和插件共用的**。插件（net472，跑在 Unity 的 Mono 里）通过 csproj 的
`<Compile Include="...">` 直接链这份源码，而不是引用 DLL——这样插件保持单文件发布，
且两边永远不可能出现"编辑器预览正常、进游戏不对"的解析分歧。

### 路线图

- [x] 打开 / 编辑 / 保存 `.dlg`，保注释保行序
- [x] 实时预览 + 分支流程图
- [x] 背景（图 / 视频）、音频（BGM / 语音）
- [ ] SPT 任务编辑器（做完后剧本里的任务 ID 可自动回填）
- [ ] BOT 服装替换
- [ ] 章节剧情

---

## English

A visual script editor for **VisitAPI**, a trader-dialogue framework for SPT 4.1.1.
It lets people who don't write code author trader storylines: edit a `.dlg` script while seeing
exactly how it will look in Tarkov's dialogue box, wire up backgrounds, video, voice lines and music,
and read the whole branching structure as a flow graph.

### What it is

A local web app. Double-click the exe → it starts a tiny server bound to `127.0.0.1` only →
your browser opens. No installer, no dependencies — **a single 300 KB exe is the whole thing**.

- **Live preview** — backgrounds (PNG/JPG/MP4/WebM) behind Tarkov's native dialogue layout; click options to walk branches
- **Flow graph** — auto-layout by depth, broken links highlighted
- **Chapter rail** — one tick per independent story thread, click to jump
- **Beat editing** — multiple narration beats per node, each with its own background and voice
- **Audio** — music (per node) and voice (per beat), with preview
- **Faithful round-trip** — saving does not reformat your file or eat your comments (see below)
- Dark/light themes, English/Chinese UI

### Install

1. Grab `VisitAPI.Editor.exe` from [Releases](../../releases)
2. **Drop it in your EFT root** (next to `EscapeFromTarkov.exe`) and run it
3. Scripts are picked from `<EFT>\BepInEx\config\VisitAPI\`

Anywhere else works too — it asks for the folder once, then remembers.

**Requires the .NET 10 runtime + ASP.NET Core 10.** If you have SPT, you already have both:
SPT's own server `runtimeconfig.json` depends on exactly these, so this tool adds no new prerequisites.

### Asset folders

The editor reads the same two folders the plugin does, so anything you can pick here will resolve in game:

| Kind | Folder | Formats |
|---|---|---|
| Backgrounds | `<EFT>\BepInEx\config\VisitAPI\backgrounds\` | `.png` `.jpg` `.webp` `.gif` `.bmp` `.mp4` `.webm` |
| Audio | `<EFT>\BepInEx\config\VisitAPI\audio\` | `.ogg` `.mp3` `.wav` |

### Faithful round-trip

Saving does not rewrite your file:

- The header is replayed in its original order, **comments copied verbatim**
- Comments inside a node attach to the element that follows them — nothing is lost
- Trigger lines are **kept as written** (coordinates are `float`; re-formatting would turn a hand-typed `0.09` into `0.090000003576`)
- Quest aliases are mapped back to their names instead of bare IDs
- Anything the parser can't understand is preserved verbatim rather than regenerated

Measured: a real 179-line script, opened and immediately saved, comes back **177 lines byte-identical** —
the only two differences are trailing spaces the original had.

A `.bak` is written before every overwrite.

### Security

This is a local service that can read and write your disk, so:

- Binds **`127.0.0.1` only**, never `0.0.0.0`
- Port is chosen dynamically at startup
- A **random per-run token** is injected into the page and required by every API call — other sites can't
  read our page cross-origin, so they can't obtain it
- Every path must resolve **inside the workspace**; `..` traversal is rejected
- Only whitelisted media types are served

### Build from source

```powershell
git clone <this-repo>
cd "VisitAPI Editor"
.\build.ps1              # produces dist\VisitAPI.Editor.exe
```

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download). Output is a single-file,
framework-dependent executable.

### Layout

```
src/
├─ VisitAPI.Dlg/      .dlg parsing and writing (netstandard2.0) — shared with the plugin
├─ VisitAPI.Server/   self-hosted server + UI (UI is embedded in the exe)
└─ VisitAPI.Quests/   SPT quest models (placeholder, not started)
```

`VisitAPI.Dlg` is **shared with the game plugin**. The plugin (net472, running under Unity's Mono)
links these sources directly via `<Compile Include="...">` instead of referencing a DLL, so it stays
a single-file plugin and the two sides can never disagree about what a script means.

---

## License

See [LICENSE](LICENSE).
