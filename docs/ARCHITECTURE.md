# Architecture

**English** · [中文](ARCHITECTURE.zh-CN.md)

---

## In one line

A single-file exe that starts a loopback-only web server and serves an editor UI embedded inside itself.
It reads and writes `.dlg` scripts and SPT quest files on your disk.

## Three projects

| Project | Target | What it does |
|---|---|---|
| `VisitAPI.Dlg` | netstandard2.0 | `.dlg` parsing and writing. **Shared with the game plugin.** |
| `VisitAPI.Quests` | net10.0 | Quests / locales read-write, validation, read-only SPT_Data, quest↔dialogue hooks, quest icons |
| `VisitAPI.Server` | net10.0 (Web) | Self-hosted server + the UI, embedded as resources |

### Why `VisitAPI.Dlg` is netstandard2.0

It has to be consumable by **both** sides:

- The editor is net10.0
- The game plugin is net472, running under Unity's Mono

netstandard2.0 is the only target both accept. Note that it defaults to C# 7.3, so the csproj sets
`<LangVersion>latest</LangVersion>` explicitly — without it you get confusing errors on modern syntax.

### The plugin links the *sources*, not a DLL

The plugin's csproj pulls these files in with `<Compile Include="..\..\VisitAPI Editor\src\VisitAPI.Dlg\*.cs" />`
rather than referencing the compiled library. Two reasons:

1. The plugin stays a **single-DLL** drop-in; no extra assembly to ship or version
2. It avoids running a netstandard2.0 assembly under Unity's Mono, which has been a source of trouble

The point of sharing at all: the editor and the game can **never** disagree about what a script means.
"Looks right in the preview, wrong in game" is the exact failure this design rules out.

## Server

- **Loopback only.** Binds `127.0.0.1`, never `0.0.0.0`. This process can read and write your disk;
  exposing it to the LAN would be handing that out.
- **Dynamic port**, picked at startup by binding `:0` and releasing it.
- **Per-run random token**, injected into the page as `<meta name="tok">` and required by every
  `/api/*` call. Other sites can't read our page cross-origin, so they can't obtain it.
- **Path jail.** Every path must resolve inside the workspace (or the quest DB); `..` is rejected.
- **Heartbeat.** The one that actually decides is an **open connection**, `GET /live` (SSE). The tab
  goes away, the socket drops, `RequestAborted` fires — the operating system tells us, the page does
  not have to cooperate. The server exits ~10s after the last connection closes; the grace period is
  what separates a close from an F5. The same connection makes the reverse instant: if the backend
  dies, the page's `onerror` fires immediately instead of waiting for the next poll.

  Everything below is fallback, kept for browsers where `EventSource` never connects:
  - The page pings every 10s and the server exits after **3 minutes** of silence. That timeout is
    deliberately not "a few times the ping interval": Chromium **throttles background tabs to at most
    one timer wake per minute** once a tab has been hidden for five minutes. With the old 40s timeout,
    switching to another tab for a quarter of an hour killed the server while the page stayed open.
  - `pagehide` posts `/api/bye`, and the server exits **10 seconds later unless a ping arrives first**.
    The grace period is what separates "closed" from "refreshed" — F5 fires `pagehide` too, and an
    earlier version that exited on it turned every refresh into a kill.
  - The page also pings immediately on `visibilitychange`, and paints a "backend has shut down" overlay
    when a ping fails. It cannot close itself (`window.close()` is blocked for pages a script did not
    open), so saying so is the most it can do.
- **UI is embedded** in the exe as resources (`ui/index.html`, `ui/quest.css`, `ui/quest.js`).
  Single-file publishing does not carry a `wwwroot` folder along, so embedding is the reliable route.

## Endpoints

