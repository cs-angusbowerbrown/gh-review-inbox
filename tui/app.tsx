import type { MouseEvent, ScrollBoxRenderable } from "@opentui/core"
import { useFocus, useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useRef, useState } from "react"

export type Row = {
  key: string
  repo: string
  number: number
  title: string
  url: string
  author: string
  isDraft: boolean
  updatedAt: string
  additions: number
  deletions: number
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null
  yourReview: "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED" | null
  checks: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null
  draftComments: number | null
  draftUpdatedAt: string | null
}

export type GroupId = "drafts" | "requested" | "reviewed" | "approved" | "mineDraft" | "mineWaiting" | "mineInReview" | "mineApproved"

export type Inbox = {
  login: string
  owners: string[]
  fetchedAt: string
  groups: Record<GroupId, Row[]>
}

type Group = { id: GroupId; title: string; hint: string; quiet?: boolean; decided?: boolean }

type Optional = { id: GroupId; key: string; noun: string; notice: GroupId }

const PAGES: { title: string; groups: Group[]; optional: Optional }[] = [
  {
    title: "Reviewing",
    optional: { id: "approved", key: "a", noun: "approved", notice: "reviewed" },
    groups: [
      { id: "drafts", title: "Drafts", hint: "started, not submitted" },
      { id: "requested", title: "Requested from you", hint: "not started" },
      { id: "reviewed", title: "Reviewed, still open", hint: "not approved by you" },
      { id: "approved", title: "Approved by you", hint: "still open", quiet: true, decided: true },
    ],
  },
  {
    title: "Yours",
    optional: { id: "mineDraft", key: "d", noun: "drafts", notice: "mineWaiting" },
    groups: [
      { id: "mineDraft", title: "Draft", hint: "not ready for review" },
      { id: "mineWaiting", title: "Waiting for review", hint: "no reviews yet" },
      { id: "mineInReview", title: "In review", hint: "reviews in, not approved" },
      { id: "mineApproved", title: "Approved", hint: "ready to merge", decided: true },
    ],
  },
]

function pageCount(inbox: Inbox, page: number) {
  return PAGES[page].groups.filter((g) => g.id !== PAGES[page].optional.id).reduce((sum, g) => sum + inbox.groups[g.id].length, 0)
}

const C = {
  fg: "#f0f6fc",
  muted: "#9198a1",
  border: "#3d444d",
  selected: "#1f2a3a",
  accent: "#4493f8",
  green: "#3fb950",
  red: "#f85149",
  amber: "#d29922",
  match: "#5c4813",
}

const KEYS: { key: string; label: string; footer?: string; footerKey?: string }[] = [
  { key: "j / k", label: "move down / up", footer: "move", footerKey: "j/k" },
  { key: "↓ / ↑ / wheel", label: "move down / up" },
  { key: "g / G", label: "jump to top / bottom" },
  { key: "1 / 2 / tab", label: "reviewing / your pull requests", footer: "pages", footerKey: "1/2" },
  { key: "o / enter", label: "open pull request", footer: "open" },
  { key: "f", label: "open files changed", footer: "files" },
  { key: "W", label: "start and open the web view" },
  { key: "a", label: "show / hide PRs you've approved" },
  { key: "d", label: "show / hide your draft PRs" },
  { key: "/", label: "filter by title, repo or author", footer: "filter" },
  { key: "esc", label: "clear filter" },
  { key: "r", label: "refresh", footer: "refresh" },
  { key: "?", label: "toggle this help", footer: "help" },
  { key: "q", label: "quit", footer: "quit" },
]

const FOOTER = KEYS.filter((k) => k.footer).map((k) => [k.footerKey ?? k.key.split(" ")[0], k.footer!])

const FOOTER_DROP_ORDER = ["r", "f", "/", "j/k", "1/2", "a", "d"]

function footer(optional: Optional, shown: boolean, count: number, width: number) {
  const toggle = [optional.key, `${shown ? "hide" : "show"} ${optional.noun}`]
  let items = count ? [...FOOTER.slice(0, 4), toggle, ...FOOTER.slice(4)] : FOOTER
  const length = () => items.reduce((sum, [key, label]) => sum + key.length + label.length + 3, -2)
  for (const key of FOOTER_DROP_ORDER) {
    if (length() <= width) break
    items = items.filter(([k]) => k !== key)
  }
  return items
}

