"use client";

import { nanoid } from "nanoid";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { OutlineItem } from "@/lib/types";

export function OutlineEditor({
  value,
  onChange,
}: {
  value: OutlineItem[];
  onChange: (next: OutlineItem[]) => void;
}) {
  function update(id: string, patch: Partial<OutlineItem>) {
    onChange(value.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((item, idx) => ({ ...item, chapterNumber: idx + 1 })));
  }
  function remove(id: string) {
    onChange(value.filter((x) => x.id !== id).map((item, idx) => ({ ...item, chapterNumber: idx + 1 })));
  }
  function add() {
    onChange([
      ...value,
      {
        id: nanoid(8),
        chapterNumber: value.length + 1,
        title: `Chapter ${value.length + 1}`,
        summary: "",
        purpose: "",
        historicalScope: "",
        researchQuestion: "",
        researchQuestions: [],
        keyTopics: [],
        primarySources: [],
        secondarySources: [],
        claimsToVerify: [],
        uncertaintyNotes: "",
        evidenceVsInterpretation: "",
        sourceIds: [],
      },
    ]);
  }

  return (
    <div className="space-y-3">
      {value.map((item, i) => (
        <article key={item.id} className="rounded-xl border border-paper-300 bg-paper-50 p-3">
          <div className="flex items-start gap-2">
            <span className="mt-2 text-xs text-gold-500">{String(item.chapterNumber || i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <input
                className="field !py-1.5"
                value={item.title}
                onChange={(e) => update(item.id, { title: e.target.value })}
                placeholder="Chapter title"
              />
              <textarea
                className="field !py-1.5 text-sm"
                rows={2}
                value={item.summary}
                onChange={(e) => update(item.id, { summary: e.target.value, purpose: e.target.value })}
                placeholder="Purpose / summary"
              />
              <textarea
                className="field !py-1.5 text-sm"
                rows={2}
                value={item.historicalScope || ""}
                onChange={(e) => update(item.id, { historicalScope: e.target.value })}
                placeholder="Precise historical scope"
              />
              <input
                className="field !py-1.5 text-sm"
                value={(item.keyTopics || []).join(", ")}
                onChange={(e) =>
                  update(item.id, {
                    keyTopics: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Key topics (comma separated)"
              />
              <input
                className="field !py-1.5 text-sm"
                value={item.researchQuestion || (item.researchQuestions || []).join(" | ")}
                onChange={(e) =>
                  update(item.id, {
                    researchQuestion: e.target.value,
                    researchQuestions: e.target.value
                      .split("|")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Research question"
              />
              <textarea
                className="field !py-1.5 text-sm"
                rows={2}
                value={(item.primarySources || []).join("\n")}
                onChange={(e) =>
                  update(item.id, {
                    primarySources: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Primary sources to investigate (one per line)"
              />
              <textarea
                className="field !py-1.5 text-sm"
                rows={2}
                value={(item.secondarySources || []).join("\n")}
                onChange={(e) =>
                  update(item.id, {
                    secondarySources: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Scholarly / secondary sources (one per line)"
              />
              <textarea
                className="field !py-1.5 text-sm"
                rows={2}
                value={(item.claimsToVerify || item.importantClaims || []).join("\n")}
                onChange={(e) =>
                  update(item.id, {
                    claimsToVerify: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    importantClaims: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Major claims requiring verification (one per line)"
              />
              <textarea
                className="field !py-1.5 text-sm"
                rows={2}
                value={item.uncertaintyNotes || ""}
                onChange={(e) => update(item.id, { uncertaintyNotes: e.target.value })}
                placeholder="Uncertainty / controversy notes"
              />
              <textarea
                className="field !py-1.5 text-sm"
                rows={2}
                value={item.evidenceVsInterpretation || ""}
                onChange={(e) => update(item.id, { evidenceVsInterpretation: e.target.value })}
                placeholder="Evidence vs interpretation (A established / B scholarly / C Ambedkar / D hypothesis / E disputed)"
              />
            </div>
            <div className="flex flex-col gap-1">
              <button className="btn-ghost !px-2 !py-1" onClick={() => move(i, -1)} aria-label="Move up" type="button">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button className="btn-ghost !px-2 !py-1" onClick={() => move(i, 1)} aria-label="Move down" type="button">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button className="btn-ghost !px-2 !py-1 text-unsupported" onClick={() => remove(item.id)} type="button">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </article>
      ))}
      <button type="button" className="btn-ghost" onClick={add}>
        <Plus className="h-4 w-4" /> Add chapter
      </button>
    </div>
  );
}
