import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App, type Inbox } from "./app"

const script = new URL("../gh-review-inbox", import.meta.url).pathname

async function load(): Promise<Inbox> {
  const proc = Bun.spawn([script, "--json"], { stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(err.trim().split("\n").at(-1) || `gh review-inbox --json exited ${code}`)
  return JSON.parse(out)
}

function open(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
  Bun.spawn([command, url], { stdout: "ignore", stderr: "ignore" })
}

const servers: ReturnType<typeof Bun.spawn>[] = []

function web() {
  servers.push(Bun.spawn([script, "web"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }))
}

const SAVE_TERMINAL_TITLE = "\x1b[22;2t"
const RESTORE_TERMINAL_TITLE = "\x1b[23;2t"

process.stdout.write(SAVE_TERMINAL_TITLE)
process.on("exit", () => {
  servers.forEach((server) => server.kill())
  process.stdout.write(RESTORE_TERMINAL_TITLE)
})

const renderer = await createCliRenderer({ exitOnCtrlC: false })
renderer.setTerminalTitle("Review inbox")
renderer.on("destroy", () => process.exit(0))
createRoot(renderer).render(<App load={load} open={open} web={web} />)
