# VisitAPI Editor

> A visual editor for SPT 4.1.3 — dialogue, quests, chapters, bot outfits and trader stock

**English** · [中文](README.zh-CN.md)

---

It exists so that **people who don't write code** can make content for SPT traders.

| | |
|---|---|
| **Dialogue** | Edit a `.dlg` script while seeing how it will look in Tarkov's dialogue box — backgrounds, video, voice, music — with the whole branching structure drawn as a flow graph. Pairs with the VisitAPI trader-dialogue framework. |
| **Chapters** | String quests into one chapter of the STORY tab: the card is laid out like the 1.1 story page (icon and banner, main/optional objectives, journal, related items) and edited in place; sub-quest order, auto-accept/complete and chaining are one click. Needs VisitAPI 1.2+. |
| **Quests** | Writes plain SPT quest files and **does not need VisitAPI**. Objectives, rewards, fail branches, mails; item, map and trader lists come from the game's own data, so nobody has to memorise 24-character ids. |
| **Bot outfits** | Put the clothes your mod adds onto any SPT bot type. The body/hands mismatch that gives NPCs hollow forearms is caught before you save. |
| **Trader stock** | Lay out what a trader sells on a 1:1 copy of Tarkov's shelf, with checks for the mistakes the server never reports — an ammo box sold empty, an item priced but not unlocked. |
| **Restore** | Every overwrite leaves a `.bak`. This page swaps them back. |

Dialogue and quests are wired together: a quest can be attached to the dialogue option that hands it
out, and one click jumps between the two.

Every module walks you through itself the first time you open it — a step-by-step tour that points at the
real buttons. Settings → "Replay the tour" runs it again.

## Install

1. Download `VisitAPI.Editor.exe` from [Releases](../../releases)
   — the [VisitAPI](https://github.com/TricolourSky/VisitAPI) release package ships the same exe in its root, so if you installed that you already have it
2. Drop it in your EFT root, next to `EscapeFromTarkov.exe`, and run it
3. Your browser opens — that is the editor

Anywhere else works too; it asks for the folder once, then remembers.

**Requires the .NET 10 + ASP.NET Core 10 runtime** — if you have SPT, you already have both.
It binds `127.0.0.1` only and every request needs a per-run token, so nothing is exposed to your network.

## Where things live

| | |
|---|---|
| Scripts | `<EFT>\BepInEx\config\VisitAPI\*.dlg` |
| Backgrounds · audio | `…\VisitAPI\backgrounds\` · `…\VisitAPI\audio\` |
| Quests | any mod's `db\quests\` + `db\locales\` — you choose which |
| Bot outfits · trader stock | any mod's `db\` (the WTT layout) |

One thing worth knowing: **SPT will not load quests from an arbitrary folder on its own.** They have to
live under a mod that reads them. The editor scans your mods on start-up and lets you pick.

A `.bak` is written before every overwrite, and saving never reformats your file, eats your comments,
or flattens your blank lines.

## Build from source

```powershell
.\build.ps1              # produces publish\VisitAPI.Editor.exe
```

Requires the [.NET 10 SDK](https://dotnet.microsoft.com/download). Output is a single-file,
framework-dependent exe.

## License

[MIT](LICENSE) · © 2026 TricolourSky
