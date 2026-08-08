# 架构说明

**中文** · [English](ARCHITECTURE.md)

---

给想读代码或改代码的人。

## 一句话

一个 ASP.NET Core 自托管服务端，把一个单页界面端出去；界面在浏览器里跑，
所有文件读写都通过本地接口回到服务端做。

```
浏览器（界面 + .dlg 解析/回写的 JS 实现）
   ↕  HTTP 127.0.0.1，带每次运行随机生成的令牌
服务端（VisitAPI.Server）
   ↕  文件系统，路径锁死在工作区内
<EFT>\BepInEx\config\VisitAPI\   ← 和游戏插件读的是同一个目录
```

## 三个工程

| 工程 | 目标框架 | 做什么 |
|---|---|---|
| `VisitAPI.Dlg` | netstandard2.0 | `.dlg` 的解析与回写。**和游戏插件共用这份源码** |
| `VisitAPI.Server` | net10.0 (Web SDK) | 服务端 + 界面（界面嵌成资源打进 exe） |
| `VisitAPI.Quests` | net10.0 | 任务 / 文案的读写与校验、只读 SPT_Data、任务↔对话的挂接、任务配图 |

### 为什么 `VisitAPI.Dlg` 是 netstandard2.0

它要同时被两边吃下：编辑器是 net10.0，游戏插件是 net472（跑在 Unity 的 Mono 里）。
`netstandard2.0` 是唯一同时被这两个接受的目标；`netstandard2.1` 不支持 net472。

