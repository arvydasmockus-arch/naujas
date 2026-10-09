# ML School: local solving platform

## Open and test

Run `npm run dev` in `C:\Users\arvyd\naujas` using Node.js 24. Open
`http://localhost:5174/?page=solving`. The solving page opens directly and defaults
to English. Select **Lietuvių** to switch language. The choice is remembered.

Enter a player name; no password is required. Choose a date, submit White's key
move or skip each of the six #2 problems. After completing the series, review the
shared table, compact diagrams, solutions and statistics. Open the same address
in another browser and enter another name to compare players. Names are
case-insensitive; using someone else's name opens that player's saved progress.

For testers on the same network, use the **Local network** URL printed by
`npm run dev`. Keep this computer and server running. A firewall may need to
allow the connection. `localhost` on another computer refers to that computer.
Testing from different networks requires a hosted Node server or a separately
configured private tunnel; this version has not been published.

## Data and daily operation

`data/solving.sqlite` contains the imported problem library, fixed daily series,
players, attempts and statistics. It is excluded from Git. Back it up with the
server and importer stopped, or use SQLite's online backup facilities. Do not
copy only the main file while the database is running in WAL mode.

The shared calendar contains 30 open dates. Six distinct positions are assigned
to each day and saved permanently. Position hashes prevent diagrams repeating
across dates. Dates rotate at **00:00 UTC**; the running server checks every
minute. After downtime, it creates missing dates on startup. Expired series
reject new answers, but their saved results remain accessible through the API.
The server also prepares 180 unused, verified diagrams in the background and
refills the reserve hourly. Daily selection verifies further candidates if
needed. A finite library is not literally unlimited; no diagrams are silently
recycled when it runs out.

Timing starts when the diagram is opened. Refreshing or leaving does not reset
the saved start time. A single legal key move is accepted per problem; illegal
moves do not count. Time is recorded in whole seconds. Reopened diagrams have
an asterisk in the results table. All submitted answers, including incorrect
moves and skips, count toward total time.

## Full YACPDB import

Run `npm run import:puzzles`. It downloads every public search page for the exact
stipulation `#2`, stores the original records, parses standard positions and
solutions, and checkpoints each page. Restarting resumes cached progress. It
uses at most four simultaneous requests and retries temporary network failures.
The source's count can change during a long import; the final summary records
received records, distinct IDs and duplicates separately.

Not every #2 record is suitable for this platform: fairy conditions, twins,
missing or ambiguous keys and flagged compositions are excluded. A candidate's
authored key is checked against every legal Black reply and all alternative
White keys before it is assigned. Imported candidates and fully verified
problems are different counts.

The source is [YACPDB](https://www.yacpdb.org/), query `Stip('^#2$')`. Composer,
source and original record links appear in reviews. Piece SVGs are Colin M. L.
Burnett's cburnett set; attribution and GPLv2 licence are in `src/assets/chess/`.

## Checks

`npm run lint`, `npm run build`, `npm run test:solving`.

The solving API needs the Node server: `npm run preview` or static GitHub Pages
alone does not provide shared results. The earlier single-player browser data
uses a separate localStorage key and has not been imported into the shared
database.
