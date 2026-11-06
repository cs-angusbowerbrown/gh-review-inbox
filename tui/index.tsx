import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App, type Inbox } from "./app"

const script = new URL("../gh-inbox", import.meta.url).pathname

async function load(): Promise<Inbox> {
  const proc = Bun.spawn([script, "--json"], { stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(err.trim().split("\n").at(-1) || `gh inbox --json exited ${code}`)
  return JSON.parse(out)
}

function open(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open"
  Bun.spawn([command, url], { stdout: "ignore", stderr: "ignore" })
}

const renderer = await createCliRenderer({ exitOnCtrlC: false })
renderer.on("destroy", () => process.exit(0))
createRoot(renderer).render(<App load={load} open={open} />)
