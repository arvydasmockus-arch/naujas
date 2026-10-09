# YACPDB import checkpoint

Import stopped at the user's request on 2026-10-09 (Vilnius time).

- Database: `C:\Users\arvyd\naujas\data\solving.sqlite`.
- Query: `Stip('^#2$')` at `https://www.yacpdb.org/gateway/ql`.
- Source's last reported total: **217,612 records**.
- Saved pages: **612**, with no missing pages before page 613.
- First page to resume: **613**.
- Original records saved and parsed: **61,193 distinct IDs**.
- Classical #2 candidates: **26,299**.
- Fully verified imported problems so far: **212**.

Resume with `npm run import:puzzles` in the project directory. The script reads
the saved `import_pages` SQLite table and automatically skips completed pages.
It refreshes page 1 to read the current total, then fetches missing pages. Do not
delete `data/solving.sqlite`: it contains both the library and shared game data.
The importer is currently stopped, not running in the background.

## Platform changes already saved

Shared SQLite-backed player results, trusted names, 30-day daily calendar,
automatic UTC rollover, fixed non-repeating positions, English/Lithuanian UI,
lighter layout, cburnett SVG pieces, compact side-by-side solutions and per-problem
statistics are implemented. Nothing has been published or pushed to GitHub.

Checks completed before the pause: build, lint, 11 unit tests and browser checks
for two players, correct/incorrect/skip answers, reload timing, language choice,
SVG assets and 320px/390px layouts. A background reserve verifier was subsequently
added and stopped during preparation; its final integration still needs review
and the Node development server needs a restart to load that addition. At resume,
finish verification of these latest changes and then finish the full import.

See `SOLVING.md` for operation and data details.