const CHECK_COLOR = { SUCCESS: C.green, FAILURE: C.red, ERROR: C.red, PENDING: C.amber, EXPECTED: C.amber }

const STALE_MS = 30_000

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  for (const [unit, size] of [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]] as const) {
    if (s >= size) return `${Math.floor(s / size)}${unit} ago`
  }
  return "just now"
}

function matches(row: Row, query: string) {
  const needle = query.toLowerCase()
  return [row.title, `${row.repo}#${row.number}`, row.author].some((field) => field.toLowerCase().includes(needle))
}

function visibleGroups(inbox: Inbox | null, page: number, query: string, shown: Set<GroupId>) {
  if (!inbox) return []
  return PAGES[page].groups.filter((g) => shown.has(g.id) || g.id !== PAGES[page].optional.id)
    .map((g) => ({ ...g, rows: inbox.groups[g.id].filter((row) => matches(row, query)) }))
    .filter((g) => !query || g.rows.length)
}

function fit(parts: string[], width: number) {
  for (let n = parts.length; n > 1; n--) {
    const title = ` ${parts.slice(0, n).join(" · ")} `
    if (title.length <= width) return title
  }
  return ` ${parts[0]} `.slice(0, width)
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <span bg={C.match} fg={C.fg}>{text.slice(at, at + query.length)}</span>
      {text.slice(at + query.length)}
    </>
  )
}

function Modal({ screen, size, title, children }: {
  screen: { width: number; height: number }
  size: { width: number; height: number }
  title: string
  children: React.ReactNode
}) {
  const width = Math.min(screen.width - 4, size.width)
  return (
    <box position="absolute" zIndex={10} left={Math.max(0, Math.floor((screen.width - width) / 2))}
      top={Math.max(0, Math.floor((screen.height - size.height) / 2))} width={width} height={size.height}
      flexDirection="column" border borderStyle="rounded" borderColor={C.accent} backgroundColor="#0d1117"
      paddingLeft={2} paddingRight={2} paddingTop={1} title={` ${title} `} titleAlignment="center">
      {children}
    </box>
  )
}

function Help({ screen }: { screen: { width: number; height: number } }) {
  const keyWidth = Math.max(...KEYS.map((k) => k.key.length))
  return (
    <Modal screen={screen} size={{ width: keyWidth + 40, height: KEYS.length + 4 }} title="keys">
      {KEYS.map((k) => (
        <text key={k.key} wrapMode="none" truncate>
          <span fg={C.accent}>{k.key.padEnd(keyWidth + 3)}</span>
          <span fg={C.fg}>{k.label}</span>
        </text>
      ))}
    </Modal>
  )
}

function ConfirmWeb({ screen }: { screen: { width: number; height: number } }) {
  return (
    <Modal screen={screen} size={{ width: 54, height: 8 }} title="web view">
      <text fg={C.fg}>Start the web view server in the background?</text>
      <text fg={C.muted}>It stops when you quit the TUI.</text>
      <text marginTop={1}>
        <span fg={C.accent}>y</span><span fg={C.muted}> start and open   </span>
        <span fg={C.accent}>n</span><span fg={C.muted}> cancel</span>
      </text>
    </Modal>
  )
}

function PrRow({ row, selected, query, group }: { row: Row; selected: boolean; query: string; group: Group }) {
  const when = row.draftUpdatedAt ? `draft updated ${ago(row.draftUpdatedAt)}` : `updated ${ago(row.updatedAt)}`
  return (
    <box id={row.key} paddingLeft={1} paddingRight={1} backgroundColor={selected ? C.selected : undefined}>
      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text fg={selected ? C.accent : group.quiet ? C.muted : C.fg} flexShrink={1} wrapMode="none" truncate>
          <span fg={row.isDraft ? C.muted : C.green}>{row.isDraft ? "◌ " : "● "}</span>
          <strong><Highlighted text={row.title} query={query} /></strong>
        </text>
        <text flexShrink={0}>
          {row.draftComments !== null ? <span fg={C.accent}>{`${row.draftComments} draft  `}</span> : null}
          {row.reviewDecision === "APPROVED" && !group.decided ? <span fg={C.green}>approved  </span> : null}
          {row.reviewDecision === "CHANGES_REQUESTED" ? <span fg={C.red}>changes requested  </span> : null}
          <span fg={C.green}>{`+${row.additions} `}</span>
          <span fg={C.red}>{`-${row.deletions}`}</span>
          {row.checks ? <span fg={CHECK_COLOR[row.checks]}> ●</span> : null}
        </text>
      </box>
      <text fg={C.muted} wrapMode="none" truncate>
        {"  "}
        <Highlighted text={`${row.repo}#${row.number}`} query={query} />
        {group.id.startsWith("mine") ? null : <>{" · "}<Highlighted text={row.author} query={query} /></>}
        {` · ${when}`}
      </text>
    </box>
  )
}

