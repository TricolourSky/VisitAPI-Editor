# VisitAPI Editor

> A visual editor for SPT 4.1.1 — **dialogue, quests, bot outfits and trader stock**

**English** · [中文](README.zh-CN.md)

---

It exists so that **people who don't write code** can write stories and quests for SPT traders.

- **Dialogue** — edit a `.dlg` script while seeing exactly how it will look in Tarkov's dialogue box,
  wire up backgrounds, video, voice lines and music, and read the whole branching structure as a flow
  graph. Pairs with the VisitAPI trader-dialogue framework.
- **Quests** — writes **plain SPT quest files** and **does not need VisitAPI**. Objectives, rewards,
  fail branches, all four mails, player lines; item / map / trader lists come straight from the game's
  own data so nobody has to memorise 24-character ids.
- **Bot outfits** — put the clothes your mod adds onto any of SPT's bot types, with the mismatch that
  causes hollow forearms in game caught before you save.
- **Trader stock** — lay out what a trader sells on a 1:1 copy of Tarkov's own shelf, and get told about
  the mistakes the server never reports (an ammo box sold empty, an item priced but not unlocked).
- **Restore from backup** — every overwrite leaves a `.bak`; this page puts them back.

Dialogue and quests are wired together: a quest can be attached to a dialogue option (which line the
player has to press to get it), and one click jumps you there. Bot outfits and trader stock read the
same mod files, so a suit you make is also the thing your trader sells.

### What it is

A local web app. Double-click the exe → it starts a tiny server bound to `127.0.0.1` only →
your browser opens. No installer, no dependencies — **a single exe is the whole thing**.

**Dialogue**

- **Live preview** — backgrounds (PNG/JPG/MP4/WebM) behind Tarkov's native dialogue layout; click options to walk branches
- **Flow graph** — auto-layout by depth, broken links highlighted
- **Chapter rail** — one tick per independent story thread, click to jump
- **Beat editing** — multiple narration beats per node, each with its own background and voice
- **Audio** — music (per node) and voice (per beat), with preview
- **Trigger points** — where in the hideout or a raid the player can walk up and start talking; edited from the top bar, and only the line you touch gets rewritten
- **Node roles** — make a node the entry, the first-meeting screen, or a level/standing-gated entry, from the node itself
- **Opening a 4.0.13 script** flags what 4.1 reads differently — including the ones that still parse but mean something else
- **Faithful round-trip** — saving does not reformat your file, eat your comments, or flatten your blank lines (see below)

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
- **Advanced objective fields** — found-in-raid, durability range, one-raid-only, time limit, zone id, plant time,
  kill distance and time of day — the fields stock quests actually use, surveyed from all 1000+ of their conditions
- **Validation** — no objectives, empty completion mail, missing prerequisite, duplicate id, unknown trader… 13 rules

**Bot outfits**

- **Assembly bay / wardrobe** — five slots (head · body · hands · bottom · voice) on the left, everything
  your mod registered on the right; the wardrobe deliberately does not list SPT's own 456 entries
- **One icon per slot** — the pile of ids in a bot file is SPT's random outfit pool for that bot, so it is
  shown as one item ("stock"), not unpacked into thirteen
- **Mismatch caught early** — an upper and the hands it ships with come from the same record; swap only one
  and the NPC shows hollow forearms in game. The editor says which two, why, and what each is now
- **Restore to stock** reads SPT's own `bots\types\<type>.json` back — the editor keeps no copy of its own
- **Your own preview art** goes in `db\previews\`; a file named after the character works, so you don't
  have to rename anything to a 24-character hex id

**Trader stock**

- **The shelf, as the player sees it** — 10 × 12 grid, tiles sized by the item's real footprint (a rifle with
  a barrel and stock takes the room it takes), price top-left, count bottom-right, loyalty tier bottom-left
- **Edit on the right, the shelf changes on the left** — price, currency, loyalty tier, stock, buy limit
- **Both file layouts** — a mod's own `assort.json`, or WTT's `CustomAssortSchemes` with several traders per file
- **Validation for what the server never reports** — an ammo box listed without ammo inside (the player buys
  an empty box), an item in `items` but missing from the price or loyalty table, a child part in a slot the
  template doesn't have. Verified against 2331 stock items across 6 vanilla traders: zero false alarms

**Projects**

Three roots (the `.dlg` workspace, the quest DB, the content DB) can belong to three different mods. Save the
combination as a `.vaproj` and switch the whole set in one click; the five most recent are one click away.

There is also a **Guide** page — one foldable card per idea, in plain language, each with an example you
can copy: what a node is, what node names are for, where an option can jump, what an option can do on
the way, and the same treatment for quests.

And an **About page** (the first item in the sidebar, and where the editor opens): what each module can
and cannot do yet, plus the live paths it resolved on this machine.

The first time you open the dialogue and quest pages there's a short **guided tour**: it highlights what
you can actually click, one step at a time. It runs once; replay it from the Guide page.

Shared: dark/light themes, English/Chinese UI (picked from your system language on first run; the
interface language is separate from the language you're writing your text in).

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

- The header is replayed in its original order, **comments and blank lines copied verbatim** (the blank lines are how you paragraph a header)
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
.\build.ps1              # produces publish\VisitAPI.Editor.exe
```

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download). Output is a single-file,
framework-dependent executable.

Tests live in [tests/](tests/) — PowerShell plus a headless browser, no framework to install:

```powershell
.\tests\run-all.ps1      # 986 checks
```

They need a real SPT install for its item/map/trader tables; see [tests/README.md](tests/README.md).

### Layout

```
src/
├─ VisitAPI.Dlg/      .dlg parsing and writing (netstandard2.0) — shared with the plugin
├─ VisitAPI.Quests/   quests / locales / bot looks / assortments / validation / read-only SPT_Data
└─ VisitAPI.Server/   self-hosted server + UI (wwwroot, embedded in the exe)
tests/                regression suite (PowerShell + headless Edge) and its fixtures
docs/                 architecture and third-party notes, in both languages
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
- [x] `scene:` / `actor:` controls in the dialogue editor
- [x] Trigger points, and setting a node as the entry / first meeting / tiered entry
- [x] A guide inside the app, and a guided tour of what you can click
- [x] Opening a 4.0.13 script points out what 4.1 reads differently
- [x] Bot outfit swapping, with the body/hands mismatch caught before you save
- [x] Trader stock, laid out the way the player sees it
- [x] Restore from the `.bak` copies the editor leaves behind
- [x] Projects (`.vaproj`) — switch all three roots at once
- [ ] ~~Chapter/campaign authoring~~ — **dropped**: it would need the plugin to drive scenes and actors,
      which it cannot do today. `scene:` / `actor:` stay free-text fields, written through faithfully.

---

## License

See [LICENSE](LICENSE).
