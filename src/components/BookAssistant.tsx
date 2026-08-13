"use client";

import { useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { api } from "@/lib/client";
import type { EbookDocument } from "@/lib/types";

const EXAMPLES = [
  "Chapter 3 छोटा करो",
  "और historical evidence जोड़ो",
  "भाषा आसान करो",
  "एक timeline जोड़ो",
  "cover बदलो",
  "पूरी किताब fact-check करो",
];

export function BookAssistant({
  ebookId,
  onUpdate,
}: {
  ebookId: string;
  onUpdate: (doc: EbookDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ role: "you" | "folio"; text: string }[]>([]);

  async function send(message: string) {
    const msg = message.trim();
    if (!msg || busy) return;
    setText("");
    setLog((l) => [...l, { role: "you", text: msg }]);
    setBusy(true);
    try {
      const data = await api(`/api/ebooks/${ebookId}/assistant`, {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      });
      if (data.ebook) onUpdate(data.ebook);
      setLog((l) => [...l, { role: "folio", text: data.message || "हो गया।" }]);
    } catch (e: any) {
      setLog((l) => [...l, { role: "folio", text: e.message || "यह बदलाव अभी नहीं हो सका।" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="assistant-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label="Book assistant"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
      {open && (
        <div className="assistant-panel paper-card">
          <p className="font-display text-lg">आप किताब में क्या बदलना चाहते हैं?</p>
          <div className="mt-3 max-h-48 space-y-2 overflow-auto text-sm">
            {log.map((m, i) => (
              <p key={i} className={m.role === "you" ? "text-ink-700" : "text-ink-400"}>
                <strong>{m.role === "you" ? "आप" : "Folio"}:</strong> {m.text}
              </p>
            ))}
            {busy && <p className="text-ink-300">लागू हो रहा है…</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip" onClick={() => send(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              className="field flex-1"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="जैसे: Chapter 4 को आसान हिंदी में लिखो"
            />
            <button className="btn-gold !px-3 min-h-[48px]" disabled={busy} type="submit">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