export function App({ load, open, web }: { load: () => Promise<Inbox>; open: (url: string) => void; web: () => void }) {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const scroll = useRef<ScrollBoxRenderable>(null)
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [query, setQuery] = useState("")
  const [filtering, setFiltering] = useState(false)
  const [help, setHelp] = useState(false)
  const [confirmWeb, setConfirmWeb] = useState(false)
  const [serving, setServing] = useState(false)
  const [shown, setShown] = useState<Set<GroupId>>(new Set())
  const [page, setPage] = useState(0)
  const [, tick] = useState(0)
  const inFlight = useRef(false)
  const lastFetch = useRef(0)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      setInbox(await load())
      setError(null)
      lastFetch.current = Date.now()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [load])

  useEffect(() => {
    refresh()
    const timer = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [refresh])

  useFocus(() => {
    if (Date.now() - lastFetch.current > STALE_MS) refresh()
  })

  const groups = visibleGroups(inbox, page, query, shown)
  const optional = PAGES[page].optional
  const list = groups.flatMap((g) => g.rows)
  const index = Math.min(cursor, list.length - 1)
  const current = list[index]

  useEffect(() => {
    if (!current) return
    if (index === 0) scroll.current?.scrollTo(0)
    else if (index === list.length - 1) scroll.current?.scrollTo(Infinity)
    else scroll.current?.scrollChildIntoView(current.key, { align: "nearest", inset: 1 })
  }, [current?.key])

  const move = (delta: number) => setCursor((c) => Math.max(0, Math.min(c + delta, list.length - 1)))

  const wheel = (event: MouseEvent) => {
    event.stopPropagation()
    if (event.scroll?.direction === "down") move(1)
    else if (event.scroll?.direction === "up") move(-1)
  }

  const turn = (next: number) => {
    setPage(next)
    setCursor(0)
  }

  const filter = (value: string) => {
    setQuery(value)
    setCursor(0)
  }

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") renderer.destroy()
    else if (filtering) {
      if (key.name === "escape") {
        filter("")
        setFiltering(false)
      }
    }
    else if (confirmWeb) {
      if (key.name === "y") {
        web()
        setServing(true)
        setConfirmWeb(false)
      }
      else if (key.name === "n" || key.name === "escape") setConfirmWeb(false)
    }
    else if (help) {
      if (key.name === "escape" || key.name === "q" || key.sequence === "?") setHelp(false)
    }
    else if (key.sequence === "?") setHelp(true)
    else if (key.name === "escape") filter("")
    else if (key.name === "/" || key.sequence === "/") setFiltering(true)
    else if (key.name === "q") renderer.destroy()
    else if (key.name === "j" || key.name === "down") move(1)
    else if (key.name === "k" || key.name === "up") move(-1)
    else if (key.name === "G" || (key.shift && key.name === "g")) setCursor(list.length - 1)
    else if (key.name === "g") setCursor(0)
    else if (key.name === "r") refresh()
    else if (key.name === "1" || key.name === "2") turn(Number(key.name) - 1)
    else if (key.name === "tab") turn((page + 1) % PAGES.length)
    else if (key.name === optional.key && !key.shift) setShown((set) => {
      const next = new Set(set)
      if (!next.delete(optional.id)) next.add(optional.id)
      return next
    })
    else if (key.shift && key.name === "w") serving ? web() : setConfirmWeb(true)
    else if ((key.name === "o" || key.name === "return") && current) open(current.url)
    else if (key.name === "f" && current) open(`${current.url}/files`)
  })

  const footerItems = footer(optional, shown.has(optional.id), inbox?.groups[optional.id].length ?? 0, width - 3)

  const status = loading
    ? inbox ? `refreshing… (last ${ago(inbox.fetchedAt)})` : "loading…"
    : inbox ? `${inbox.login} · ${ago(inbox.fetchedAt)}` : ""

  return (
    <box flexDirection="column" height={height} padding={1}>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1} flexShrink={0}>
        <text wrapMode="none">
          {PAGES.map((p, i) => (
            <span key={p.title}>
              <span fg={i === page ? C.accent : C.muted}>{`[${i + 1}] `}</span>
              {i === page ? <span fg={C.fg}><strong><u>{p.title}</u></strong></span> : <span fg={C.muted}>{p.title}</span>}
              <span fg={C.muted}>{inbox ? ` (${pageCount(inbox, i)})` : ""}{i < PAGES.length - 1 ? "   " : ""}</span>
            </span>
          ))}
        </text>
        <text fg={C.muted}>
          {list.length ? <span fg={C.fg}>{`${index + 1}/${list.length}  `}</span> : null}
          {status}
        </text>
      </box>
      {error ? <text fg={C.red} paddingLeft={1}>{error}</text> : null}
      <scrollbox ref={scroll} flexGrow={1} flexShrink={1} minHeight={0} marginTop={1} verticalScrollbarOptions={{ visible: false }}>
        <box flexDirection="column" onMouseScroll={wheel}>
        {inbox && !groups.length ? <text fg={C.muted} paddingLeft={1}>{`No pull requests match "${query}".`}</text> : null}
        {inbox
          ? groups.map((g) => {
              const rows = g.rows
              const hidden = g.id === optional.notice && !shown.has(optional.id) ? inbox.groups[optional.id].length : 0
              const toggle = g.id === optional.id ? `${optional.key} to hide` : hidden ? `${hidden} ${optional.noun} hidden, ${optional.key} to show` : ""
              const parts = [`${g.title} (${rows.length})`, toggle, g.hint].filter(Boolean)
              return (
                <box key={g.id} flexDirection="column" marginBottom={1} border borderStyle="rounded" borderColor={C.border}
                  title={fit(parts, width - 6)}>
                  {rows.length
                    ? rows.map((row) => <PrRow key={row.key} row={row} query={query} group={g} selected={row.key === current?.key} />)
                    : <text fg={C.muted} paddingLeft={1}>Nothing here.</text>}
                </box>
              )
            })
          : null}
        </box>
      </scrollbox>
      {filtering || query ? (
        <box flexShrink={0} border borderStyle="rounded" borderColor={filtering ? C.accent : C.border} flexDirection="row"
          paddingLeft={1} paddingRight={1} gap={1} title={filtering ? " filter " : undefined}>
          <text fg={filtering ? C.accent : C.muted}>/</text>
          {filtering ? (
            <input flexGrow={1} focused value={query} placeholder="title, repo, #number or author"
              placeholderColor={C.muted} textColor={C.fg} focusedTextColor={C.fg} onInput={filter}
              onSubmit={() => setFiltering(false)} />
          ) : (
            <text flexGrow={1} fg={C.accent}>{query}</text>
          )}
          <text fg={C.muted}>
            <span fg={query && !list.length ? C.red : C.fg}>{query ? `${list.length} match${list.length === 1 ? "" : "es"}` : `${list.length} PRs`}</span>
            {filtering ? "  enter keep · esc clear" : "  / edit · esc clear"}
          </text>
        </box>
      ) : (
        <text paddingLeft={1} flexShrink={0} wrapMode="none" truncate>
          {footerItems.map(([key, label], i) => (
            <span key={key}>
              <span fg={C.fg}>{key}</span>
              <span fg={C.muted}>{` ${label}${i < footerItems.length - 1 ? "  " : ""}`}</span>
            </span>
          ))}
        </text>
      )}
      {help ? <Help screen={{ width, height }} /> : null}
      {confirmWeb ? <ConfirmWeb screen={{ width, height }} /> : null}
    </box>
  )
}
