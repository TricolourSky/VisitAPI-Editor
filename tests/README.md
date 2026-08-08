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
a couple of SPT quest icons. `dbsnap/` is the quest DB the tests copy in fresh each run, so a
test that writes files can never poison the next one. Both are small and committed.

Everything else is generated: `BareEFT/` (built from scratch by `test-noplugin.ps1`, a machine
with no VisitAPI installed at all), `*.log`, `*.png`, and the `database` junction.

## The scripts

| | |
|---|---|
| `test-questapi.ps1` | quest read/write API, optimistic lock, broken-file handling |
| `test-questui.ps1` | the quest editor pages against real data |
| `test-questimg.ps1` `test-qimg.ps1` | quest card art: the API, the picker, path escapes |
| `test-dlglink.ps1` | quest ↔ `.dlg` hookup, and that rewriting preserves the file |
| `test-writer.ps1` | `.dlg` round-trip through the real UI, line by line |
| `test-traders.ps1` `test-ack.ps1` | custom trader sources, and "I know this trader" |
| `test-noplugin.ps1` | a machine with no VisitAPI: quest editing still works |
| `test-heartbeat.ps1` | the editor stays up when the tab is throttled, exits when it closes |
| `test-about.ps1` | the About page |
| `test-i18n.ps1` | every code the server can emit has text in both languages |
| `scan-deadkeys.ps1` | text keys declared but unused (reports suspects — check by hand) |
| `shot-*.ps1` | screenshots, not tests |
