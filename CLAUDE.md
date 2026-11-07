# gh-review-inbox

`gh-review-inbox` (Python) fetches and groups the PRs and serves them as JSON. `index.html` (web page) and `tui/` (OpenTUI terminal view) both render that JSON.

## The group contract

The group ids (`pending`, `requested`, …, `mineApproved`) and the two pages are defined four times:

- `groups()` in `gh-review-inbox` decides which PR lands in which group.
- `GroupId`, `Row` and `PAGES` in `tui/app.tsx`.
- `PAGES` in `index.html`.
- The two tables in `README.md`.

A change to a group, a page or a row field touches all four. The web and terminal hints are worded differently on purpose. The terminal's are shorter.

## Checking a change

There is no test suite. Type-check the terminal view with `bunx tsc --noEmit` from `tui/`, and run `./gh-review-inbox --json` to see the real grouping for your account.
