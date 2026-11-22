"use client";
import { useState } from "react";
import { STATUS_LABEL, type MyCourse, type MyState } from "@/lib/mycourses";
import { diffImport, parseTranscript, type ImportDiff, type TranscriptImport } from "@/lib/transcript";
import Expandable from "./ui/Expandable";

type Preview = TranscriptImport & { diff: ImportDiff; replaces: string[] };
const key = (c: { s: string; n: string }) => `${c.s} ${c.n}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Paste the text of Self-Service's Academic History or a DARS audit (#20), check what was read, then apply it to My
 * courses. Read in the browser; the text is never sent or saved. `estimated` is the AP/IB credit worked out from
 * scores (lib/apcredit.ts): when the paste has its own test credit, the estimate's courses it doesn't list are switched
 * off, since the transcript is what the university actually granted.
 */
export default function TranscriptPaste({ st, update, estimated }: { st: MyState; update: (s: MyState) => void; estimated: MyCourse[] }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [keepEstimate, setKeepEstimate] = useState(false);
  const [done, setDone] = useState("");

  const read = () => {
    const r = parseTranscript(text);
    const listed = new Set(r.found.map(key));
    const replaces = r.testCredit ? estimated.map(key).filter((c) => !listed.has(c) && !st.declined.includes(c)) : [];
    setPreview({ ...r, diff: diffImport(r.found, st.courses), replaces });
    setSkip([]);
    setKeepEstimate(false);
    setDone("");
  };

  const apply = () => {
    if (!preview) return;
    const { adds, changes } = preview.diff;
    const on = (c: { s: string; n: string }) => !skip.includes(key(c));
    const status = new Map(changes.filter((c) => on(c.course)).map((c) => [key(c.course), c.course.status]));
    const added = adds.filter(on);
    const declined = keepEstimate ? st.declined : [...st.declined, ...preview.replaces];
    update({
      ...st,
      courses: [...st.courses.map((c) => (status.has(key(c)) ? { ...c, status: status.get(key(c))! } : c)), ...added.map(({ s, n, status: x }) => ({ s, n, status: x }))],
      declined,
    });
    const parts = [added.length && `added ${plural(added.length, "course")}`, status.size && `updated ${status.size}`, declined.length > st.declined.length && `switched off ${declined.length - st.declined.length} estimated AP/IB ${declined.length - st.declined.length === 1 ? "course" : "courses"}`].filter(Boolean);
    setDone(parts.length ? `Done: ${parts.join(", ")}.` : "Nothing to change.");
    setPreview(null);
    setText("");
  };

  const d = preview?.diff;
  const nChanges = d ? d.adds.length + d.changes.length : 0;
  const nProgress = d ? [...d.adds, ...d.changes.map((c) => c.course)].filter((c) => c.status === "in_progress").length : 0;
  const box = (id: string, label: React.ReactNode) => (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={!skip.includes(id)} onChange={(e) => setSkip(e.target.checked ? skip.filter((k) => k !== id) : [...skip, id])} />
      <span>{label}</span>
    </label>
  );
  return (
    <Expandable summary="Paste your transcript or DARS audit" buttonClassName="font-semibold text-action" className="text-sm" defaultOpen={false}>
      <div className="mt-2 space-y-2" data-testid="transcript-paste">
        <p className="text-muted">
          In Self-Service, open <strong>Academic History</strong> (the unofficial transcript) or run a <strong>DARS audit</strong>, select everything,
          copy it and paste it here. It&apos;s read in this browser and never sent anywhere or saved; only the courses you apply are kept, in My courses.
        </p>
        <textarea
          aria-label="Pasted transcript or DARS audit"
          className="h-32 w-full rounded border border-line bg-white px-2 py-1.5 text-base"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
        />
        <button type="button" disabled={!text.trim()} onClick={read} className="rounded border border-action px-3 py-1.5 font-semibold text-action hover:bg-action-tint disabled:opacity-50">
          Read courses
        </button>
        {done && <p role="status">{done}</p>}
        {preview && d && (
          <div className="space-y-3 rounded border border-line p-2" data-testid="transcript-preview">
            <p className="font-semibold text-heading" data-testid="transcript-summary">
              {preview.found.length === 0
                ? "No courses found. Copy the whole page, from the top, and paste it again."
                : `Adds ${d.adds.length}, updates ${d.changes.length}${nProgress ? ` (${nProgress} in progress)` : ""}${d.same.length ? `; ${d.same.length} already in My courses` : ""}.`}
            </p>
            {d.adds.length > 0 && (
              <div>
                <p className="font-semibold">Add</p>
                <ul className="space-y-1">
                  {d.adds.map((c) => (
                    <li key={key(c)}>
                      {box(
                        key(c),
                        <>
                          {key(c)} <span className="text-muted">· {STATUS_LABEL[c.status]}{c.term ? `, ${c.term}` : ""}{c.grade && c.status !== "in_progress" ? ` (${c.grade})` : ""}</span>
                        </>,
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.changes.length > 0 && (
              <div>
                <p className="font-semibold">Update</p>
                <ul className="space-y-1">
                  {d.changes.map(({ course: c, from }) => (
                    <li key={key(c)}>
                      {box(
                        key(c),
                        <>
                          {key(c)}: {STATUS_LABEL[from]} → {STATUS_LABEL[c.status]}
                        </>,
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.replaces.length > 0 && (
              <label className="flex items-start gap-2" data-testid="transcript-replaces">
                <input type="checkbox" checked={!keepEstimate} onChange={(e) => setKeepEstimate(!e.target.checked)} />
                <span>
                  Use the transcript&apos;s test credit instead of the AP/IB estimate: switch off {preview.replaces.join(", ")}, which the estimate gave but the
                  transcript doesn&apos;t list.
                </span>
              </label>
            )}
            {preview.skipped.length > 0 && (
              <div data-testid="transcript-skipped">
                <p>Not added:</p>
                <ul className="list-disc pl-5">
                  {preview.skipped.map((s) => (
                    <li key={`${s.code}-${s.term}-${s.grade}`}>
                      {s.code}
                      {s.term ? ` (${s.term})` : ""}: {s.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.unreadable.length > 0 && (
              <div data-testid="transcript-unreadable">
                <p>Couldn&apos;t read {preview.unreadable.length === 1 ? "this line" : "these lines"}. Add the course by hand if it counts:</p>
                <ul className="list-disc pl-5 font-mono text-xs">
                  {preview.unreadable.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {d.notListed.length > 0 && <p className="text-muted">Kept, though not in what you pasted: {d.notListed.join(", ")}.</p>}
            <button
              type="button"
              disabled={!nChanges && !preview.replaces.length}
              onClick={apply}
              className="rounded bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-dark disabled:opacity-50"
            >
              Apply to My courses
            </button>
          </div>
        )}
      </div>
    </Expandable>
  );
}