| Endpoint | Notes |
|---|---|
| `GET /` | The UI (token injected as `<meta name="tok">`) |
| `GET /ui/{name}` | The rest of the embedded UI assets |
| `GET /live` | The liveness connection (SSE). Outside `/api` because `EventSource` cannot send headers — token goes in the query string |
| `GET /api/ping` | Fallback heartbeat — the only `/api` endpoint that skips the token |
| `POST /api/bye` | "The page is going away." Starts a 10s countdown any ping cancels |
| `POST /api/quit` | Shut down |
| `GET/POST /api/workspace` | Read/set the `.dlg` workspace; also reports the build stamp |
| `GET /api/list?dir=` | List folders and script files (`.dlg` and `.dlg.demo`) |
| `GET /api/dlg?path=` | Read a script verbatim |
| `POST /api/dlg?path=` | Write a script. **Takes a model, not text** — see below. `.dlg` only (so a bug can't overwrite `.dlg.demo` or anything else in the workspace). Writes a `.bak` first |
| `POST /api/dlg/render` | Render without saving (what "View .dlg" shows) |
| `GET /api/assets` | `{bg:[], audio:[]}` |
| `GET /media?path=&t=` | Media bytes. **Range processing is on**, or browsers refuse to play mp4 |
| `GET /api/quests` | Quests + locales + traders + maps + validation + a stamp |
| `POST /api/quests` | Write back per file; **an empty object means "this file is empty now, delete it"** (with a `.bak`). The stamp acts as an optimistic lock (409 on mismatch) |
| `GET /api/quests/items` | Item table (4288 rows; separate call, fetched on demand) |
| `GET/POST /api/quests/roots` `/root` | List / choose where quests are stored |
| `GET /api/quests/links` | Scan every `.dlg` for quest↔option hooks and triggers |
| `POST /api/quests/link` | Attach/detach a hook. **This edits the `.dlg`, via `DialogWriter`** |
| `POST /api/quests/trader-ok` | Mark a trader as known (for mods not installed / not updated yet) |
| `GET /api/quests/images` | Quest icons available from SPT and from the mod folder |
| `GET /qimg?src=&name=&t=` | The icon bytes. **Not under `/api`** — `<img src>` cannot send the token header, so it goes in the query string like `/media` |

## Faithful round-trip

`.dlg` files are handwritten. Saving must not wash away the author's formatting or comments:

- `DialogTree.HeadRaw` records **every** header line in order (comments included); on write it is
  replayed — comments copied verbatim, editable lines regenerated from the model
- Comments inside a node attach to the element that follows them (`Lead` on node / narration / npc line /
  option / jump, plus `Tail` at the end of a node)
- `DialogTrigger.Raw` keeps the trigger line verbatim and the writer prefers it.
  ⚠️ **If trigger editing is ever added, whatever changes a field must set `Raw` to null**, or the
  writer will emit the stale line.
- Quest aliases are mapped back to their names, so `quest sora = 5043…` doesn't turn into bare ids below
- Anything the parser can't understand degrades to verbatim rather than being regenerated

## There is only one writer

**`.dlg` text is produced solely by the C# `DialogWriter`.** The front-end POSTs a model and never
assembles strings itself.

This is a lesson, not a preference. The UI used to carry its own JS `toDlg()` alongside the C# one, and
it measurably dropped: comments inside nodes, `anim` on narration lines, the value of `setstatus`, the
trader id on `standing`, and a second gate on the same option. Two writing implementations drift, and
the cost of drift is somebody else's script.

Quest json applies the same principle differently: **everything stays a `JsonNode` and only fields we
understand are touched.** There is deliberately no strongly-typed model, so fields we never modelled
(`arenaLocations`, `gameModes`, …) cannot be silently dropped on a deserialize→serialize round trip.

### Two known normalisations (not data loss)

1. `DialogWriter` emits one blank line before each node, so **blank-line placement** may differ from the
   original (the count does not)
2. `setstatus: x=AvailableForFinish` is written as `setstatus: x` — 3 is the parser's default, so the
   two are equivalent

## UI

One page, no framework, no build step. `index.html` carries the shell and the dialogue editor;
`quest.css` / `quest.js` carry the quest editor.

- All interface text goes through a `T("key")` lookup against two tables (zh / en). Server-side messages
  are returned as **codes plus arguments**, never prose, so a new language is a new table and no C# change.
- Two different "languages" exist and are deliberately separate variables: `lang` is the interface
  language; `qlang` is which language of *content* you are currently writing.
- Theme is a `data-theme` attribute on `<html>`; every colour is a custom property, so nothing needs to
  know whether it is currently light or dark.

## Two SPT facts this depends on

Both were established by decompiling `SPTarkov.Server.Core.dll` for 4.1.1, not by inference. If either
ever changes, the quest image picker is what breaks.

1. **`ImageRouteImporter` only walks `./SPT_Data/images/`.** It is a private method with one hardcoded
   call site, so images sitting in a mod's own folder are *not* served. A mod has to register them:
   `imageRouter.AddRoute(key, absolutePath)`. The VisitAPI server mod does this for its
   `images\quest\icon\`; the editor tells you when the folder you picked belongs to a mod that may not.
2. **Route keys carry no file extension.** Registration and lookup both run the path through
   `FileUtil.StripExtension`, which is `path.Split('.').First()` — it truncates at the *first* dot, not
   the last. That is why vanilla `quests.json` can say `.jpg` for a file that is `.png` on disk, and why
   a name like `a.b.png` can never resolve. The editor resolves previews the same way, so vanilla quest
   art shows up correctly, and it flags names with an extra dot in the picker.

## UI design rules

Four rules the whole interface follows:

1. **Shear (`-11°`) only on tag-like elements** — spec chips, type badges. Never on buttons or panels.
2. **Flat at rest.** Depth (shadow) appears only on hover or for the current item.
3. **Lemon yellow `#F2E205` means "current" or "primary action"** — nothing else. Orange is for warnings.
4. **If it can carry data, don't make it decoration.** The chain graph's `LV.n` rail is prerequisite
   depth; the dot on a tab means that tab has content.
