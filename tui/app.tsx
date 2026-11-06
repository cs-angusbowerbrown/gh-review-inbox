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

function entries(inbox: Inbox | null): Entry[] {
  if (!inbox) return []
  return GROUPS.flatMap((g) => inbox.groups[g.id].map((row) => ({ row, href: row.url + g.path })))
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

  const list = entries(inbox)
  const current = list[Math.min(cursor, list.length - 1)]

  useEffect(() => {
    if (current) scroll.current?.scrollChildIntoView(current.row.key)
  }, [current?.row.key])

  useKeyboard((key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) renderer.destroy()
    else if (key.name === "j" || key.name === "down") setCursor((c) => Math.min(c + 1, list.length - 1))
    else if (key.name === "k" || key.name === "up") setCursor((c) => Math.max(c - 1, 0))
    else if (key.name === "g") setCursor(0)
    else if (key.name === "G" || (key.shift && key.name === "g")) setCursor(list.length - 1)
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
        {inbox
          ? GROUPS.map((g) => {
              const rows = inbox.groups[g.id]
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
      <text fg={C.muted} paddingLeft={1}>j/k move · enter open files · o open PR · r refresh · q quit</text>
    </box>
  )
}
