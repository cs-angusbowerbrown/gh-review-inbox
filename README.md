# gh inbox

A `gh` extension that lists the pull requests you're in the middle of, so a review you started yesterday is one click away instead of buried in notifications.

It shows four groups:

| Group | What's in it |
| --- | --- |
| Drafts | PRs where you've written review comments but haven't submitted the review |
| Requested from you | PRs waiting on your review that you haven't started |
| Reviewed, still open | PRs you've submitted a review on that haven't merged |
| Your pull requests | PRs you opened |

GitHub's own pull request pages can't show the first group. A pending review is private to you, so search qualifiers like `reviewed-by:@me` don't see it, and once you submit any review you drop out of `review-requested:@me`.

## Install

```sh
gh extension install <owner>/gh-inbox
```

It needs Python 3, and it uses your existing `gh` login, so there's no token to set up.

## Use

```sh
gh inbox          # serve the inbox on http://127.0.0.1:7357 and open it
gh inbox --json   # print the inbox as JSON
```

The page is meant to stay open in a tab. It refreshes when you come back to it, and links open in a new tab. Review links go straight to "Files changed".

`--port` picks another port, and `--no-open` skips opening the browser.

## How drafts are found

Search can't find pending reviews, so `gh inbox` lists the open PRs in every organisation you belong to and in your own repositories, and asks the GraphQL API which of them hold a pending review of yours. It then fetches the full details for those PRs only. On an organisation with a couple of hundred open PRs, a refresh takes about five seconds.

A draft on a repository outside those owners only appears if its author has requested your review, and then without its draft comment count.
