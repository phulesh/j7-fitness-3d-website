"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, BookOpen, Box, ZoomIn, ZoomOut, List } from "lucide-react";
import type { BookPage } from "@/lib/book/pages";
import { ReadingView } from "./ReadingView";
import type { EbookDocument } from "@/lib/types";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = "";
  let yy = y;
  let used = 0;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineHeight;
      used++;
      if (used >= maxLines) return;
    } else line = test;
  }
  if (line && used < maxLines) ctx.fillText(line, x, yy);
}

function pageTexture(page: BookPage, coverSvg?: string): THREE.CanvasTexture {
  const w = 768;
  const h = 1152;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FBF6EC";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(28,20,16,0.03)";
  for (let i = 0; i < 40; i++) ctx.fillRect(0, i * 30, w, 1);
  ctx.strokeStyle = "#E0D5C5";
  ctx.strokeRect(28, 28, w - 56, h - 56);

  if (page.kind === "cover") {
    ctx.fillStyle = "#2A1C16";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#D4BC6E";
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 36, w - 72, h - 72);
    ctx.fillStyle = "#D4BC6E";
    ctx.font = "20px Georgia, 'Noto Sans Devanagari', serif";
    ctx.fillText("FOLIO  ·  RESEARCH", 72, 120);
    ctx.fillStyle = "#F6F0E6";
    ctx.font = "bold 48px Georgia, 'Noto Sans Devanagari', serif";
    wrapLines(ctx, page.title, 72, 280, w - 144, 58, 5);
    const plain = page.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    ctx.fillStyle = "#C4B09A";
    ctx.font = "22px Georgia, 'Noto Sans Devanagari', serif";
    wrapLines(ctx, plain.slice(page.title.length).trim(), 72, 620, w - 144, 32, 6);
    if (coverSvg) {
      try {
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coverSvg)}`;
      } catch {
        /* canvas fallback already drawn */
      }
    }
  } else {
    ctx.fillStyle = "#9A7B2F";
    ctx.font = "16px Figtree, system-ui, sans-serif";
    ctx.fillText(page.kind.toUpperCase(), 64, 80);
    ctx.fillStyle = "#1C1410";
    ctx.font = "bold 32px Georgia, 'Noto Sans Devanagari', serif";
    wrapLines(ctx, page.title, 64, 130, w - 128, 40, 3);
    const body = page.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    ctx.font = "22px 'Noto Sans Devanagari', Georgia, serif";
    ctx.fillStyle = "#2A1F18";
    wrapLines(ctx, body, 64, 260, w - 128, 32, 24);
    ctx.fillStyle = "#8A7560";
    ctx.font = "14px system-ui";
    ctx.fillText(page.pageLabel, w / 2 - 10, h - 48);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function BookMesh({
  pages,
  leaf,
  turning,
  coverSvg,
}: {
  pages: BookPage[];
  leaf: number;
  turning: number;
  coverSvg?: string;
}) {
  const left = pages[Math.max(0, leaf)] || pages[0];
  const right = pages[Math.min(pages.length - 1, leaf + 1)] || left;
  const flip = pages[Math.min(pages.length - 1, leaf + 1)];
  const leftTex = useMemo(() => pageTexture(left, coverSvg), [left, coverSvg]);
  const rightTex = useMemo(() => pageTexture(right, coverSvg), [right, coverSvg]);
  const flipTex = useMemo(() => pageTexture(flip || right, coverSvg), [flip, right, coverSvg]);
  const group = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, 0.12, 3, dt);
  });

  const angle = turning * Math.PI;
  const thickness = Math.min(0.28, 0.06 + pages.length * 0.004);

  return (
    <group ref={group} rotation={[0.08, 0.18, 0]} position={[0, 0.05, 0]}>
      <mesh position={[-0.62, 0, 0]} castShadow>
        <boxGeometry args={[0.08, 1.86, thickness + 0.04]} />
        <meshStandardMaterial color="#3B241C" roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, -thickness / 2 - 0.01]} castShadow>
        <boxGeometry args={[1.22, 1.84, 0.02]} />
        <meshStandardMaterial color="#2A1C16" roughness={0.5} />
      </mesh>
      <mesh position={[-0.02, 0, 0.01]} rotation={[0, 0, 0]}>
        <planeGeometry args={[1.16, 1.76]} />
        <meshStandardMaterial map={leftTex} roughness={0.85} />
      </mesh>
      <mesh position={[0.02, 0, 0.012]} rotation={[0, -angle, 0]}>
        <planeGeometry args={[1.16, 1.76]} />
        <meshStandardMaterial map={turning > 0.02 ? flipTex : rightTex} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, thickness / 2 + 0.015]} rotation={[0, Math.PI, 0]} castShadow>
        <planeGeometry args={[1.22, 1.84]} />
        <meshStandardMaterial color="#7A2E3A" roughness={0.45} />
      </mesh>
    </group>
  );
}

export function Book3D({
  ebookId,
  doc,
  pages,
  coverSvg,
}: {
  ebookId: string;
  doc: EbookDocument;
  pages: BookPage[];
  coverSvg?: string;
}) {
  const [leaf, setLeaf] = useState(0);
  const [turning, setTurning] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [mode, setMode] = useState<"3d" | "read">("3d");
  const [webgl, setWebgl] = useState(true);
  const [toc, setToc] = useState(false);
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const host = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    setWebgl(hasWebGL());
  }, []);

  useEffect(() => {
    if (!full || !host.current) return;
    const el = host.current;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [full]);

  function turn(dir: 1 | -1) {
    const next = Math.min(pages.length - 1, Math.max(0, leaf + dir * 2));
    if (next === leaf) return;
    setTurning(0.02);
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 420);
      setTurning(dir > 0 ? p : 1 - p);
      if (p < 1) requestAnimationFrame(tick);
      else {
        setLeaf(next);
        setTurning(0);
      }
    };
    requestAnimationFrame(tick);
  }

  const lowMem = typeof navigator !== "undefined" && ((navigator as any).deviceMemory || 8) <= 2;

  if (!webgl || mode === "read") {
    return (
      <div>
        <Toolbar
          leaf={leaf}
          total={pages.length}
          zoom={zoom}
          setZoom={setZoom}
          full={full}
          setFull={setFull}
          mode={mode}
          setMode={setMode}
          onPrev={() => turn(-1)}
          onNext={() => turn(1)}
          onToc={() => setToc((v) => !v)}
          webgl={webgl}
        />
        <ReadingView doc={doc} initialChapter={Math.max(0, pages[leaf]?.chapterIndex || 0)} />
      </div>
    );
  }

  return (
    <div ref={host} className={`relative ${full ? "fixed inset-0 z-50 bg-[#1C1410]" : ""}`}>
      <Toolbar
        leaf={leaf}
        total={pages.length}
        zoom={zoom}
        setZoom={setZoom}
        full={full}
        setFull={setFull}
        mode={mode}
        setMode={setMode}
        onPrev={() => turn(-1)}
        onNext={() => turn(1)}
        onToc={() => setToc((v) => !v)}
        webgl={webgl}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="relative"><span className="sr-only">Search inside book</span><input className="field !w-52 !py-2" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Search inside book" onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) { const hit = pages.find((p) => `${p.title} ${p.html}`.toLowerCase().includes(query.toLowerCase())); if (hit) setLeaf(hit.index - (hit.index % 2)); } }} /></label>
        <button className="btn-ghost !py-2" onClick={() => setBookmarks((items) => items.includes(leaf) ? items.filter((x) => x !== leaf) : [...items, leaf])}>{bookmarks.includes(leaf) ? "★ Bookmarked" : "☆ Bookmark"}</button>
      </div>
      {toc && (
        <div className="absolute left-3 top-28 z-10 max-h-[60vh] w-64 overflow-auto rounded-xl bg-paper-100/95 p-3 text-sm shadow-soft">
          {pages
            .filter((p, i) => p.kind !== "blank" && (i === 0 || p.title !== pages[i - 1]?.title))
            .map((p) => (
              <button
                key={p.index}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left hover:bg-paper-200"
                onClick={() => {
                  setLeaf(p.index - (p.index % 2));
                  setToc(false);
                }}
              >
                {p.title || p.kind}
              </button>
            ))}
        </div>
      )}
      <div
        className={`${full ? "h-[calc(100vh-64px)]" : "h-[min(72vh,640px)]"} w-full touch-none`}
        onTouchStart={(e) => {
          touchX.current = e.changedTouches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (dx < -40) turn(1);
          if (dx > 40) turn(-1);
          touchX.current = null;
        }}
      >
        <Canvas
          shadows={!lowMem}
          dpr={lowMem ? [1, 1.2] : [1, 1.75]}
          camera={{ position: [0, 0.15, 3.1 / zoom], fov: 38 }}
          gl={{ antialias: !lowMem, powerPreference: "high-performance" }}
        >
          <color attach="background" args={[full ? "#120D0A" : "#EDE4D4"]} />
          <ambientLight intensity={0.7} />
          <directionalLight position={[3, 4, 5]} intensity={1.15} castShadow />
          <directionalLight position={[-3, 2, 2]} intensity={0.35} color="#E0C56E" />
          <Suspense fallback={null}>
            <BookMesh pages={pages} leaf={leaf} turning={turning} coverSvg={coverSvg} />
            {!lowMem && <ContactShadows position={[0, -1.05, 0]} opacity={0.35} scale={8} blur={2.4} />}
          </Suspense>
          <OrbitControls enablePan={false} minDistance={1.6} maxDistance={5.4} maxPolarAngle={Math.PI / 1.7} />
        </Canvas>
      </div>
      <p className="sr-only">3D book for ebook {ebookId}</p>
      <PageFigures pages={pages} leaf={leaf} />
    </div>
  );
}

function PageFigures({ pages, leaf }: { pages: BookPage[]; leaf: number }) {
  const current = [pages[leaf], pages[leaf + 1]].filter(Boolean);
  const html = current.map((p) => p.html).join("\n");
  const srcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  if (!srcs.length) return null;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {srcs.slice(0, 4).map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" className="max-h-48 w-full rounded-lg object-contain bg-paper-50" />
      ))}
    </div>
  );
}

function Toolbar({
  leaf,
  total,
  zoom,
  setZoom,
  full,
  setFull,
  mode,
  setMode,
  onPrev,
  onNext,
  onToc,
  webgl,
}: {
  leaf: number;
  total: number;
  zoom: number;
  setZoom: (n: number) => void;
  full: boolean;
  setFull: (v: boolean) => void;
  mode: "3d" | "read";
  setMode: (m: "3d" | "read") => void;
  onPrev: () => void;
  onNext: () => void;
  onToc: () => void;
  webgl: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button className="btn-ghost !py-2 min-h-[44px]" onClick={onPrev} aria-label="Previous">
        <ChevronLeft className="h-4 w-4" /> Previous
      </button>
      <button className="btn-ghost !py-2 min-h-[44px]" onClick={onNext} aria-label="Next">
        Next <ChevronRight className="h-4 w-4" />
      </button>
      <span className="text-xs text-ink-400">
        {Math.min(total, leaf + 1)}–{Math.min(total, leaf + 2)} / {total}
      </span>
      <button className="btn-ghost !py-2" onClick={() => setZoom(Math.min(1.8, zoom + 0.15))} aria-label="Zoom in">
        <ZoomIn className="h-4 w-4" />
      </button>
      <button className="btn-ghost !py-2" onClick={() => setZoom(Math.max(0.7, zoom - 0.15))} aria-label="Zoom out">
        <ZoomOut className="h-4 w-4" />
      </button>
      <button className="btn-ghost !py-2" onClick={() => setFull(!full)}>
        {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} Fullscreen
      </button>
      <button className="btn-ghost !py-2" onClick={onToc}>
        <List className="h-4 w-4" /> Contents
      </button>
      <button className="btn-ghost !py-2" onClick={() => setMode("3d")} disabled={!webgl}>
        <Box className="h-4 w-4" /> 3D View
      </button>
      <button className="btn-ghost !py-2" onClick={() => setMode("read")}>
        <BookOpen className="h-4 w-4" /> Reading View
      </button>
    </div>
  );
}
