import type { Metadata } from "next";
import CopyButton from "@/components/CopyButton";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "Use it from your AI app",
  description: "Connect Claude Desktop, Claude Code or another MCP app to Illini Scheduler's course data: search courses, compare professors, find gen-eds and build schedules.",
};

const LINK = "text-action underline hover:text-action-dark";
const REPO = "https://github.com/kamransingri/illini-scheduler";

const ASK = [
  "Find me a 3-credit Humanities gen-ed that's also Non-Western, with a high GPA and open seats next term.",
  "Which CS 124 lectures are open, and who teaches them?",
  "Compare the professors for STAT 100 by GPA and Rate My Professors.",
  "Build me a schedule with CS 124, MATH 231 and RHET 105: nothing before 10am, Fridays off, and a lunch break.",
];

const TOOLS: [string, string][] = [
  ["Search courses", "by code, nickname, title words, subject, gen-ed, credit hours or average GPA, and professors by name"],
  ["Read a course", "its sections with CRNs, times, rooms, seats, restrictions and finals, and each professor's GPA and ratings"],
  ["Find gen-eds", "the courses that count for the gen-eds you name, ranked the way the gen-ed finder ranks them"],
  ["Build schedules", "the top conflict-free schedules for your courses and must-haves, each with a link that opens it here"],
];

function Command({ text, label }: { text: string; label: string }) {
  return (
    <div className="mt-2 rounded border border-line bg-panel p-3">
      <pre className="overflow-x-auto whitespace-pre text-sm">
        <code>{text}</code>
      </pre>
      <CopyButton text={text} label={label} className="mt-2" />
    </div>
  );
}

export default function AiPage() {
  const repo = getMeta()?.repo_url ?? REPO;
  const pkg = `${repo}/releases/latest/download/illini-scheduler-mcp.tgz`;
  const guide = `${repo}/blob/main/mcp/README.md`;
  const desktop = JSON.stringify({ mcpServers: { "illini-scheduler": { command: "npx", args: ["-y", pkg] } } }, null, 2);
  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-heading">Use it from your AI app</h1>
      <p className="mt-2">
        Connect Claude, or any other app that supports <a className={LINK} href="https://modelcontextprotocol.io">MCP</a>, to this site&apos;s data. It
        then answers from the same sections, seats, GPAs and ratings you see here instead of from memory, and builds schedules with the same builder.
        Try asking:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {ASK.map((q) => (
          <li key={q}>&ldquo;{q}&rdquo;</li>
        ))}
      </ul>

      <h2 className="mt-8 font-display text-xl font-bold text-heading">What it can do</h2>
      <ul className="mt-2 space-y-1">
        {TOOLS.map(([name, what]) => (
          <li key={name}>
            <strong>{name}</strong>: {what}.
          </li>
        ))}
      </ul>
      <p className="mt-2">
        It only reads the site&apos;s public data. It never registers you or changes anything, and the data can be out of date, so check sections, seats
        and restrictions in Course Explorer and Self-Service before you register.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-heading">Set it up</h2>
      <p className="mt-2">
        You need <a className={LINK} href="https://nodejs.org">Node.js</a> 20 or newer. Then add the server to your app.
      </p>
      <h3 className="mt-4 font-semibold text-heading">Claude Code</h3>
      <Command text={`claude mcp add illini-scheduler -- npx -y ${pkg}`} label="command" />
      <p className="mt-1 text-sm text-muted">
        On Windows (not WSL), put <code>cmd /c</code> before <code>npx</code>.
      </p>
      <h3 className="mt-4 font-semibold text-heading">Claude Desktop</h3>
      <p className="mt-1">
        Settings, then Developer, then <strong>Edit Config</strong>. Add this to the file and restart Claude Desktop:
      </p>
      <Command text={desktop} label="config" />
      <p className="mt-4">
        Other apps, options and versions are in the{" "}
        <a className={LINK} href={guide}>
          full setup guide
        </a>
        . Developers can also read the data directly: see the{" "}
        <a className={LINK} href={`${repo}/blob/main/docs/API.md`}>
          data API
        </a>
        .
      </p>
    </div>
  );
}
