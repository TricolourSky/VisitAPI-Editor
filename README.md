# VisitAPI Editor

> A visual **dialogue + quest** editor for SPT 4.1.1

**English** · [中文](README.zh-CN.md)

---

It exists so that **people who don't write code** can write stories and quests for SPT traders.

- **Dialogue** — edit a `.dlg` script while seeing exactly how it will look in Tarkov's dialogue box,
  wire up backgrounds, video, voice lines and music, and read the whole branching structure as a flow
  graph. Pairs with the VisitAPI trader-dialogue framework.
- **Quests** — writes **plain SPT quest files** and **does not need VisitAPI**. Objectives, rewards,
  fail branches, all four mails, player lines; item / map / trader lists come straight from the game's
  own data so nobody has to memorise 24-character ids.

The two are wired together: a quest can be attached to a dialogue option (which line the player has to
press to get it), and one click jumps you there.

### What it is

A local web app. Double-click the exe → it starts a tiny server bound to `127.0.0.1` only →
your browser opens. No installer, no dependencies — **a single exe is the whole thing**.

**Dialogue**

- **Live preview** — backgrounds (PNG/JPG/MP4/WebM) behind Tarkov's native dialogue layout; click options to walk branches
- **Flow graph** — auto-layout by depth, broken links highlighted
- **Chapter rail** — one tick per independent story thread, click to jump
- **Beat editing** — multiple narration beats per node, each with its own background and voice
- **Audio** — music (per node) and voice (per beat), with preview
- **Faithful round-trip** — saving does not reformat your file or eat your comments (see below)

**Quests**

- **Four tabs** — quest card (description / objectives / rewards / starting gear / accept conditions) ·
  dialogue hooks · failure branch · properties
- **Plain language** — conditions read "kill 5 scavs (Interchange)", not `CounterCreator`;
  a reward of `5449016a…` shows up as "Roubles"
- **Item picker** — 4288 items searchable in either language, straight from `SPT_Data\templates\handbook.json`
- **Image picker** — pick the quest's card art from SPT's own 332 built-in icons, or from your mod's
  `images\quest\icon` folder, or type a path
- **Chain graph** — auto-layered by prerequisite depth (LV.0 / LV.1 …); **drag from a card to another
  to create a prerequisite**; loops, self-links and duplicates are refused
- **Dialogue hooks** — see which option hands the quest out or takes it in; two clicks to attach; click to jump
- **You choose where they go** — no VisitAPI required; quests can live in any mod's `db` folder
- **Validation** — no objectives, empty completion mail, missing prerequisite, duplicate id, unknown trader… 13 rules

There is also an **About page** (the first item in the sidebar, and where the editor opens): what each
module can and cannot do yet, plus the live paths it resolved on this machine.

Shared: dark/light themes, English/Chinese UI (the interface language is separate from the language
you're writing your text in).

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

### Where quests go

**Quest editing does not require VisitAPI** — what it writes are plain SPT quest files
(`db\quests\*.json` + `db\locales\*.json`).

One thing to be clear about: **SPT will not load quests from an arbitrary folder on its own.**
Its `CustomQuestService` is an API mods call in memory; it scans nothing. The code that actually reads
files is each mod's own loader. So for a quest to take effect it has to live under a mod that reads it:

- With the VisitAPI server mod installed → it reads `db\quests` next to itself; put them there
- Or save into another mod that uses the same convention
- Or just keep them and write a loader later

On start-up the editor scans `SPT_Runtime\user\mods\*\db` and offers what it finds; you can also type
your own path (missing `quests` / `locales` folders get created). Your choice is remembered.

**About custom traders**: traders registered by other mods (`db\traders\<id>\base.json`) show up in the
trader list automatically. If that trader's mod isn't installed — or isn't updated for your SPT version
yet — the editor says "not found on this machine"; click "I know this trader" and it stops asking.

**About quest images**: SPT only serves images out of `SPT_Data\images` — **it does not pick up images
from a mod's own folder on its own.** For your own art to show in game, the mod it lives in has to
register it:

```csharp
imageRouter.AddRoute("/files/quest/icon/" + nameWithoutExtension, absolutePathToTheFile);
```

The VisitAPI server mod does this for everything under its `images\quest\icon\`. Any other mod has to
add the call itself — the editor says so on the picker's "type a path" tab. Note the route key carries
**no file extension** (SPT truncates at the first dot on both sides), so a file name with an extra dot
in it can never resolve; the picker flags those.

### Faithful round-trip

Saving does not rewrite your file:

- The header is replayed in its original order, **comments copied verbatim**
- Comments inside a node attach to the element that follows them — nothing is lost
- Trigger lines are **kept as written** (coordinates are `float`; re-formatting would turn a hand-typed `0.09` into `0.090000003576`)
- Quest aliases are mapped back to their names instead of bare IDs
- Anything the parser can't understand is preserved verbatim rather than regenerated

Measured: a real 179-line script, opened and immediately saved, comes back **177 lines byte-identical** —
the only two differences are trailing spaces the original had.

**There is exactly one place that produces `.dlg` text**: the C# `DialogWriter`. The front-end sends a
model to the local server and never assembles strings itself — two writing implementations drift apart
eventually, and the cost of drifting is somebody else's script. (What "View .dlg" shows you *is* the
text that Save will write.)

Quest json follows the same rule: **only fields we understand are touched, everything else is carried
through untouched.** There is deliberately no strongly-typed model, so fields we never modelled
(`arenaLocations`, `gameModes`, …) can't be silently dropped.

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
├─ VisitAPI.Quests/   quests / locales / validation / read-only SPT_Data / quest↔dialogue hooks
└─ VisitAPI.Server/   self-hosted server + UI (index.html + quest.css/js, embedded in the exe)
```

`VisitAPI.Dlg` is **shared with the game plugin**. The plugin (net472, running under Unity's Mono)
links these sources directly via `<Compile Include="...">` instead of referencing a DLL, so it stays
a single-file plugin and the two sides can never disagree about what a script means.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Roadmap

- [x] Open / edit / save `.dlg`, preserving comments and line order
- [x] Live preview + branching flow graph
- [x] Backgrounds (image / video), audio (music / voice)
- [x] SPT quest editor (create / edit / delete / save · chain graph · validation · no VisitAPI needed)
- [x] Quest ↔ dialogue hooks, with cross-file jump
- [x] Quest card art, picked from SPT's own icons or your mod's folder
- [ ] Bot outfit swapping
- [ ] Chapter/campaign authoring
- [ ] `scene:` / `actor:` controls in the dialogue editor
- [ ] Restore from the `.bak` copies the editor leaves behind
- [ ] A step-by-step guide inside the app

---

## License

See [LICENSE](LICENSE).
