# Tests

Regression suite for the editor. Everything is PowerShell + a headless browser — no test
framework to install. Each script prints one `PASS`/`FAIL` line per check and a total.

```powershell
.\tests\run-all.ps1                 # everything
.\tests\run-all.ps1 -Only i18n,qimg # just the ones whose name contains these
.\tests\run-all.ps1 -Verbose        # every PASS/FAIL line, not just the totals
```

## What you need

| | |
|---|---|
| .NET 10 SDK | to build the editor the tests drive |
| A real SPT install | for `SPT_Data\database` — the item table, maps, traders and global locales. Set `VISITAPI_SPT_HOME` if it isn't at `D:\EFT`. |
| Microsoft Edge | the UI tests run it headless. Set `VISITAPI_EDGE` for a different path. |

`_env.ps1` resolves all of that; it also links `FakeEFT\SPT_Runtime\SPT_Data\database` to the
real install the first time you run (a directory junction — no admin rights needed).

## How the UI tests work

A probe script (`probe-*.js`) is appended to a copy of `index.html`, the copy is served by the
editor itself, and headless Edge loads it. The probe drives the real page and writes its results
into a `.dlg` file inside the fake workspace, which the PowerShell side then reads back.

It has to be served by the editor rather than opened from disk: the page calls `/api`, and only
a same-origin document gets the token out of the `<meta>` tag.

## Fixtures

`FakeEFT/` is a miniature game folder — a `.dlg` workspace, one mod with quests and images,
a couple of SPT quest icons. The `*snap/` folders are pristine copies laid down fresh on every
run, so a test that writes files can never poison the next one:

| | |
|---|---|
| `dbsnap/` | a quest DB — `quests\` + `locales\` |
| `modsnap/` | a content DB — bot loadouts, clothing, heads, voices, an assortment, preview art |
| `dlgsnap/` | a `.dlg` script |

All of them are small and committed.

Everything else is generated: `BareEFT/` (built from scratch by `test-noplugin.ps1`, a machine
with no VisitAPI installed at all), `*.log`, `*.png`, and the `database` junction.

## The scripts

Dialogue and quests:

| | |
|---|---|
| `test-writer.ps1` | `.dlg` round-trip through the real UI, line by line |
| `test-dlglink.ps1` | quest ↔ `.dlg` hookup, and that rewriting preserves the file |
| `test-questapi.ps1` | quest read/write API, optimistic lock, broken-file handling |
| `test-questui.ps1` | the quest editor pages against real data |
| `test-questimg.ps1` `test-qimg.ps1` | quest card art: the API, the picker, path escapes |
| `test-roles.ps1` | node roles, editable trigger points, the preview splitter |
| `test-traders.ps1` `test-ack.ps1` | custom trader sources, and "I know this trader" |
| `test-empty.ps1` | an empty quest DB is a starting point, not a dead end |

Content library — BOT looks, trader assortments, backups:

| | |
|---|---|
| `test-bots.ps1` | BOT appearance API: replace, restore-to-default, save only what changed |
| `test-assort.ps1` | assortment API and its validator against real trader data |
| `test-modui.ps1` | the BOT and assortment pages in a real browser |
| `test-modroot.ps1` | content-library detection and the picker dialog |
| `test-backup.ps1` `test-backui.ps1` | `.bak` listing and the swap-don't-overwrite restore |

Shell, settings and docs:

| | |
|---|---|
| `test-noplugin.ps1` | a machine with no VisitAPI: quest editing still works |
| `test-heartbeat.ps1` | the editor stays up when the tab is throttled, exits when it closes |
| `test-prefs.ps1` | preferences survive a restart (they live next to the exe, not in localStorage) |
| `test-project.ps1` `test-projui.ps1` | `.vaproj` save/open — all three roots are checked before anything moves |
| `test-about.ps1` | the About page |
| `test-help.ps1` | the guide page: markup is well-formed, both languages line up |
| `test-gaps.ps1` | the small edges: path escapes, suffix checks, error wording |
| `test-i18n.ps1` | every code the server can emit has text in both languages; also class-name and JS global collisions |
| `scan-deadkeys.ps1` | text keys declared but unused (reports suspects — check by hand) |
| `shot-*.ps1` | screenshots, not tests |
