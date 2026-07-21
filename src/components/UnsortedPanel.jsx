import { useState, useEffect, useRef, useCallback } from "react";
import { listenToUnsorted, updateUnsorted, deleteUnsorted } from "../lib/brainDump";

// ── Sketch constants & helpers (mirrors BrainDumpCanvas) ─────────────
const SKETCH_COLORS = ["#3c1968","#7c3aed","#1d4ed8","#15803d","#b45309","#dc2626","#9d174d","#374151","#000000"];
const CANVAS_W = 800;
const CANVAS_H = 600;

function renderStrokes(canvasEl, strokes, srcW, srcH) {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext("2d");
  const sx = canvasEl.width / (srcW || CANVAS_W);
  const sy = canvasEl.height / (srcH || CANVAS_H);
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of strokes || []) {
    if (!s?.points || s.points.length < 2) continue;
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width * Math.min(sx, sy);
    ctx.beginPath();
    ctx.moveTo(s.points[0].x * sx, s.points[0].y * sy);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x * sx, s.points[i].y * sy);
    ctx.stroke();
  }
}

// ── Inline sketch editor used when creating/editing an unsorted sketch ─
function UnsortedSketchEditor({ item, onClose }) {
  const canvasRef = useRef(null);
  const strokesRef = useRef((item.strokes || []).filter(s => s?.points));
  const undoStackRef = useRef([]);
  const currentRef = useRef(null);
  const [color, setColor] = useState(SKETCH_COLORS[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const [erasing, setErasing] = useState(false);
  const [, redraw] = useState(0);

  const repaint = useCallback(() => {
    renderStrokes(canvasRef.current, strokesRef.current, CANVAS_W, CANVAS_H);
  }, []);

  useEffect(() => { repaint(); }, [repaint]);

  const pt = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CANVAS_W, y: ((e.clientY - r.top) / r.height) * CANVAS_H };
  };

  const onDown = (e) => {
    e.preventDefault(); e.target.setPointerCapture(e.pointerId);
    currentRef.current = { color: erasing ? "#ffffff" : color, width: erasing ? lineWidth * 4 : lineWidth, points: [pt(e)] };
  };
  const onMove = (e) => {
    if (!currentRef.current) return;
    currentRef.current.points.push(pt(e));
    renderStrokes(canvasRef.current, [...strokesRef.current, currentRef.current], CANVAS_W, CANVAS_H);
  };
  const onUp = () => {
    if (!currentRef.current) return;
    const s = currentRef.current; currentRef.current = null;
    if (s.points.length > 1) {
      undoStackRef.current.push([...strokesRef.current]);
      strokesRef.current = [...strokesRef.current, s];
      repaint();
    }
  };
  const undo = () => {
    const prev = undoStackRef.current.pop();
    strokesRef.current = prev !== undefined ? prev : strokesRef.current.slice(0, -1);
    repaint(); redraw(n => n + 1);
  };
  const clear = () => {
    if (!confirm("Clear sketch?")) return;
    undoStackRef.current.push([...strokesRef.current]);
    strokesRef.current = []; repaint(); redraw(n => n + 1);
  };
  const save = () => {
    const clean = strokesRef.current.filter(s => s?.points?.length >= 2);
    updateUnsorted(item.id, { strokes: clean, sketchWidth: CANVAS_W, sketchHeight: CANVAS_H });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-brand-800 rounded-2xl w-full max-w-3xl flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2 border-b border-brand-100 dark:border-brand-600">
          <p className="text-xs font-pixel text-brand-600 dark:text-brand-300">QUICK SKETCH</p>
          <button onClick={onClose} className="text-brand-400 text-xl leading-none">&times;</button>
        </div>
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-brand-100 dark:border-brand-700 flex-wrap">
          <div className="flex gap-1">
            {SKETCH_COLORS.map(c => (
              <button key={c} onClick={() => { setColor(c); setErasing(false); }}
                className={`w-5 h-5 rounded-full border-2 ${color === c && !erasing ? "border-brand-600 scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <input type="range" min={1} max={12} value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))} className="w-20 accent-brand-600" />
          <button onClick={() => setErasing(e => !e)}
            className={`text-xs px-2 py-1 rounded-lg border ${erasing ? "bg-brand-600 text-white" : "border-brand-200 dark:border-brand-600 text-brand-500"}`}>
            Eraser
          </button>
          <button onClick={undo} className="text-xs px-2 py-1 rounded-lg border border-brand-200 dark:border-brand-600 text-brand-500">Undo</button>
          <button onClick={clear} className="text-xs px-2 py-1 rounded-lg border border-brand-200 dark:border-brand-600 text-brand-500">Clear</button>
          <button onClick={save} className="ml-auto text-xs px-3 py-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700">Save to Unsorted</button>
        </div>
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
          className="w-full bg-white touch-none"
          style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, cursor: erasing ? "cell" : "crosshair" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
    </div>
  );
}

// ── Preview of a single unsorted item ────────────────────────────────
function UnsortedItemPreview({ item }) {
  const canvasRef = useRef(null);
  const card = item.cardData || item; // support both new (cardData) and legacy items

  useEffect(() => {
    if ((item.type !== "sketch" && item.cardData?.type !== "sketch") || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2; canvas.height = rect.height * 2;
    const strokes = item.cardData?.strokes || item.strokes || [];
    const sw = item.cardData?.sketchWidth || item.sketchWidth;
    const sh = item.cardData?.sketchHeight || item.sketchHeight;
    renderStrokes(canvas, strokes, sw, sh);
  }, [item]);

  const type = item.cardData?.type || item.type;

  if (type === "sketch") {
    return <canvas ref={canvasRef} className="w-full rounded bg-white" style={{ aspectRatio: "4/3" }} />;
  }
  if (type === "text") {
    return (
      <p className="text-xs text-brand-600 dark:text-brand-300 whitespace-pre-wrap break-words line-clamp-4">
        {card.content || <span className="italic text-brand-300">Empty note</span>}
      </p>
    );
  }
  if (type === "title") {
    return <p className="text-sm font-bold text-brand-700 dark:text-brand-200 truncate">{card.content || "Untitled"}</p>;
  }
  if (type === "image") {
    return card.imageUrl
      ? <img src={card.imageUrl} alt="" className="w-full rounded object-cover max-h-24" />
      : <p className="text-xs text-brand-300 italic">Image</p>;
  }
  if (type === "link") {
    return (
      <div>
        {card.linkImage && <img src={card.linkImage} alt="" className="w-full rounded object-cover max-h-16 mb-1" />}
        <p className="text-xs font-medium text-brand-700 dark:text-brand-200 truncate">{card.linkTitle || card.linkUrl}</p>
        {card.linkDomain && <p className="text-[10px] text-brand-400 truncate">{card.linkDomain}</p>}
      </div>
    );
  }
  if (type === "list") {
    const items = card.listItems || [];
    return (
      <ul className="text-xs text-brand-600 dark:text-brand-300 space-y-0.5">
        {items.slice(0, 4).map((it, i) => (
          <li key={i} className="flex items-start gap-1 truncate">
            <span className="flex-shrink-0">{card.listMode === "todo" ? "☐" : "•"}</span>
            <span className="truncate">{it.text || <span className="italic text-brand-300">Empty</span>}</span>
          </li>
        ))}
        {items.length > 4 && <li className="text-brand-300 italic">+{items.length - 4} more</li>}
      </ul>
    );
  }
  if (type === "table") {
    const headers = card.tableData?.headers || [];
    return (
      <div className="text-xs text-brand-500 dark:text-brand-400">
        <span className="font-medium">Table</span>
        {headers.length > 0 && <span className="text-brand-300"> — {headers.join(", ")}</span>}
      </div>
    );
  }
  if (type === "document") {
    return (
      <div>
        {card.title && <p className="text-xs font-medium text-brand-700 dark:text-brand-200 truncate mb-0.5">{card.title}</p>}
        <p className="text-xs text-brand-500 dark:text-brand-400 line-clamp-3">{card.content || <span className="italic text-brand-300">Empty document</span>}</p>
      </div>
    );
  }
  if (type === "color") {
    return (
      <div className="w-full h-8 rounded" style={{ backgroundColor: card.color || "#a878d8" }} />
    );
  }
  if (type === "board") {
    return <p className="text-xs text-brand-500 italic">📋 Board: {card.content || "Untitled"}</p>;
  }
  // note (legacy)
  return (
    <p className="text-xs text-brand-600 dark:text-brand-300 whitespace-pre-wrap break-words line-clamp-4">
      {card.content || item.content || <span className="italic text-brand-300">Empty</span>}
    </p>
  );
}

// ── Main panel — slides in from the right, no backdrop so the canvas  ─
// ── stays fully visible and interactive behind it.                    ─
export { UnsortedSketchEditor };
export default function UnsortedPanel({ uid, onClose, onDropToCanvas }) {
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [sketchEditItem, setSketchEditItem] = useState(null);
  const [isMobile] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    if (!uid) return;
    return listenToUnsorted(uid, setItems);
  }, [uid]);

  const commitEdit = (id) => {
    updateUnsorted(id, { content: editDraft });
    setEditingId(null);
  };

  const handleItemPointerDown = (e, item) => {
    if (!onDropToCanvas) return;
    // Don't preventDefault — it causes the "locked" movement bug on iOS.
    // Use setPointerCapture instead so the pointer stays tracked.
    e.target.setPointerCapture(e.pointerId);

    const type = item.cardData?.type || item.type;
    const typeLabels = {
      text: "📝 Note", sketch: "✏️ Sketch", title: "🔤 Title",
      image: "🖼️ Image", link: "🔗 Link", list: "📋 List",
      table: "⊞ Table", document: "📄 Doc", color: "🎨 Color",
      board: "📋 Board", column: "▥ Column", note: "📝 Note",
    };
    const label = typeLabels[type] || type;

    const ghost = document.createElement("div");
    ghost.style.cssText = `
      position: fixed; z-index: 9999; pointer-events: none;
      padding: 6px 10px; border-radius: 8px;
      background: white; border: 2px solid #a878d8;
      font-size: 11px; color: #3c1968; opacity: 0.92;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      transform: translate(-50%, -50%);
      left: ${e.clientX}px; top: ${e.clientY}px;
      white-space: nowrap;
    `;
    ghost.textContent = label;
    document.body.appendChild(ghost);

    let fired = false; // prevent duplicate drops on iOS

    const move = (ev) => {
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
    };
    const end = (ev) => {
      e.target.releasePointerCapture(e.pointerId);
      e.target.removeEventListener("pointermove", move);
      e.target.removeEventListener("pointerup", end);
      e.target.removeEventListener("pointercancel", end);
      if (document.body.contains(ghost)) document.body.removeChild(ghost);
      if (!fired) {
        fired = true;
        onDropToCanvas(item, ev.clientX, ev.clientY);
      }
    };
    // Use the element (with pointer capture) not document, to avoid double-firing
    e.target.addEventListener("pointermove", move);
    e.target.addEventListener("pointerup", end);
    e.target.addEventListener("pointercancel", end);
  };

  return (
    <>
      {/* Sketch editor modal — opens on top of everything */}
      {sketchEditItem && (
        <UnsortedSketchEditor item={sketchEditItem} onClose={() => setSketchEditItem(null)} />
      )}

      {/* Slide-in panel — fixed to the right edge, no backdrop so the
          canvas behind stays visible and interactive.
          data-unsorted-panel lets the canvas drop handler detect when
          a card is released over this panel. */}
      <div
        data-unsorted-panel="true"
        className="fixed top-0 right-0 bottom-0 z-[140] w-64 max-w-[68vw] bg-white dark:bg-brand-800 flex flex-col shadow-2xl border-l-2 border-brand-100 dark:border-brand-700"
      >
        {/* Drop hint — shown via CSS when body has bd-dragging class */}
        <div className="bd-drop-hint absolute inset-0 bg-accent-100/80 dark:bg-accent-900/50 border-4 border-dashed border-accent-400 dark:border-accent-300 pointer-events-none z-10 items-center justify-center" style={{ display: "none" }}>
          <p className="text-sm font-pixel text-accent-600 dark:text-accent-300 text-center px-4">Drop here to send to Unsorted</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-100 dark:border-brand-700 flex-shrink-0">
          <h2 className="text-sm font-pixel text-brand-600 dark:text-brand-300">UNSORTED</h2>
          <button onClick={onClose} className="text-brand-400 text-xl leading-none">&times;</button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <p className="text-sm text-brand-300 dark:text-brand-600 italic">
              No unsorted items yet.{"\n"}Create a quick note or sketch from the main page.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-brand-100 dark:border-brand-700 bg-brand-50 dark:bg-brand-900 overflow-hidden">
                {/* Header — shows the label if set, otherwise the type name */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-brand-100 dark:border-brand-700">
                  {(() => {
                    const type = item.cardData?.type || item.type;
                    const label = item.cardData?.label;
                    // Types that show their label in the badge when one is set
                    const labelTypes = { table: "⊞ Table", list: "📋 List", image: "🖼️ Image", link: "🔗 Link", color: "🎨 Color" };
                    const defaultBadge = {
                      sketch: "✏️ Sketch", note: "📝 Note", text: "📝 Note",
                      title: "🔤 Title", document: "📄 Doc",
                      board: "📋 Board", column: "▥ Column",
                      ...labelTypes,
                    };
                    const badge = labelTypes[type] && label ? label : (defaultBadge[type] || type);
                    return (
                      <span className="text-[10px] font-medium text-brand-400 dark:text-brand-500 uppercase tracking-wide truncate max-w-[60%]">
                        {badge}
                      </span>
                    );
                  })()}
                  <div className="flex gap-2 items-center">
                    {onDropToCanvas && (
                      <span className="text-[9px] text-brand-300 dark:text-brand-600 italic">
                        {isMobile ? "tap to place" : "hold & drag to canvas"}
                      </span>
                    )}
                    {!onDropToCanvas && item.type === "note" && (
                      <button onClick={() => { setEditingId(item.id); setEditDraft(item.content || ""); }}
                        className="text-[10px] text-accent-500 dark:text-accent-300 hover:underline">Edit</button>
                    )}
                    {(item.type === "sketch" || item.cardData?.type === "sketch") && (
                      <button onClick={() => setSketchEditItem({ ...item, ...(item.cardData || {}) })}
                        className="text-[10px] text-accent-500 dark:text-accent-300 hover:underline">Edit</button>
                    )}
                    <button onClick={() => deleteUnsorted(item.id)} className="text-brand-300 hover:text-red-400 text-sm leading-none">&times;</button>
                  </div>
                </div>
                {/* Content — tap on mobile, drag on desktop */}
                <div
                  className={`p-3 ${
                    onDropToCanvas
                      ? isMobile
                        ? "cursor-pointer active:bg-accent-50 dark:active:bg-accent-900/20 transition"
                        : "cursor-grab active:cursor-grabbing"
                      : ""
                  }`}
                  onClick={onDropToCanvas && isMobile ? () => {
                    // Mobile: tap dispatches tap-to-place event, panel closes
                    window.dispatchEvent(new CustomEvent("bd-unsorted-tap-place", { detail: { item } }));
                    onClose();
                  } : undefined}
                  onPointerDown={onDropToCanvas && !isMobile ? (e) => handleItemPointerDown(e, item) : undefined}
                >
                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <textarea autoFocus value={editDraft} onChange={e => setEditDraft(e.target.value)} rows={4}
                        className="w-full text-xs text-brand-700 dark:text-brand-200 bg-white dark:bg-brand-800 border border-brand-200 dark:border-brand-600 rounded p-2 resize-none focus:outline-none" />
                      <div className="flex gap-2">
                        <button onClick={() => commitEdit(item.id)} className="px-2 py-1 text-xs bg-brand-600 text-white rounded">Save</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-brand-400">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <UnsortedItemPreview item={item} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
