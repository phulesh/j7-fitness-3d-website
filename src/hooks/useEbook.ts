"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ensureSession } from "@/lib/client";
import type { EbookDocument, EbookSettings, OutlineItem } from "@/lib/types";

export type SaveState = "idle" | "saving" | "saved" | "failed";
export type LoadState = "idle" | "loading" | "success" | "error";

export function useEbook(ebookId: string) {
  const [doc, setDoc] = useState<EbookDocument | null>(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [busy, setBusy] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(ebookId);
  idRef.current = ebookId;

  const load = useCallback(async () => {
    setLoadState("loading");
    setError("");
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out while opening this ebook. Please retry.")), 20000)
    );
    try {
      await ensureSession();
      const data = await Promise.race([api(`/api/ebooks/${idRef.current}`), timeout]);
      if (!data?.ebook) throw new Error("That ebook could not be found. Open My Ebooks and select the volume again.");
      setDoc(data.ebook);
      setLoadState("success");
      return data.ebook as EbookDocument;
    } catch (e: any) {
      setError(e.message || "Failed to load ebook");
      setLoadState("error");
      throw e;
    }
  }, []);

  useEffect(() => {
    setDoc(null);
    setLoadState("loading");
    load().catch(() => {});
  }, [ebookId, load]);

  useEffect(() => {
    if (!doc) return;
    if (["analyzing", "researching", "outlining", "writing", "fact_checking"].includes(doc.status)) {
      const t = setInterval(() => load().catch(() => {}), 1400);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.status, load]);

  const patch = useCallback(async (body: Record<string, unknown>, opts: { silent?: boolean } = {}) => {
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
  }, []);

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

  return {
    doc,
    setDoc,
    error,
    setError,
    saveState,
    setSaveState,
    busy,
    setBusy,
    load,
    patch,
    autosaveSettings,
    loadState,
    loading: loadState === "loading" && !doc,
  };
}

export function useStatusPoll(ebookId: string | null, enabled: boolean) {
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");

  useEffect(() => {
    if (!ebookId || !enabled) return;
    let stop = false;
    setLoadState("loading");
    const tick = async () => {
      try {
        const data = await Promise.race([
          api(`/api/ebooks/${ebookId}/status`),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Status request timed out.")), 15000)),
        ]);
        if (!stop) {
          setStatus(data);
          setLoadState("success");
          setError("");
        }
      } catch (e: any) {
        if (!stop) {
          setError(e.message);
          setLoadState("error");
        }
      }
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [ebookId, enabled]);

  return { status, error, setError, loadState };
}

export type { OutlineItem };
