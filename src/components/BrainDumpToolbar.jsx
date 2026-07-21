import { useState, useEffect, useRef } from "react";

// Simple line-style SVG icons, single-color (inherits currentColor).
const ICONS = {
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 18C8 12 12 14 18 6" /><path d="M12 6h6v6" />
    </svg>
  ),
  board: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 9h16" />
    </svg>
  ),
  color: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
  column: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 4v16" />
    </svg>
  ),
  document: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M14 3.5V8h4M9 13h6M9 16.5h6" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.5" /><path d="M20 16l-5-5-9 9" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  text: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 6h14M5 12h14M5 18h9" />
    </svg>
  ),
  sketch: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l3.6-1 11-11a2 2 0 0 0-3-3l-11 11z" /><path d="M14 5l3 3" />
    </svg>
  ),
  table: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 3v18" />
    </svg>
  ),
  title: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5h14M12 5v14" />
    </svg>
  ),
};

const TOOLBAR_ITEMS = [
  { type: "arrow",    label: "Arrow"  },
  { type: "board",    label: "Board"  },
  { type: "color",    label: "Color"  },
  { type: "column",   label: "Column" },
  { type: "document", label: "Doc"    },
  { type: "image",    label: "Image"  },
  { type: "link",     label: "Link"   },
  { type: "list",     label: "List"   },
  { type: "text",     label: "Note"   },
  { type: "sketch",   label: "Sketch" },
  { type: "table",    label: "Table"  },
  { type: "title",    label: "Title"  },
];

// Dispatch a custom event that BrainDumpCanvas listens for.
// Works across sibling components without prop threading.
function dispatchCardDrop(type, clientX, clientY) {
  window.dispatchEvent(
    new CustomEvent("bd-toolbar-drop", { detail: { type, clientX, clientY } })
  );
}

function ToolbarItem({ type, label }) {
  const dragRef = useRef(null);
  const ghostRef = useRef(null);

  const startDrag = (clientX, clientY) => {
    dragRef.current = { type, startX: clientX, startY: clientY, moved: false, isPointer: true };

    // Create a floating ghost element that follows the pointer
    const ghost = document.createElement("div");
    ghost.style.cssText = `
      position: fixed; z-index: 9999; pointer-events: none;
      width: 56px; height: 56px;
      background: white; border-radius: 12px;
      border: 2px solid #a878d8;
      display: flex; align-items: center; justify-content: center;
      opacity: 0.9; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transform: translate(-50%, -50%);
      left: ${clientX}px; top: ${clientY}px;
    `;
    ghost.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.8">${
      document.querySelector(`[data-toolbar-type="${type}"] svg`)?.innerHTML || ""
    }</svg>`;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
  };

  const moveDrag = (clientX, clientY) => {
    if (!dragRef.current) return;
    dragRef.current.moved = true;
    if (ghostRef.current) {
      ghostRef.current.style.left = `${clientX}px`;
      ghostRef.current.style.top = `${clientY}px`;
    }
  };

  const endDrag = (clientX, clientY) => {
    if (!dragRef.current) return;
    const { moved } = dragRef.current;
    dragRef.current = null;
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
    if (moved) {
      dispatchCardDrop(type, clientX, clientY);
    }
  };

  return (
    <div
      data-toolbar-type={type}
      // HTML5 drag — desktop only. We suppress it when pointer drag is active.
      draggable
      onDragStart={(e) => {
        // If pointer-based drag already started, suppress HTML5 drag entirely
        if (dragRef.current?.isPointer) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/bd-card-type", type);
        e.dataTransfer.effectAllowed = "copy";
        // Mark as HTML5 drag so pointer events don't also fire a drop
        dragRef.current = { type, isPointer: false };
      }}
      onDragEnd={() => {
        dragRef.current = null;
      }}
      // Pointer events — touch/iOS. Suppress if HTML5 drag is active.
      onPointerDown={(e) => {
        // Only use pointer system for touch input
        // Mouse input is handled by HTML5 drag above
        if (e.pointerType === "mouse") return;
        e.currentTarget.setPointerCapture(e.pointerId);
        startDrag(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => { if (e.pointerType !== "mouse") moveDrag(e.clientX, e.clientY); }}
      onPointerUp={(e) => { if (e.pointerType !== "mouse") endDrag(e.clientX, e.clientY); }}
      onPointerCancel={(e) => { if (e.pointerType !== "mouse") endDrag(e.clientX, e.clientY); }}
      className="flex flex-col items-center justify-center gap-1 w-14 h-14 flex-shrink-0 rounded-xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 cursor-grab active:cursor-grabbing select-none hover:border-accent-400 dark:hover:border-accent-300 transition text-brand-600 dark:text-brand-300 touch-none"
      title={`Drag to add a ${label.toLowerCase()}`}
    >
      <span className="w-5 h-5 pointer-events-none">{ICONS[type]}</span>
      <span className="text-[7px] font-pixel pointer-events-none">{label}</span>
    </div>
  );
}

function BrainDumpToolbar({ onOpenUnsorted }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 160, behavior: "smooth" });
  };

  return (
    <div className="relative flex items-center max-w-[92vw]">
      {/* Left arrow — sits just inside the left edge, never off-screen */}
      {canScrollLeft && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => scroll(-1)}
          className="absolute left-1 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-white dark:bg-brand-800 shadow-md border border-brand-200 dark:border-brand-600 text-brand-500"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 1.5L2.5 4 5 6.5" />
          </svg>
        </button>
      )}

      {/* Scrollable toolbar */}
      <div
        ref={scrollRef}
        className="flex gap-2 px-3 py-2 bg-brand-100/90 dark:bg-brand-900/90 backdrop-blur-sm rounded-2xl border-2 border-brand-200 dark:border-brand-600 shadow-lg overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
      >
        {TOOLBAR_ITEMS.map(({ type, label }) => (
          <ToolbarItem key={type} type={type} label={label} />
        ))}
        {onOpenUnsorted && (
          <button
            onClick={onOpenUnsorted}
            className="flex flex-col items-center justify-center gap-1 w-14 h-14 flex-shrink-0 rounded-xl bg-accent-50 dark:bg-accent-900/30 border-2 border-accent-300 dark:border-accent-600 select-none hover:border-accent-500 dark:hover:border-accent-400 transition text-accent-600 dark:text-accent-300"
            title="Open unsorted items"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
            <span className="text-[6px] font-pixel leading-tight text-center">Unsorted</span>
          </button>
        )}
      </div>

      {/* Right arrow — sits just inside the right edge, never off-screen */}
      {canScrollRight && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => scroll(1)}
          className="absolute right-1 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-white dark:bg-brand-800 shadow-md border border-brand-200 dark:border-brand-600 text-brand-500"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 1.5L5.5 4 3 6.5" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default BrainDumpToolbar;
