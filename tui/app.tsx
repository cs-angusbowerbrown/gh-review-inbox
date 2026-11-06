import type { ScrollBoxRenderable } from "@opentui/core"
import { useFocus, useKeyboard, useRenderer } from "@opentui/react"
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
  checks: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null
  draftComments: number | null
  draftUpdatedAt: string | null
}

export type GroupId = "drafts" | "requested" | "reviewed" | "mine"

export type Inbox = {
  login: string
  owners: string[]
  fetchedAt: string
  groups: Record<GroupId, Row[]>
}

const GROUPS: { id: GroupId; title: string; hint: string; path: string }[] = [
  { id: "drafts", title: "Drafts", hint: "started, not submitted", path: "/files" },
  { id: "requested", title: "Requested from you", hint: "not started", path: "/files" },
  { id: "reviewed", title: "Reviewed, still open", hint: "review submitted", path: "/files" },
  { id: "mine", title: "Your pull requests", hint: "", path: "" },
]

const C = {
  fg: "#f0f6fc",
  muted: "#9198a1",
  border: "#3d444d",
  selected: "#1f2a3a",
  accent: "#4493f8",
  green: "#3fb950",
  red: "#f85149",
  amber: "#d29922",
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

type Entry = { row: Row; href: string }

function matches(row: Row, query: string) {
  const needle = query.toLowerCase()
  return [row.title, `${row.repo}#${row.number}`, row.author].some((field) => field.toLowerCase().includes(needle))
}

function visibleGroups(inbox: Inbox | null, query: string) {
  if (!inbox) return []
  return GROUPS.map((g) => ({ ...g, rows: inbox.groups[g.id].filter((row) => matches(row, query)) }))
    .filter((g) => !query || g.rows.length)
}

function PrRow({ row, selected }: { row: Row; selected: boolean }) {
  const when = row.draftUpdatedAt ? `draft updated ${ago(row.draftUpdatedAt)}` : `updated ${ago(row.updatedAt)}`
  return (
    <box id={row.key} paddingLeft={1} paddingRight={1} backgroundColor={selected ? C.selected : undefined}>
      <box flexDirection="row" justifyContent="space-between" gap={2}>
        <text fg={selected ? C.accent : C.fg} flexShrink={1} wrapMode="none" truncate>
          <span fg={row.isDraft ? C.muted : C.green}>{row.isDraft ? "◌ " : "● "}</span>
          <strong>{row.title}</strong>
        </text>
        <text flexShrink={0}>
          {row.draftComments !== null ? <span fg={C.accent}>{`${row.draftComments} draft  `}</span> : null}
          {row.reviewDecision === "APPROVED" ? <span fg={C.green}>approved  </span> : null}
          {row.reviewDecision === "CHANGES_REQUESTED" ? <span fg={C.red}>changes requested  </span> : null}
          <span fg={C.green}>{`+${row.additions} `}</span>
          <span fg={C.red}>{`-${row.deletions}`}</span>
          {row.checks ? <span fg={CHECK_COLOR[row.checks]}> ●</span> : null}
        </text>
      </box>
      <text fg={C.muted} wrapMode="none" truncate>{`  ${row.repo}#${row.number} · ${row.author} · ${when}`}</text>
    </box>
  )
}

export function App({ load, open }: { load: () => Promise<Inbox>; open: (url: string) => void }) {
  const renderer = useRenderer()
  const scroll = useRef<ScrollBoxRenderable>(null)
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [query, setQuery] = useState("")
  const [filtering, setFiltering] = useState(false)
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

  const groups = visibleGroups(inbox, query)
  const list: Entry[] = groups.flatMap((g) => g.rows.map((row) => ({ row, href: row.url + g.path })))
  const current = list[Math.min(cursor, list.length - 1)]

  useEffect(() => {
    if (current) scroll.current?.scrollChildIntoView(current.row.key)
  }, [current?.row.key])

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
    else if (key.name === "escape") filter("")
    else if (key.name === "/" || key.sequence === "/") setFiltering(true)
    else if (key.name === "q") renderer.destroy()
    else if (key.name === "j" || key.name === "down") setCursor((c) => Math.min(c + 1, list.length - 1))
    else if (key.name === "k" || key.name === "up") setCursor((c) => Math.max(c - 1, 0))
    else if (key.name === "G" || (key.shift && key.name === "g")) setCursor(list.length - 1)
    else if (key.name === "g") setCursor(0)
    else if (key.name === "r") refresh()
    else if ((key.name === "return" || key.name === "enter") && current) open(current.href)
    else if (key.name === "o" && current) open(current.row.url)
  })

  const status = loading
    ? inbox ? `refreshing… (last ${ago(inbox.fetchedAt)})` : "loading…"
    : inbox ? `${inbox.login} · ${ago(inbox.fetchedAt)}` : ""

  return (
    <box flexDirection="column" flexGrow={1} padding={1}>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
        <text fg={C.fg}><strong>Review inbox</strong></text>
        <text fg={C.muted}>{status}</text>
      </box>
      {error ? <text fg={C.red} paddingLeft={1}>{error}</text> : null}
      <scrollbox ref={scroll} flexGrow={1} marginTop={1}>
        {inbox && !groups.length ? <text fg={C.muted} paddingLeft={1}>{`No pull requests match "${query}".`}</text> : null}
        {inbox
          ? groups.map((g) => {
              const rows = g.rows
              return (
                <box key={g.id} flexDirection="column" marginBottom={1} border borderStyle="rounded" borderColor={C.border}
                  title={` ${g.title} (${rows.length})${g.hint ? ` · ${g.hint}` : ""} `}>
                  {rows.length
                    ? rows.map((row) => <PrRow key={row.key} row={row} selected={row.key === current?.row.key} />)
                    : <text fg={C.muted} paddingLeft={1}>Nothing here.</text>}
                </box>
              )
            })
          : null}
      </scrollbox>
      {filtering ? (
        <box flexDirection="row" paddingLeft={1}>
          <text fg={C.fg}>/</text>
          <input flexGrow={1} focused value={query} onInput={filter} onSubmit={() => setFiltering(false)} />
        </box>
      ) : query ? (
        <text fg={C.muted} paddingLeft={1}>
          <span fg={C.accent}>{`/${query}`}</span>
          {`  ${list.length} match${list.length === 1 ? "" : "es"} · / edit · esc clear`}
        </text>
      ) : (
        <text fg={C.muted} paddingLeft={1}>j/k move · g/G top/bottom · / filter · enter open files · o open PR · r refresh · q quit</text>
      )}
    </box>
  )
}
