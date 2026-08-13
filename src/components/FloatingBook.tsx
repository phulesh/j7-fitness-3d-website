"use client";

import { useState } from "react";

export function FloatingBook({
  title = "आपकी किताब",
  subtitle = "AI Research Press",
  author = "",
  coverSvg,
  size = "lg",
  floating = true,
  openOnHover = true,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  author?: string;
  coverSvg?: string;
  size?: "sm" | "md" | "lg";
  floating?: boolean;
  openOnHover?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dims =
    size === "sm"
      ? "w-[92px] h-[138px]"
      : size === "md"
        ? "w-[140px] h-[210px]"
        : "w-[min(220px,58vw)] h-[min(330px,87vw)]";

  return (
    <div className={`book-scene ${className}`}>
      <button
        type="button"
        aria-label={title}
        className={`book-3d ${dims} ${floating ? "book-float" : ""} ${open ? "is-open" : ""} ${
          openOnHover ? "can-open" : ""
        }`}
        onClick={() => openOnHover && setOpen((v) => !v)}
      >
        <span className="book-shadow-oval" />
        <span className="book-back" />
        <span className="book-pages" />
        <span className="book-page-edge" />
        <span className="book-spine" />
        <span className="book-cover">
          {coverSvg ? (
            <span
              className="book-cover-art"
              dangerouslySetInnerHTML={{
                __html: coverSvg.replace(/width="800" height="1200"/, 'viewBox="0 0 800 1200" width="100%" height="100%"'),
              }}
            />
          ) : (
            <span className="book-cover-inner">
              <span className="book-kicker">FOLIO</span>
              <span className="book-title">{title}</span>
              {subtitle ? <span className="book-sub">{subtitle}</span> : null}
              {author ? <span className="book-author">{author}</span> : null}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
