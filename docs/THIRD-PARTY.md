# Third-party assets

**English** · [中文](THIRD-PARTY.zh-CN.md)

---

## ⚠️ Please read this before publishing

`src/VisitAPI.Server/wwwroot/index.html` embeds **5 base64 PNG icons** (about 5.5 KB in total):

| Used for | Origin |
|---|---|
| Talk / Accept quest / Complete quest / Leave / Trade | Extracted from Escape from Tarkov's dialogue UI atlas |

They appear to the left of option rows in the preview, so that what you see here matches what you see
in game.

**These are art assets extracted from the game.** Doing so is common in the SPT modding scene and
broadly accepted there, but strictly speaking they are not part of this project, so **whether to ship
them with the source is your call**.

Two options:

1. **Ship as-is** — same as the vast majority of SPT mods; the preview stays fully faithful
2. **Replace with hand-drawn icons** — redraw the 5 icons as inline SVG, so no third-party asset
   remains, at the cost of the preview icons no longer matching the game exactly

If you want them replaced, say so — the change is confined to a single `const ICON={...}` in
`index.html`.

---

## What is deliberately not published with the source

Already excluded by `.gitignore`:

- **`mockups/`** — four generations of UI prototypes kept for reference. Each `*.built.html` is around
  5 MB and embeds game screenshots and character art; `bg/` likewise. Third-party art — kept locally,
  never committed.
- **`Memory.MD`** — the development log. Contains absolute paths from this machine and a lot of internal
  reasoning; not suitable for publication. Delete that line from `.gitignore` if you want it public.
- **`dist/`** — build output. Uploaded as a GitHub Release asset rather than living in repository history.

## Scripts and media

The repository contains **no `.dlg` scripts, background images or audio**. Those belong to individual
mod authors, live under `<EFT>\BepInEx\config\VisitAPI\` on the player's own machine, and this tool
only reads and writes them.
