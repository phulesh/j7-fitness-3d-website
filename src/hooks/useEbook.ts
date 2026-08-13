"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ensureSession } from "@/lib/client";
import type { EbookDocument, EbookSettings, OutlineItem } from "@/lib/types";

export type SaveState = "idle" | "saving" | "saved" | "failed";

export function useEbook(ebookId: string) {
  const [doc, setDoc] = useState<EbookDocument | null>(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(ebookId);
  idRef.current = ebookId;

  const load = useCallback(async () => {
    await ensureSession();
    const data = await api(`/api/ebooks/${idRef.current}`);
    setDoc(data.ebook);
    return data.ebook as EbookDocument;
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [ebookId, load]);

  useEffect(() => {
    if (!doc) return;
    if (["analyzing", "researching", "outlining", "writing", "fact_checking"].includes(doc.status)) {
      const t = setInterval(() => load().catch(() => {}), 1400);
      return () => clearInterval(t);
    }
  }, [doc?.status, load]);

  const patch = useCallback(
    async (body: Record<string, unknown>, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setSaveState("saving");
      try {
        const data = await api(`/api/ebooks/${idRef.current}`, { method: "PATCH", body: JSON.stringify(body) });
        setDoc(data.ebook);
        if (!opts.silent) {
          setSaveState("saved");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setSaveState("idle"), 1800);
        }
        return data.ebook as EbookDocument;
      } catch (e: any) {
        if (!opts.silent) setSaveState("failed");
        setError(e.message);
        throw e;
      }
    },
    []
  );

  const autosaveSettings = useCallback(
    (settings: EbookSettings) => {
      setDoc((d) => (d ? { ...d, settings } : d));
      if (timer.current) clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(() => {
        patch({ settings }).catch(() => {});
      }, 700);
    },
    [patch]
  );

  return { doc, setDoc, error, setError, saveState, setSaveState, busy, setBusy, load, patch, autosaveSettings };
}

export function useStatusPoll(ebookId: string | null, enabled: boolean) {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ebookId || !enabled) return;
    let stop = false;
    const tick = async () => {
      try {
        const data = await api(`/api/ebooks/${ebookId}/status`);
        if (!stop) setStatus(data);
      } catch (e: any) {
        if (!stop) setError(e.message);
      }
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [ebookId, enabled]);

  return { status, error, setError };
}

export type { OutlineItem };