⚠️ `netstandard2.0` 的**默认语言版本是 C# 7.3**，而解析器用了 `= new()`(C#9) 和文件级
namespace(C#10)，所以 csproj 里必须显式写 `<LangVersion>latest</LangVersion>`。

### 插件是"链源码"而不是"引用 DLL"

插件的 csproj 里是：

```xml
<Compile Include="..\..\VisitAPI Editor\src\VisitAPI.Dlg\*.cs" LinkBase="Dialog\Shared" />
```

**这是有意的，别顺手改成 ProjectReference。** 理由：插件是发给玩家的，走引用就变成两个 DLL，
玩家少拷一个就炸；而且 netstandard2.0 程序集跑在 Unity 的 Mono 下要多担一层风险。
链源码零运行时风险，且源码依然只有一份，两边不可能解析不一致。

代价：两个项目目录耦合了（这个目录改名会让插件编不过）。

## 服务端

`Program.cs` 五件事：挑空闲端口、端出界面、心跳、开浏览器、报构建时间。

- **端口**：绑 `:0` 让系统分配，记下号再放掉
- **只绑 `127.0.0.1`**。绝不能绑 `0.0.0.0` —— 那等于把"随便读写你硬盘"开放给整个局域网
- **心跳**：两条路子一起用，谁先满足算谁的
  - 界面每 10 秒 `/api/ping`，**3 分钟**没动静就自杀。这个超时不能按"心跳间隔的几倍"来拍：
    Chromium 系在标签页隐藏满 5 分钟后进入 intensive throttling，把定时器压到**每分钟最多一次**。
    早先这里是 40 秒，于是切去别的标签页十几分钟回来，服务端已经自己退了、页面还开着
  - `pagehide` 发 `/api/bye`，服务端**等 10 秒宽限期，期间有新 ping 就撤销**。
    宽限期就是用来分辨"关闭"和"F5 刷新"的——`pagehide` 按 F5 也会触发，
    早先直接退，结果一刷新服务端就死（踩过）
  - 页面重新可见时会立刻补一发；ping 失败则盖一层"后台已退出"的提示。
    它关不掉自己（不是脚本开的窗，`window.close()` 会被拦），能做的只有把话说清楚
- **`--no-browser`**：不自动开浏览器。自动化测试必须用，否则弹出的标签页会一直替它报到，心跳超时永远测不出来

`Workspace.cs` 两道安全闸：

1. **令牌** —— 每次启动生成随机串注入页面，`/api/*` 全部校验。恶意网页跨域读不到我们的 HTML，
   就拿不到令牌。`<img>`/`<video>` 的 src 带不了自定义头，所以 `/media` 的令牌走查询串
2. **路径牢笼** —— 任何路径都 `Path.GetFullPath` 后检查是否落在工作区内

工作区来源优先级：`--root=` > 自动探测（从 exe 往上找 `BepInEx\config\VisitAPI`）> 上次填过的
（记在 exe 旁边的 `visitapi-editor.txt`，不用浏览器 localStorage —— 清一次数据就没了）。

## 接口

| 接口 | 说明 |
|---|---|
| `GET /` | 界面（会把令牌注入成 `<meta name="tok">`） |
| `GET /api/ping` | 心跳，唯一不验令牌的接口 |
| `POST /api/bye` | 「页面要走了」。开始 10 秒倒计时，期间任何一发 ping 都会撤销它 |
| `POST /api/quit` | 退出 |
| `GET/POST /api/workspace` | 读/设工作区，顺带回构建时间与素材目录是否存在 |
| `GET /api/list?dir=` | 列子目录与剧本文件（`.dlg` 与 `.dlg.demo`） |
| `GET /api/dlg?path=` | 读剧本原文 |
| `POST /api/dlg?path=` | 写剧本。**收的是模型不是文本**，文本由 `DialogWriter` 生成；写前留 `.bak` |
| `POST /api/dlg/render` | 只渲染不落盘（界面「查看 .dlg」用，看到的就是将要写进文件的那份） |
| `GET /api/assets` | `{bg:[], audio:[]}` 两个素材目录的清单 |
| `GET /media?path=&t=` | 素材本体。**开了 Range 处理**，否则浏览器不给播 mp4 |
| `GET /api/quests` | 任务 + 文案 + 商人 + 地图 + 校验 + 指纹 |
| `POST /api/quests` | 按文件写回。带指纹做乐观锁，对不上返回 409 |
| `GET /api/quests/items` | 物品表（4288 件，单独一条，用到才拉） |
| `GET/POST /api/quests/roots` `/root` | 列出/指定任务库位置 |
| `GET /api/quests/links` | 扫全部 `.dlg`，读出任务↔选项的挂接与触发点 |
| `POST /api/quests/link` | 挂上/摘掉一条挂接。**改的是 `.dlg`，走 `DialogWriter`** |
| `POST /api/quests/trader-ok` | 标记「这个商人我认识」（给还没装/没适配的商人 mod 用） |
| `GET /api/quests/images` | 任务配图清单：SPT 自带的那份 + 模组目录里的那份 |
| `GET /qimg?src=&name=&t=` | 配图字节。**不挂在 `/api` 下**——`<img src>` 发不了令牌头，只能像 `/media` 那样走查询串 |

## 两条 SPT 的事实，配图功能全靠它们

两条都是反编译 4.1.1 的 `SPTarkov.Server.Core.dll` 核实出来的，不是推测。哪天 SPT 改了，先坏的就是配图。

1. **`ImageRouteImporter` 只扫 `./SPT_Data/images/`**。那是个私有方法、只有一处写死的调用点，
   所以**模组自己目录里的图不会被伺服**，必须由模组调 `imageRouter.AddRoute(键, 绝对路径)` 注册。
   VisitAPI 服务端会替自己 `images\quest\icon\` 下的图做这件事；选的是别的模组时，编辑器会提醒。
2. **路由键不带扩展名**。注册和查表两边都过 `FileUtil.StripExtension`，它是 `path.Split('.').First()`
   —— 截到**第一个**点，不是最后一个。这就是为什么原版 `quests.json` 写 `.jpg` 而磁盘上是 `.png`
   也能对上，也是为什么 `a.b.png` 这种名字永远匹配不上。编辑器的预览按同样的规则解析
   （所以原版任务的配图能正常显示），选择器里会把带多余点号的名字标出来。

## 回写保真

`.dlg` 是人手写的，回写绝不能把作者的排版和注释洗掉。做法：

- `DialogTree.HeadRaw` 按原顺序记下文件头**每一行**（含注释）；回写时重放：
  注释原文照抄，可编辑的行从模型重新生成
- 节点体里的注释挂到"它后面那个元素"的 `Lead` 上（节点/旁白/台词/选项/跳转各一份，加节点尾 `Tail`）
- `DialogTrigger.Raw` 存触发器原文，回写优先照抄
  ⚠️ **将来支持编辑触发器时，改完必须把 `Raw` 置 null**，否则回写吐旧内容
- 别名反查：解析时别名已被换成真 ID，回写要查回去

## 只有一个 writer

**`.dlg` 的文本只由 C# 的 `DialogWriter` 生成。** 界面把模型 POST 给服务端，自己从不拼字符串。

这条是踩出来的，不是洁癖。早先界面里还有一份 JS 的 `toDlg()`，和 C# 版并存，实测它会丢：
节点体里的注释、旁白上的 `anim`、`setstatus` 的状态值、`standing` 的商人 id、
以及同一选项上的第二条门控。两套写实现迟早不一致，而不一致的代价是别人的剧本。

任务 json 走的是同一条原则的另一种形式：**全程 `JsonNode`，只改我们认识的字段。**
不做强类型模型，就是为了不把 SPT 里那些没建模的字段（`arenaLocations` / `gameModes` / …）
在反序列化→序列化的往返中静默丢掉。

### 两处已知的归一化（不是丢数据）

1. `DialogWriter` 在每个节点前统一补一个空行，**空行位置**可能和原文不同（数量不变）
2. `setstatus: x=AvailableForFinish` 会写成 `setstatus: x` —— 3 是解析时的默认值，两者等价

## 界面

`wwwroot/` 下三个文件：`index.html`（外壳 + 对话编辑器）、`quest.css` / `quest.js`（任务编辑器）。
无构建步骤、无框架、无依赖。里面包含：

- 一份对齐 `DialogParser.cs` 的 JS 解析器（同一份文本，两边解析出同一张图）
- 画布预览、节点图（自绘贝塞尔连线 + 拖拽缩放）、分拍页签、中英双语、深浅双主题

界面在 csproj 里被嵌成资源（`LogicalName="ui/..."`），单文件发布时才不会掉。

⚠️ 本地用 `file://` 直接打开这个 HTML 时，Chrome 会**猜编码**，没有 `<meta charset="utf-8">`
会猜成 GBK → 中文字符串字面量变乱码 → 报 `SyntaxError` 却指向一行完全正常的代码。
通过服务端访问时响应头带 charset，不会踩到。

## 界面设计规则

风格取自《明日方舟：终末地》的 AIC 工业终端。四条铁律：

1. **形状** — 斜切（-11°）只给挂牌类（按钮、标签、芯片）；容器类一律直角；**零圆角**
2. **厚度** — 静止态纯平，阴影和高光**只在 hover / active 时发生**
3. **颜色** — 柠檬黄 `#F2E205` = 当前项 / 主操作；橙 = 入口 / 告警；青 = 触发器入口；其余石墨灰阶
4. **信息** — 能承载数据的地方不放装饰：头部条码 = 每根线一个节点，左缘索引条 = 每根刻度一条故事线，
   节点角标 = 选项数

画布里的游戏对话框版式照搬塔科夫原生，但配色改成了中性黑，交互色跟外面统一。
