"use client";
import { useState } from "react";
import { ibLabel, pickIbYear, pickYear, scoreLabel, type ApScore, type ApTable, type IbScore } from "@/lib/apcredit";
import type { MyState } from "@/lib/mycourses";
import { detectKind, parseApScores, parseIbResults, type ScoreKind } from "@/lib/scoreimport";
import Expandable from "./ui/Expandable";

type Item = { key: string; label: string; was: string | null; ap?: ApScore; ib?: IbScore };
type Preview = { kind: ScoreKind; items: Item[]; unknown: string[]; notUsed: string[]; notes: string[] };

/** Paste the text of a College Board score page or IB results page, check what was read, then apply it to st.ap or st.ib. */
export default function ScorePaste({ st, update, table, ibTable }: { st: MyState; update: (s: MyState) => void; table: ApTable | null; ibTable: ApTable | null }) {
  const [text, setText] = useState("");
  const [pick, setPick] = useState<"auto" | ScoreKind>("auto");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [done, setDone] = useState("");
  const year = table ? pickYear(table, st.year) : null;
  const ibOwn = ibTable && year ? pickIbYear(ibTable, year) : null;
  const ibYear = ibOwn ?? ibTable?.years[0] ?? null;

  const read = () => {
    const kind = pick === "auto" ? detectKind(text) : pick;
    setSkip([]);
    setDone("");
    if (kind === "AP" && year) {
      const r = parseApScores(text, year);
      const exam = (id: string) => year.exams.find((e) => e.id === id);
      const items = r.found.map((a): Item => {
        const old = st.ap.find((x) => x.exam === a.exam);
        const same = old && old.score === a.score && old.sub === a.sub;
        return { key: a.exam, label: scoreLabel(exam(a.exam), a), was: old && !same ? scoreLabel(exam(a.exam), old) : null, ap: a };
      });
      setPreview({ kind, items, unknown: r.unknown, notUsed: [], notes: r.notes });
    } else if (kind === "IB" && ibYear) {
      const r = parseIbResults(text, ibYear);
      const exam = (id: string) => ibYear.exams.find((e) => e.id === id);
      const items = r.found.map((a): Item => {
        const old = st.ib.find((x) => x.exam === a.exam);
        const same = old && old.score === a.score && old.level === a.level;
        return { key: a.exam, label: ibLabel(exam(a.exam), a), was: old && !same ? ibLabel(exam(a.exam), old) : null, ib: a };
      });
      setPreview({ kind, items, unknown: r.unknown, notUsed: r.notUsed, notes: r.notes });
    }
  };

  const apply = () => {
    if (!preview) return;
    const keep = preview.items.filter((i) => !skip.includes(i.key));
    const ids = new Set(keep.map((i) => i.key));
    if (preview.kind === "AP") update({ ...st, ap: [...st.ap.filter((a) => !ids.has(a.exam)), ...keep.map((i) => i.ap!)] });
    else update({ ...st, ib: [...st.ib.filter((a) => !ids.has(a.exam)), ...keep.map((i) => i.ib!)] });
    setDone(`Added ${keep.length} ${preview.kind} ${keep.length === 1 ? "exam" : "exams"}.`);
    setPreview(null);
    setText("");
  };

  const n = preview?.items.length ?? 0;
  return (
    <Expandable summary="Paste your AP or IB scores" buttonClassName="font-semibold text-action" className="text-sm" defaultOpen={false}>
      <div className="mt-2 space-y-2" data-testid="score-paste">
        <p className="text-muted">
          Copy everything on your College Board score page or IB results page and paste it here. The text is read in this browser and never sent anywhere.
        </p>
        <textarea
          aria-label="Pasted scores"
          className="h-32 w-full rounded border border-line bg-white px-2 py-1.5 text-base"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPreview(null);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded border border-line bg-white px-2 py-1.5" aria-label="Score type" value={pick} onChange={(e) => setPick(e.target.value as "auto" | ScoreKind)}>
            <option value="auto">Detect AP or IB</option>
            <option value="AP">AP (College Board)</option>
            <option value="IB">IB results</option>
          </select>
          <button type="button" disabled={!text.trim() || !year} onClick={read} className="rounded border border-action px-3 py-1.5 font-semibold text-action hover:bg-action-tint disabled:opacity-50">
            Read scores
          </button>
        </div>
        {done && <p role="status">{done}</p>}
        {preview && (
          <div className="space-y-2 rounded border border-line p-2" data-testid="score-preview">
            <p className="font-semibold text-heading">
              {n} {preview.kind} {n === 1 ? "exam" : "exams"} found{preview.unknown.length ? `, ${preview.unknown.length} not recognised` : ""}
            </p>
            {preview.kind === "IB" && !ibOwn && ibTable && (
              <p>IB credit here starts with students entering in {ibTable.years[ibTable.years.length - 1]?.entering}. Your results are kept, but no credit is shown for your starting term.</p>
            )}
            <ul className="space-y-1">
              {preview.items.map((i) => (
                <li key={i.key}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={!skip.includes(i.key)} onChange={(e) => setSkip(e.target.checked ? skip.filter((k) => k !== i.key) : [...skip, i.key])} />
                    <span>
                      {i.label}
                      {i.was && <span className="text-muted"> (replaces {i.was})</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {preview.notes.map((t) => (
              <p key={t} className="text-muted">
                {t}
              </p>
            ))}
            {preview.unknown.length > 0 && (
              <div data-testid="score-unknown">
                <p>Not recognised. Add these with the form above if they give credit:</p>
                <ul className="list-disc pl-5">
                  {preview.unknown.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.notUsed.length > 0 && <p className="text-muted">Not used for credit: {preview.notUsed.join(", ")}.</p>}
            <button type="button" disabled={!n || skip.length === n} onClick={apply} className="rounded bg-action px-3 py-1.5 font-semibold text-white hover:bg-action-dark disabled:opacity-50">
              Apply
            </button>
          </div>
        )}
      </div>
    </Expandable>
  );
}
