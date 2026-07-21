import React, { useState, useRef, useCallback, useEffect } from "react";
import BoardThumbnail from "./BoardThumbnail";
import {
  createCard,
  updateCard,
  deleteCard,
  uploadBrainDumpImage,
  moveGroupWithChildren,
  createNestedBoard,
  listenToBoard,
  renameBoard,
  createArrow,
  updateArrow,
  deleteArrow,
  updateBoardColor,
  createUnsortedNote,
  createUnsortedSketch,
  createUnsortedCard,
  updateUnsorted,
} from "../lib/brainDump";
import { useBrainDumpHistory, makeUndoableActions } from "../lib/brainDumpHistory";

function screenToCanvas(screenX, screenY, containerRect, pan, zoom) {
  return {
    x: (screenX - containerRect.left - pan.x) / zoom,
    y: (screenY - containerRect.top - pan.y) / zoom,
  };
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
function clampZoom(z) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
function wordCount(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Four corner resize handles. The overlay div they live in exactly
// matches the card's bounding box, so these positions (0%/100% of
// that box) land exactly on the card's corners. translate(-50%/-50%)
// centers each 12px dot on the corner point rather than jutting inside.
// On desktop: visible on hover (group-hover/card). On mobile: visible
// when `selected` is true, which is set by a long-press on the card.
function ResizeHandles({ card, onResizeStart, selected }) {
  const corners = [
    { id: "tl", style: { top: 0, left: 0, transform: "translate(-50%, -50%)", cursor: "nw-resize" } },
    { id: "tr", style: { top: 0, right: 0, transform: "translate(50%, -50%)", cursor: "ne-resize" } },
    { id: "bl", style: { bottom: 0, left: 0, transform: "translate(-50%, 50%)", cursor: "sw-resize" } },
    { id: "br", style: { bottom: 0, right: 0, transform: "translate(50%, 50%)", cursor: "se-resize" } },
  ];
  return (
    <>
      {corners.map(({ id, style }) => (
        <div
          key={id}
          onPointerDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, card, id);
          }}
          className={`absolute w-3 h-3 rounded-full bg-white border-2 border-accent-500 transition-opacity ${
            selected ? "opacity-100" : "opacity-0 group-hover/card:opacity-100 hover:opacity-100"
          }`}
          style={{ ...style, pointerEvents: "auto", zIndex: 20 }}
        />
      ))}
    </>
  );
}

// Defined outside the canvas component so it doesn't re-create on
// every render (which would reset the long-press timer each tick).
// Handles both hover (desktop) and long-press (mobile/iPad) to show
// the resize handles.
function LongPressOverlay({ card, selectedCardId, setSelectedCardId, onResizeStart }) {
  const timerRef = useRef(null);
  const movedRef = useRef(false);
  const selected = selectedCardId === card.id;

  // Long-press is detected by listening on the card's own DOM element
  // via useEffect, so we don't need a covering div that would block
  // double-clicks and other interactions on the card below.
  useEffect(() => {
    const el = document.getElementById(`bd-card-${card.id}`);
    if (!el) return;

    const startLongPress = () => {
      movedRef.current = false;
      timerRef.current = setTimeout(() => {
        if (!movedRef.current) setSelectedCardId(card.id);
      }, 500);
    };
    const cancelLongPress = () => clearTimeout(timerRef.current);
    const markMoved = () => { movedRef.current = true; clearTimeout(timerRef.current); };

    el.addEventListener("pointerdown", startLongPress);
    el.addEventListener("pointermove", markMoved);
    el.addEventListener("pointerup", cancelLongPress);
    el.addEventListener("pointerleave", cancelLongPress);
    return () => {
      el.removeEventListener("pointerdown", startLongPress);
      el.removeEventListener("pointermove", markMoved);
      el.removeEventListener("pointerup", cancelLongPress);
      el.removeEventListener("pointerleave", cancelLongPress);
    };
  }, [card.id, setSelectedCardId]);

  return (
    // pointer-events: none on the overlay so it never intercepts
    // clicks, double-clicks, or drags — only the handle dots themselves
    // re-enable pointer events for resizing.
    <div
      className="group/card"
      style={{
        position: "absolute",
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height,
        zIndex: (card.zIndex || 1) + 1,
        pointerEvents: "none",
      }}
    >
      <ResizeHandles card={card} onResizeStart={onResizeStart} selected={selected} />
    </div>
  );
}

// --- Card components -----------------------------------------------

// Reusable label bar — a small editable strip at the bottom of a card
// for a short freeform label (same pattern as ImageCard and ColorCard).
// Double-tap the text to edit; press Enter or blur to save.
function LabelBar({ card, onUpdate, dark = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.label || "");

  const commit = () => {
    setEditing(false);
    if (draft !== card.label) onUpdate(card.id, { label: draft });
  };

  const base = dark
    ? "bg-black/40 text-white placeholder-white/40"
    : "bg-brand-100/80 dark:bg-brand-700/80 text-brand-600 dark:text-brand-300";

  return (
    <div
      className={`flex items-center px-2 py-1 ${base} flex-shrink-0 cursor-pointer`}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={() => !editing && setEditing(true)}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          placeholder="Add a label..."
          className="flex-1 min-w-0 bg-transparent text-[10px] focus:outline-none placeholder-current/40 w-full break-words"
        />
      ) : (
        <span className="flex-1 min-w-0 text-[10px] break-words min-h-[14px]">
          {card.label
            ? card.label
            : <span className={`${dark ? "text-white/40" : "text-brand-400 dark:text-brand-500"} italic`}>＋ label</span>
          }
        </span>
      )}
    </div>
  );
}

function DeleteButton({ onClick, dark, inline }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${inline ? "relative" : "absolute top-1 right-1"} flex-shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center ${
        dark ? "bg-black/30 hover:bg-black/50 text-white" : "bg-black/10 hover:bg-black/20 text-black/50"
      }`}
      aria-label="Delete card"
    >
      &times;
    </button>
  );
}

// (Card-to-card connector handle removed — arrows are now a standalone
// freeform tool, not anchored to cards. See ArrowEntity below.)

function TextCard({ card, onUpdate, onDelete, onDragStart, inColumn, onOpenColorPicker, zIndex }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.content);

  const handleBlur = () => {
    setEditing(false);
    if (draft !== card.content) onUpdate(card.id, { content: draft });
  };

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden flex flex-col select-none`}
      style={
        inColumn
          ? { height: card.height, backgroundColor: card.color || "#f6f0fc" }
          : { left: card.x, top: card.y, width: card.width, height: card.height, backgroundColor: card.color || "#f6f0fc" }
      }
      onPointerDown={(e) => onDragStart(e, card)}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* Label at the top */}
      <LabelBar card={card} onUpdate={onUpdate} />
      {/* Delete and color picker stacked on the top-right */}
      <div className="absolute top-1 right-1 flex flex-col items-center gap-0.5 z-10" onPointerDown={(e) => e.stopPropagation()}>
        <DeleteButton inline onClick={() => onDelete(card)} />
        <button
          onClick={(e) => { e.stopPropagation(); onOpenColorPicker(card); }}
          className="w-3.5 h-3.5 rounded-full border border-black/20 flex-shrink-0"
          style={{ backgroundColor: card.color || "#f6f0fc" }}
          title="Change note color"
        />
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-1 w-full h-full bg-transparent resize-none p-3 text-sm text-black/80 focus:outline-none"
        />
      ) : (
        <p
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="flex-1 w-full h-full p-3 text-sm text-black/80 whitespace-pre-wrap break-words overflow-hidden cursor-pointer"
        >
          {card.content || "Double-tap to edit..."}
        </p>
      )}
    </div>
  );
}

function TitleCard({ card, onUpdate, onDelete, onDragStart, inColumn, onOpenColorPicker, zIndex }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.content);

  const handleBlur = () => {
    setEditing(false);
    if (draft !== card.content) onUpdate(card.id, { content: draft });
  };

  const textColor = card.color || "#3c1968";

  const positionStyle = inColumn
    ? { height: card.height }
    : { left: card.x, top: card.y, width: card.width, height: card.height };

  // No box styling inside a column — the column itself already provides
  // a visual container, so a second border/background here would just
  // look redundant and busy.
  const boxStyle = inColumn
    ? {}
    : {
        backgroundColor: `${textColor}14`, // very subtle ~8% tint, just enough to read as "a title block"
        borderColor: `${textColor}40`, // soft ~25% border in the same color
      };

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} group/title rounded-lg overflow-hidden flex items-center justify-center ${
        inColumn ? "" : "border"
      }`}
      style={{ ...positionStyle, ...boxStyle }}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      {/* Color swatch — left side */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onOpenColorPicker(card); }}
        className="absolute top-1 left-1 w-3 h-3 rounded-full border border-black/20 flex-shrink-0"
        style={{ backgroundColor: textColor }}
        title="Change title color"
      />
      {/* Delete — right side */}
      <div className="absolute top-1 right-1">
        <DeleteButton inline onClick={() => onDelete(card)} />
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => e.key === "Enter" && handleBlur()}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-full bg-transparent font-title text-xl font-bold px-2 text-center focus:outline-none"
          style={{ color: textColor }}
        />
      ) : (
        <h2
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className="w-full font-title text-xl font-bold px-2 text-center break-words cursor-pointer"
          style={{ color: textColor }}
        >
          {card.content || "Title"}
        </h2>
      )}
    </div>
  );
}

function ColorCard({ card, onUpdate, onDelete, onDragStart, onOpenColorPicker, inColumn, zIndex }) {
  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white dark:bg-brand-900 flex flex-col`}
      style={
        inColumn
          ? { height: card.height }
          : { left: card.x, top: card.y, width: card.width, height: card.height }
      }
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />
      {/* Label at top */}
      <LabelBar card={card} onUpdate={onUpdate} />
      {/* Color swatch */}
      <div
        className="flex-1 relative overflow-hidden cursor-pointer"
        style={{ backgroundColor: card.color }}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenColorPicker(card); }}
      >
        {/* Hex code in bottom-right corner of swatch */}
        <span className="absolute bottom-1 right-1.5 text-[9px] font-mono text-white/60 pointer-events-none">{card.color}</span>
      </div>
    </div>
  );
}

function ImageCard({ card, onUpdate, onDelete, onDragStart, onOpenImagePicker, inColumn, zIndex }) {

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white flex flex-col`}
      style={inColumn ? { height: card.height } : { left: card.x, top: card.y, width: card.width, height: card.height }}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />
      {/* Label at the top */}
      <LabelBar card={card} onUpdate={onUpdate} />
      {card.imageUrl ? (
        <img
          src={card.imageUrl}
          alt=""
          className="w-full flex-1 object-cover cursor-pointer"
          draggable={false}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onOpenImagePicker(card);
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            onOpenImagePicker(card);
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 text-xs text-brand-400 hover:bg-brand-50 cursor-pointer"
        >
          <span className="text-lg">🖼️</span>
          Double-tap to add image
        </div>
      )}
    </div>
  );
}

// Document card: small view shows a title + word count; tapping opens
// a full-screen editor modal for the long-form content.
function DocumentCard({ card, onUpdate, onDelete, onDragStart, onOpenDocument, inColumn, zIndex }) {
  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white flex flex-col`}
      style={inColumn ? { height: card.height } : { left: card.x, top: card.y, width: card.width, height: card.height }}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenDocument(card);
        }}
        className="flex-1 w-full h-full flex flex-col p-3 text-left cursor-pointer"
      >
        <span className="text-base">📄</span>
        <p className="text-sm font-semibold text-brand-800 mt-1 break-words">
          {card.title || "Untitled document"}
        </p>
        <p className="text-[10px] text-brand-400 mt-auto">{wordCount(card.content)} words</p>
      </div>
    </div>
  );
}

function LinkCard({ card, onUpdate, onDelete, onDragStart, inColumn, zIndex }) {
  const [editingUrl, setEditingUrl] = useState(!card.linkUrl);
  const [urlDraft, setUrlDraft] = useState(card.linkUrl || "");
  const [loading, setLoading] = useState(false);

  const fetchMeta = async (url) => {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed.startsWith("http")) return;
    setLoading(true);
    try {
      const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.status === "success") {
        onUpdate(card.id, {
          linkUrl: trimmed,
          linkTitle: data.data.title || trimmed,
          linkDescription: data.data.description || "",
          linkImage: data.data.image?.url || "",
          linkDomain: new URL(trimmed).hostname.replace("www.", ""),
        });
      } else {
        onUpdate(card.id, {
          linkUrl: trimmed,
          linkTitle: trimmed,
          linkDescription: "",
          linkImage: "",
          linkDomain: (() => { try { return new URL(trimmed).hostname.replace("www.", ""); } catch { return trimmed; } })(),
        });
      }
    } catch {
      onUpdate(card.id, { linkUrl: trimmed, linkTitle: trimmed, linkDescription: "", linkImage: "", linkDomain: trimmed });
    } finally {
      setLoading(false);
      setEditingUrl(false);
    }
  };

  const accentColor = card.color || "#5fa3d6";
  const posStyle = inColumn
    ? { height: card.height }
    : { left: card.x, top: card.y, width: card.width, height: card.height };

  if (editingUrl) {
    return (
      <div
        id={`bd-card-${card.id}`}
        data-card-id={card.id}
        className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 bg-white flex flex-col items-center justify-center gap-2 p-3`}
        style={posStyle}
        onPointerDown={(e) => onDragStart(e, card)}
      >
        <DeleteButton onClick={() => onDelete(card)} />
        <span className="text-xs text-brand-400">Paste a URL</span>
        <input
          autoFocus
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fetchMeta(urlDraft); if (e.key === "Escape") { if (card.linkUrl) setEditingUrl(false); else onDelete(card); } }}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="https://..."
          className="w-full text-xs rounded-lg border border-brand-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
        />
        <div className="flex gap-2">
          <button
            onClick={() => fetchMeta(urlDraft)}
            disabled={loading}
            onPointerDown={(e) => e.stopPropagation()}
            className="px-3 py-1 text-xs bg-brand-600 text-white rounded-lg disabled:opacity-50"
          >
            {loading ? "Loading..." : "Add"}
          </button>
          {card.linkUrl && (
            <button onClick={() => setEditingUrl(false)} onPointerDown={(e) => e.stopPropagation()} className="px-3 py-1 text-xs text-brand-400">
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white flex flex-col`}
      style={{ ...posStyle, borderLeftWidth: 3, borderLeftColor: accentColor }}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />
      {/* Label at top */}
      <LabelBar card={card} onUpdate={onUpdate} />

      {/* Double-tap to open the URL */}
      <div
        className="flex-1 flex flex-col p-2.5 cursor-pointer"
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (card.linkUrl) window.open(card.linkUrl, "_blank", "noopener,noreferrer");
        }}
      >
        {card.linkImage && (
          <img src={card.linkImage} alt="" className="w-full h-20 object-cover rounded mb-1.5 pointer-events-none" draggable={false} />
        )}
        <span className="text-[10px] text-brand-400 truncate block">{card.linkDomain}</span>
        <span className="text-xs font-semibold text-brand-800 line-clamp-2 mt-0.5">{card.linkTitle || card.linkUrl}</span>
        {card.linkDescription && (
          <span className="text-[10px] text-brand-500 line-clamp-2 mt-0.5">{card.linkDescription}</span>
        )}
      </div>

      {/* Footer: hint + edit + color */}
      <div className="px-2.5 pb-1.5 flex items-center justify-between">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setUrlDraft(card.linkUrl || ""); setEditingUrl(true); }}
          className="text-[9px] text-brand-300 hover:text-brand-500"
        >
          double-tap to open · tap here to edit URL
        </button>
        <input
          type="color"
          value={accentColor}
          onChange={(e) => onUpdate(card.id, { color: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded-full cursor-pointer border-0 p-0 flex-shrink-0"
          style={{ appearance: "none", WebkitAppearance: "none", backgroundColor: accentColor }}
          title="Change accent color"
        />
      </div>
    </div>
  );
}


// --- Table card -------------------------------------------

// Firestore doesn't support nested arrays, so table rows are stored
// as objects with column keys (c0, c1, ...) rather than arrays.
// These helpers convert between the Firestore-safe format and the
// 2D array format more convenient for rendering.
function rowsToMatrix(rows, colCount) {
  return (rows || []).map((row) =>
    Array.from({ length: colCount }, (_, i) => row[`c${i}`] ?? "")
  );
}
function matrixToRows(matrix) {
  return matrix.map((row) =>
    Object.fromEntries(row.map((cell, i) => [`c${i}`, cell]))
  );
}

const DEFAULT_TABLE = {
  headers: ["Column 1", "Column 2", "Column 3"],
  rows: [
    { c0: "", c1: "", c2: "" },
    { c0: "", c1: "", c2: "" },
  ],
};

function TableCard({ card, onUpdate, onDelete, onDragStart, inColumn, zIndex, onOpenTable }) {
  const table = card.tableData || DEFAULT_TABLE;
  const headers = table.headers || [];
  // Convert stored row objects ({ c0, c1, ... }) to arrays for rendering
  const matrix = rowsToMatrix(table.rows, headers.length);
  const posStyle = inColumn
    ? { height: card.height }
    : { left: card.x, top: card.y, width: card.width, height: card.height };

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white flex flex-col`}
      style={posStyle}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />
      <LabelBar card={card} onUpdate={onUpdate} />
      <div
        className="flex-1 overflow-hidden cursor-pointer"
        onDoubleClick={(e) => { e.stopPropagation(); onOpenTable(card); }}
      >
        <table className="w-full text-[9px] border-collapse" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              {/* Row number gutter */}
              <th className="bg-brand-100 dark:bg-brand-800 border border-brand-100 dark:border-brand-700 text-brand-400" style={{ width: 16, height: 20 }} />
              {headers.map((h, i) => (
                <th key={i} className="px-1 bg-brand-50 dark:bg-brand-900 text-brand-600 dark:text-brand-300 border border-brand-100 dark:border-brand-700 text-left font-semibold overflow-hidden" style={{ maxWidth: 0, height: 20 }}>
                  <span className="block truncate">{h || `Col ${i + 1}`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <td className="text-center bg-brand-50 dark:bg-brand-900 text-brand-400 border border-brand-100 dark:border-brand-700 font-medium" style={{ width: 16, height: 20, fontSize: 7 }}>
                  {ri + 1}
                </td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-1 border border-brand-100 dark:border-brand-700 text-brand-700 dark:text-brand-200 overflow-hidden" style={{ maxWidth: 0, height: 20 }}>
                    <span className="block truncate">{cell}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableModal({ card, onClose, onSave }) {
  const init = card.tableData || DEFAULT_TABLE;
  const [headers, setHeaders] = useState(init.headers || ["Column 1", "Column 2", "Column 3"]);
  // Work with a 2D array internally (convenient for editing), but
  // convert to/from the Firestore-safe object-row format on load/save.
  const [rows, setRows] = useState(() => rowsToMatrix(init.rows, (init.headers || []).length || 3));

  const setCell = (ri, ci, val) => setRows((r) => r.map((row, i) => i === ri ? row.map((c, j) => j === ci ? val : c) : row));
  const setHeader = (ci, val) => setHeaders((h) => h.map((c, i) => i === ci ? val : c));
  const addRow = () => setRows((r) => [...r, Array(headers.length).fill("")]);
  const deleteRow = (ri) => setRows((r) => r.filter((_, i) => i !== ri));
  const addCol = () => { setHeaders((h) => [...h, `Column ${h.length + 1}`]); setRows((r) => r.map((row) => [...row, ""])); };
  const deleteCol = (ci) => { setHeaders((h) => h.filter((_, i) => i !== ci)); setRows((r) => r.map((row) => row.filter((_, i) => i !== ci))); };

  const handleSave = () => {
    // Convert back to the object-row format (no nested arrays) for Firestore
    onSave(card.id, { tableData: { headers, rows: matrixToRows(rows) } });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-brand-800 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-100 dark:border-brand-600 flex-shrink-0">
          <p className="text-xs font-pixel text-brand-600 dark:text-brand-300">TABLE</p>
          <button onClick={onClose} className="text-brand-400 dark:text-brand-500 text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              {/* Column letter labels row (A, B, C...) */}
              <tr>
                <th className="w-8 bg-brand-100 dark:bg-brand-700 border border-brand-200 dark:border-brand-600" />
                {headers.map((_, ci) => (
                  <th key={ci} className="text-[10px] font-medium text-brand-400 dark:text-brand-500 bg-brand-100 dark:bg-brand-700 border border-brand-200 dark:border-brand-600 text-center py-0.5 min-w-[100px]">
                    {String.fromCharCode(65 + ci)}
                  </th>
                ))}
                <th className="w-8 bg-brand-100 dark:bg-brand-700 border border-brand-200 dark:border-brand-600" />
              </tr>
              {/* Editable header row */}
              <tr>
                <th className="w-8 bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600" />
                {headers.map((h, ci) => (
                  <th key={ci} className="relative p-0 min-w-[100px]">
                    <input
                      value={h}
                      onChange={(e) => setHeader(ci, e.target.value)}
                      className="w-full px-2 py-1.5 bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-200 font-semibold border border-brand-200 dark:border-brand-600 focus:outline-none focus:ring-1 focus:ring-accent-400 text-xs"
                    />
                    {headers.length > 1 && (
                      <button
                        onClick={() => deleteCol(ci)}
                        className="absolute -top-2 -right-2 w-4 h-4 bg-red-400 text-white rounded-full text-[9px] flex items-center justify-center z-10 hover:bg-red-500"
                      >&times;</button>
                    )}
                  </th>
                ))}
                <th className="w-8">
                  <button onClick={addCol} className="w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-700 text-brand-500 dark:text-brand-300 text-lg flex items-center justify-center hover:bg-brand-200 dark:hover:bg-brand-600">+</button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {/* Row number */}
                  <td className="text-[10px] text-center font-medium text-brand-400 dark:text-brand-500 bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600 w-8 select-none">
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="p-0">
                      <input
                        value={cell}
                        onChange={(e) => setCell(ri, ci, e.target.value)}
                        className="w-full px-2 py-1.5 border border-brand-100 dark:border-brand-700 text-brand-700 dark:text-brand-200 focus:outline-none focus:ring-1 focus:ring-accent-400 text-xs bg-white dark:bg-brand-800"
                      />
                    </td>
                  ))}
                  <td className="pl-1">
                    {rows.length > 1 && (
                      <button onClick={() => deleteRow(ri)} className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-950 text-red-400 text-xs flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900">&times;</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addRow} className="mt-2 px-3 py-1.5 text-xs text-brand-500 dark:text-brand-300 border border-dashed border-brand-200 dark:border-brand-600 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900 w-full">
            + Add row
          </button>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-brand-100 dark:border-brand-600 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-brand-500 dark:text-brand-300">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700">Save</button>
        </div>
      </div>
    </div>
  );
}

// --- List card -------------------------------------------

function ListCard({ card, onUpdate, onDelete, onDragStart, inColumn, zIndex }) {
  const items = card.listItems || [];
  const mode = card.listMode || "bullet";
  const posStyle = inColumn
    ? { height: card.height }
    : { left: card.x, top: card.y, width: card.width, height: card.height };

  // Which item is currently being edited (null = none, show as plain text)
  const [editingItemId, setEditingItemId] = useState(null);
  // Ref map so we can focus the textarea of a newly-created item
  const textareaRefs = useRef({});

  const addItem = (afterId = null) => {
    const newId = Date.now().toString();
    const newItem = { text: "", checked: false, id: newId };
    let newItems;
    if (afterId) {
      const idx = items.findIndex((it) => it.id === afterId);
      newItems = [...items.slice(0, idx + 1), newItem, ...items.slice(idx + 1)];
    } else {
      newItems = [...items, newItem];
    }
    onUpdate(card.id, { listItems: newItems });
    // Focus the new textarea after React re-renders
    setEditingItemId(newId);
    setTimeout(() => textareaRefs.current[newId]?.focus(), 50);
  };

  const updateItem = (id, changes) =>
    onUpdate(card.id, { listItems: items.map((it) => it.id === id ? { ...it, ...changes } : it) });
  const deleteItem = (id) =>
    onUpdate(card.id, { listItems: items.filter((it) => it.id !== id) });

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white dark:bg-brand-800 flex flex-col`}
      style={posStyle}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />
      <LabelBar card={card} onUpdate={onUpdate} />
      {/* Mode toggle */}
      <div className="flex gap-1 px-2 pt-2 pb-1 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(card.id, { listMode: "bullet" }); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${mode === "bullet" ? "bg-brand-600 text-white" : "bg-brand-50 dark:bg-brand-700 text-brand-400 dark:text-brand-400"}`}
        >● Bullets</button>
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(card.id, { listMode: "todo" }); }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${mode === "todo" ? "bg-brand-600 text-white" : "bg-brand-50 dark:bg-brand-700 text-brand-400 dark:text-brand-400"}`}
        >☐ To-do</button>
      </div>
      {/* Items */}
      <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5 group/item">
            {mode === "todo" ? (
              <input
                type="checkbox"
                checked={!!item.checked}
                onChange={(e) => { e.stopPropagation(); updateItem(item.id, { checked: e.target.checked }); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="flex-shrink-0 accent-brand-600 mt-0.5"
              />
            ) : (
              <span className="w-3 h-3 flex-shrink-0 text-brand-400 text-[10px] flex items-center justify-center mt-0.5">•</span>
            )}

            {editingItemId === item.id ? (
              // Editing mode — full textarea
              <textarea
                autoFocus
                value={item.text}
                onChange={(e) => updateItem(item.id, { text: e.target.value })}
                onBlur={() => setEditingItemId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addItem(item.id);
                  }
                  if (e.key === "Backspace" && !item.text) {
                    e.preventDefault();
                    deleteItem(item.id);
                    setEditingItemId(null);
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                placeholder="Item..."
                rows={1}
                className={`flex-1 min-w-0 text-xs bg-transparent text-brand-700 dark:text-brand-200 focus:outline-none resize-none overflow-hidden ${item.checked && mode === "todo" ? "line-through text-brand-300 dark:text-brand-600" : ""}`}
                style={{ hyphens: "auto" }}
                ref={(el) => {
                  textareaRefs.current[item.id] = el;
                  if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
                }}
              />
            ) : (
              // Display mode — plain text, double-tap to edit
              <span
                onDoubleClick={(e) => { e.stopPropagation(); setEditingItemId(item.id); }}
                onPointerDown={(e) => e.stopPropagation()}
                className={`flex-1 min-w-0 text-xs text-brand-700 dark:text-brand-200 cursor-pointer break-words ${item.checked && mode === "todo" ? "line-through text-brand-300 dark:text-brand-600" : ""}`}
                style={{ minHeight: "1.25rem", hyphens: "auto" }}
              >
                {item.text || <span className="text-brand-300 italic">double-tap to edit</span>}
              </span>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="opacity-0 group-hover/item:opacity-100 text-brand-300 hover:text-red-400 text-xs flex-shrink-0 mt-0.5"
            >&times;</button>
          </div>
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); addItem(); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-[10px] text-brand-300 dark:text-brand-600 hover:text-brand-500 dark:hover:text-brand-300 w-full text-left py-0.5"
        >
          + Add item
        </button>
      </div>
    </div>
  );
}


// Renders an array of stroke paths onto a <canvas>, scaled to whatever
// size the canvas element actually is — shared between the small card
// preview and the full-screen editor so they always look identical.
function renderStrokesToCanvas(canvasEl, strokes, sourceWidth, sourceHeight) {
  if (!canvasEl) return;
  const ctx = canvasEl.getContext("2d");
  const scaleX = canvasEl.width / (sourceWidth || canvasEl.width);
  const scaleY = canvasEl.height / (sourceHeight || canvasEl.height);
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes || []) {
    if (!stroke || !stroke.points || stroke.points.length < 2) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * Math.min(scaleX, scaleY);
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * scaleX, stroke.points[0].y * scaleY);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x * scaleX, stroke.points[i].y * scaleY);
    }
    ctx.stroke();
  }
}

function SketchCard({ card, onUpdate, onDelete, onDragStart, onOpenSketch, inColumn, zIndex }) {
  const previewRef = useRef(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(card.label || "");

  const commitLabel = () => {
    setEditingLabel(false);
    if (labelDraft !== card.label) onUpdate(card.id, { label: labelDraft });
  };

  useEffect(() => {
    const canvasEl = previewRef.current;
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.width = rect.width * 2;
    canvasEl.height = rect.height * 2;
    renderStrokesToCanvas(canvasEl, card.strokes, card.sketchWidth || 400, card.sketchHeight || 300);
  }, [card.strokes, card.width, card.height, card.sketchWidth, card.sketchHeight]);

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white`}
      style={inColumn ? { height: card.height } : { left: card.x, top: card.y, width: card.width, height: card.height }}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />

      {/* Label — top-left overlay, same pattern as ImageCard */}
      <div
        className="absolute top-1.5 left-1.5 max-w-[70%] z-10"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(true); }}
      >
        {editingLabel ? (
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === "Enter" && commitLabel()}
            placeholder="Label..."
            className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded focus:outline-none placeholder-white/50 w-full"
          />
        ) : (
          <span className="bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded break-words block cursor-pointer">
            {card.label || <span className="opacity-50">+ label</span>}
          </span>
        )}
      </div>

      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenSketch(card);
        }}
        className="w-full h-full cursor-pointer"
      >
        <canvas ref={previewRef} className="w-full h-full" />
        {(!card.strokes || card.strokes.length === 0) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-brand-300 pointer-events-none">
            <span className="text-lg">✏️</span>
            Double-tap to sketch
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sketch editor modal ---------------------------------------------

const SKETCH_COLORS = ["#3c1968", "#ef4444", "#3d82bd", "#16a34a", "#f59e0b", "#000000"];

function SketchModal({ card, onClose, onSave }) {
  const canvasRef = useRef(null);
  // Keep ALL mutable drawing state in refs rather than React state —
  // this completely eliminates stale-closure bugs where pointer handlers
  // capture an old `strokes` value and either lose strokes, prevent
  // new ones from starting, or break undo after the first action.
  const strokesRef = useRef(card.strokes ? card.strokes.filter((s) => s && s.points) : []);
  const undoStackRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const [color, setColor] = useState(SKETCH_COLORS[0]);
  const [customColor, setCustomColor] = useState("");
  const [lineWidth, setLineWidth] = useState(3);
  const [erasing, setErasing] = useState(false);
  const [, forceUpdate] = useState(0);

  const CANVAS_W = 800;
  const CANVAS_H = 600;

  const activeColor = customColor || color;

  const redrawAll = useCallback(() => {
    renderStrokesToCanvas(canvasRef.current, strokesRef.current, CANVAS_W, CANVAS_H);
  }, []);

  useEffect(() => {
    redrawAll();
  }, [redrawAll]);

  const getCanvasPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    currentStrokeRef.current = {
      color: erasing ? "#ffffff" : activeColor,
      width: erasing ? lineWidth * 4 : lineWidth,
      points: [getCanvasPoint(e)],
    };
  };

  const handlePointerMove = (e) => {
    if (!currentStrokeRef.current) return;
    currentStrokeRef.current.points.push(getCanvasPoint(e));
    renderStrokesToCanvas(
      canvasRef.current,
      [...strokesRef.current, currentStrokeRef.current],
      CANVAS_W,
      CANVAS_H
    );
  };

  const handlePointerUp = () => {
    if (!currentStrokeRef.current) return;
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = null;
    if (finished.points.length > 1) {
      undoStackRef.current.push([...strokesRef.current]);
      strokesRef.current = [...strokesRef.current, finished];
      redrawAll();
    }
  };

  const handleSketchUndo = () => {
    const prev = undoStackRef.current.pop();
    if (prev !== undefined) {
      strokesRef.current = prev;
    } else if (strokesRef.current.length > 0) {
      strokesRef.current = strokesRef.current.slice(0, -1);
    }
    redrawAll();
    forceUpdate((n) => n + 1);
  };

  const handleClear = () => {
    if (!confirm("Clear the whole sketch?")) return;
    undoStackRef.current.push([...strokesRef.current]);
    strokesRef.current = [];
    redrawAll();
    forceUpdate((n) => n + 1);
  };

  const handleSaveAndClose = () => {
    const cleanStrokes = strokesRef.current.filter(
      (s) => s && Array.isArray(s.points) && s.points.length >= 2
    );
    onSave(card.id, { strokes: cleanStrokes, sketchWidth: CANVAS_W, sketchHeight: CANVAS_H });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-brand-800 rounded-2xl w-full max-w-3xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-brand-100 dark:border-brand-600">
          <p className="text-xs font-pixel text-brand-600 dark:text-brand-300">SKETCH</p>
          <button onClick={onClose} className="text-brand-400 dark:text-brand-500 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-brand-100 dark:border-brand-600 bg-brand-50 dark:bg-brand-900">
          {SKETCH_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => { setColor(c); setCustomColor(""); setErasing(false); }}
              className={`w-6 h-6 rounded-full flex-shrink-0 ${!erasing && !customColor && color === c ? "ring-2 ring-offset-1 ring-accent-500" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={customColor || "#a878d8"}
            onChange={(e) => { setCustomColor(e.target.value); setErasing(false); }}
            className="w-6 h-6 rounded-full cursor-pointer flex-shrink-0"
            style={{
              border: "none",
              padding: 0,
              background: customColor ? customColor : "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)",
              outline: customColor && !erasing ? "2px solid #5fa3d6" : "none",
              outlineOffset: "2px",
            }}
            title="Custom color"
          />
          <div className="h-5 w-px bg-brand-200 dark:bg-brand-600 mx-1" />
          <input type="range" min="1" max="12" value={lineWidth} onChange={(e) => setLineWidth(Number(e.target.value))} className="w-20" />
          <div className="rounded-full flex-shrink-0 bg-brand-600 dark:bg-brand-300" style={{ width: lineWidth + 4, height: lineWidth + 4 }} />
          <div className="h-5 w-px bg-brand-200 dark:bg-brand-600 mx-1" />
          <button onClick={() => setErasing((v) => !v)} className={`px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 ${erasing ? "bg-brand-600 text-white" : "bg-white dark:bg-brand-800 text-brand-600 dark:text-brand-300 border border-brand-200 dark:border-brand-600"}`}>Eraser</button>
          <button onClick={handleSketchUndo} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-brand-800 text-brand-600 dark:text-brand-300 border border-brand-200 dark:border-brand-600 flex-shrink-0">Undo</button>
          <button onClick={handleClear} className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-brand-800 text-red-500 dark:text-red-400 border border-brand-200 dark:border-brand-600 flex-shrink-0">Clear</button>
        </div>

        <div className="bg-white touch-none" style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="w-full h-full"
            style={{ cursor: erasing ? "cell" : "crosshair" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-brand-100 dark:border-brand-600">
          <button onClick={onClose} className="px-4 py-2 text-sm text-brand-500 dark:text-brand-300">Cancel</button>
          <button onClick={handleSaveAndClose} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700">Save</button>
        </div>
      </div>
    </div>
  );
}


// Group card: a resizable container other cards can be dropped INTO.
// Its own header lets you rename it and drag the whole group (with
// children) at once.
const COLUMN_WIDTH = 280;
const COLUMN_CARD_GAP = 8;

// Column: a Milanote-style auto-stacking container. Unlike the old free
// floating Group, cards inside a column don't keep independent x/y —
// they render in vertical document order, full column width, and the
// column's own height grows automatically to fit its content.
function ColumnCard({ card, childCards, onUpdate, onDelete, onDragStart, renderChildCard, onOpenColorPicker }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(card.title || "");
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(card.label || "");
  // Minimize state is session-only (no need to persist to Firestore —
  // it's a viewing preference, not data the user needs across sessions).
  const [minimized, setMinimized] = useState(false);

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (titleDraft !== card.title) onUpdate(card.id, { title: titleDraft });
  };
  const handleLabelBlur = () => {
    setEditingLabel(false);
    if (labelDraft !== card.label) onUpdate(card.id, { label: labelDraft });
  };

  const headerColor = card.color || null;

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      data-column="true"
      className={`absolute rounded-xl border-2 border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-800 shadow-sm flex flex-col ${minimized ? "overflow-hidden" : ""}`}
      style={{ left: card.x, top: card.y, width: COLUMN_WIDTH }}
    >
      <div
        className={`relative flex items-center gap-2 px-3 py-3 flex-shrink-0 ${minimized ? "rounded-xl" : "rounded-t-xl"} cursor-grab active:cursor-grabbing ${
          headerColor ? "" : "bg-brand-100 dark:bg-brand-700"
        }`}
        style={{ backgroundColor: headerColor || undefined }}
        onPointerDown={(e) => onDragStart(e, card)}
      >
        {/* Color swatch — absolute top-left corner */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onOpenColorPicker(card); }}
          className="absolute top-1 left-1 w-3 h-3 rounded-full border border-black/20"
          style={{ backgroundColor: headerColor || "#ffffff" }}
          title="Change column color"
        />

        {/* Delete (×) and minimize (−/+) stacked on the right */}
        <div
          className="absolute top-1 right-1 flex flex-col items-center gap-0.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DeleteButton inline onClick={() => onDelete(card)} />
          <button
            onClick={(e) => { e.stopPropagation(); setMinimized((m) => !m); }}
            className="w-5 h-5 rounded-full text-xs flex items-center justify-center bg-black/10 hover:bg-black/20 text-black/50 leading-none"
            title={minimized ? "Expand column" : "Minimize column"}
          >
            {minimized ? "+" : "−"}
          </button>
        </div>

        {/* Title + label — stacked, both centered, both editable inline */}
        <div className="flex-1 flex flex-col items-center gap-0.5">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => e.key === "Enter" && handleTitleBlur()}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full bg-white dark:bg-brand-900 text-base font-title text-center px-1.5 py-0.5 rounded text-brand-800 dark:text-brand-100 focus:outline-none"
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setEditingTitle(true); }}
              className={`w-full text-base font-title font-semibold break-words text-center cursor-pointer ${headerColor ? "text-black/80" : "text-brand-700 dark:text-brand-200"}`}
              style={{ hyphens: "auto", overflowWrap: "break-word", wordBreak: "break-word" }}
            >
              {card.title || "Column"}
            </span>
          )}
          {/* Label — smaller subtitle line, always visible, editable on double-tap */}
          {editingLabel ? (
            <input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onBlur={handleLabelBlur}
              onKeyDown={(e) => { if (e.key === "Enter") handleLabelBlur(); }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Label..."
              className="w-full bg-white/70 dark:bg-brand-900/70 text-[10px] text-center px-1 py-0.5 rounded focus:outline-none text-brand-600 dark:text-brand-300"
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(true); }}
              className={`w-full text-[10px] text-center break-words cursor-pointer ${
                card.label ? (headerColor ? "text-black/60" : "text-brand-500 dark:text-brand-400") : "text-brand-300 dark:text-brand-600 italic"
              }`}
            >
              {card.label || "double-tap to add label"}
            </span>
          )}
        </div>
      </div>

      {/* Children — hidden entirely when minimized, no scrollbar ever.
          The column uses height: auto so it always fully encloses its
          children without any pre-calculation that could be wrong. */}
      {!minimized && (
        <div className="p-3 space-y-2">
          {childCards.length === 0 ? (
            <p className="text-[10px] text-brand-300 dark:text-brand-500 italic text-center py-4">
              Drag cards here
            </p>
          ) : (
            childCards.map((child) => renderChildCard(child))
          )}
        </div>
      )}
    </div>
  );
}

// Board-link card: a small card that opens a nested sub-board.
function BoardLinkCard({ card, onDelete, onDragStart, onOpenBoard, inColumn, uid, zIndex }) {
  const [linkedBoardName, setLinkedBoardName] = useState(card.content || "Untitled board");
  const [linkedBoardColor, setLinkedBoardColor] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [hex, setHex] = useState("#a878d8");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(linkedBoardName);
  const swatchRef = useRef(null);

  useEffect(() => {
    if (!card.linkedBoardId) return;
    return listenToBoard(card.linkedBoardId, (board) => {
      if (board?.name) setLinkedBoardName(board.name);
      setLinkedBoardColor(board?.color || null);
      if (board?.color) setHex(board.color);
    });
  }, [card.linkedBoardId]);

  const openColorPicker = (e) => {
    e.stopPropagation();
    // Position the popover relative to the VIEWPORT (fixed), using the
    // swatch button's actual screen position — this is what lets it
    // escape the card's own overflow-hidden clipping, instead of being
    // trapped inside the small card's bounds.
    const rect = swatchRef.current.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 6, left: rect.left });
    setShowColorPicker((s) => !s);
  };

  const handleNameBlur = () => {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== linkedBoardName) {
      renameBoard(card.linkedBoardId, trimmed);
    }
  };

  return (
    <div
      id={`bd-card-${card.id}`}
      data-card-id={card.id}
      className={`${inColumn ? "relative w-full" : "absolute"} rounded-lg shadow-md border border-black/10 overflow-hidden bg-white flex flex-col`}
      style={inColumn ? { height: card.height } : { left: card.x, top: card.y, width: card.width, height: card.height }}
      onPointerDown={(e) => onDragStart(e, card)}
    >
      <DeleteButton onClick={() => onDelete(card)} />

      {/* Color swatch, bottom-left of the preview — sets the LINKED
          board's actual color (same one shown on the boards list and
          inside that board's own canvas), not a separate card color. */}
      <button
        ref={swatchRef}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={openColorPicker}
        className="absolute bottom-9 left-1.5 w-4 h-4 rounded-full border border-black/20"
        style={{ backgroundColor: linkedBoardColor || "#ffffff" }}
        title="Change this board's color"
      />

      {/* Thumbnail only — double-click here opens the board. Name is
          handled separately below so renaming and opening don't
          conflict on the same gesture. */}
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenBoard(card.linkedBoardId);
        }}
        className="flex-1 min-h-0 p-1 cursor-pointer"
      >
        <BoardThumbnail
          uid={uid}
          boardId={card.linkedBoardId}
          boardColor={linkedBoardColor}
          compact
        />
      </div>

      {/* Name — double-click to rename, independent of opening the board. */}
      <div
        className="px-2.5 py-2 border-t border-brand-100 dark:border-brand-700"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={(e) => e.key === "Enter" && handleNameBlur()}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs font-semibold bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        ) : (
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              setNameDraft(linkedBoardName);
              setEditingName(true);
            }}
            className="text-xs font-semibold text-brand-700 dark:text-brand-200 truncate block cursor-pointer"
          >
            {linkedBoardName}
          </span>
        )}
      </div>

      {/* Popover itself is fixed to the viewport (not nested inside
          this card), so it's never clipped by the card's own
          overflow-hidden — rendered last so it visually sits above
          everything regardless of DOM position. */}
      {showColorPicker && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShowColorPicker(false)}
          />
          <div
            className="fixed z-[70] bg-white dark:bg-brand-800 rounded-xl shadow-lg border border-brand-200 dark:border-brand-600 p-3 w-48"
            style={{ top: pickerPos.top, left: pickerPos.left }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="w-full h-12 rounded-lg cursor-pointer border border-brand-200 dark:border-brand-600"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  updateBoardColor(card.linkedBoardId, hex);
                  setShowColorPicker(false);
                }}
                className="flex-1 px-2 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  updateBoardColor(card.linkedBoardId, null);
                  setShowColorPicker(false);
                }}
                className="px-2 py-1.5 text-xs text-brand-500 dark:text-brand-300"
              >
                Clear
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Document editor modal ------------------------------------------

function DocumentModal({ card, onClose, onSave }) {
  const [title, setTitle] = useState(card.title || "");
  const [content, setContent] = useState(card.content || "");

  const handleSave = () => {
    onSave(card.id, { title, content });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-brand-800 rounded-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-brand-100 dark:border-brand-600">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled document"
            className="flex-1 text-lg font-semibold bg-transparent text-brand-800 dark:text-brand-100 focus:outline-none"
          />
          <span className="text-xs text-brand-400 dark:text-brand-500 mx-3 flex-shrink-0">
            {wordCount(content)} words
          </span>
          <button onClick={onClose} className="text-brand-400 dark:text-brand-500 text-xl leading-none">
            &times;
          </button>
        </div>
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Start writing..."
          className="flex-1 w-full p-4 bg-transparent resize-none text-sm text-brand-800 dark:text-brand-100 focus:outline-none"
        />
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-brand-100 dark:border-brand-600">
          <button onClick={onClose} className="px-4 py-2 text-sm text-brand-500 dark:text-brand-300">
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Color picker popover --------------------------------------------

function ColorPickerPopover({ card, onClose, onSave }) {
  const [hex, setHex] = useState(card.color || "#a878d8");

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-brand-800 rounded-2xl p-4 w-64"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-pixel text-brand-600 dark:text-brand-300 mb-3">PICK A COLOR</p>
        <input
          type="color"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          className="w-full h-24 rounded-lg cursor-pointer border-2 border-brand-200 dark:border-brand-600"
        />
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          className="w-full mt-3 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-400"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => {
              onSave(card.id, { color: hex });
              onClose();
            }}
            className="flex-1 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Apply
          </button>
          <button onClick={onClose} className="px-3 py-2 text-sm text-brand-500 dark:text-brand-300">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Tap an arrow (or its label) to open this — edit the label, toggle
// straight vs curved, or delete the connection entirely.
function ArrowEditorPopover({ arrow, onClose, onSave, onDelete }) {
  const [label, setLabel] = useState(arrow.label || "");
  const [curved, setCurved] = useState(arrow.curved || false);
  const [color, setColor] = useState(arrow.color || "");

  const handleApply = () => {
    onSave(arrow.id, { label, curved, color: color || null });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-brand-800 rounded-2xl p-4 w-72" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-pixel text-brand-600 dark:text-brand-300 mb-3">EDIT ARROW</p>

        <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">Label</label>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. leads to, depends on..."
          className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-accent-400"
        />

        <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">Color</label>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="color"
            value={color || "#8a52c4"}
            onChange={(e) => setColor(e.target.value)}
            className="w-9 h-9 rounded-lg cursor-pointer border border-brand-200 dark:border-brand-600"
          />
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="Default theme color"
            className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setCurved(false)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              !curved ? "bg-brand-600 text-white" : "bg-brand-50 dark:bg-brand-900 text-brand-500 dark:text-brand-300"
            }`}
          >
            Straight
          </button>
          <button
            type="button"
            onClick={() => setCurved(true)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              curved ? "bg-brand-600 text-white" : "bg-brand-50 dark:bg-brand-900 text-brand-500 dark:text-brand-300"
            }`}
          >
            Curved
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleApply}
            className="flex-1 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Save
          </button>
          <button onClick={onClose} className="px-3 py-2 text-sm text-brand-500 dark:text-brand-300">
            Cancel
          </button>
          <button
            onClick={() => {
              onDelete(arrow);
              onClose();
            }}
            className="px-3 py-2 text-sm text-red-500 dark:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main canvas -------------------------------------------------------

function BrainDumpCanvas({ uid, boardId, cards, arrows, boardColor }) {
  const { pushAction, undo, redo, canUndo, canRedo } = useBrainDumpHistory();
  const undoable = makeUndoableActions(pushAction);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const hasAutoFittedRef = useRef(false);

  // Reset auto-fit when switching boards
  useEffect(() => {
    hasAutoFittedRef.current = false;
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [boardId]);

  // Auto-fit to content when the board first loads cards
  useEffect(() => {
    if (hasAutoFittedRef.current) return;
    if (!cards || cards.length === 0) return;
    if (!containerRef.current) return;
    // Small delay so the container has rendered and has real dimensions
    const timer = setTimeout(() => {
      const freeCards = cards.filter((c) => c.type !== "column" && !c.parentId);
      const columnCards = cards.filter((c) => c.type === "column");
      const allItems = [...freeCards, ...columnCards];
      if (allItems.length === 0) return;

      const margin = 64;
      const minX = Math.min(...allItems.map((c) => c.x));
      const minY = Math.min(...allItems.map((c) => c.y));
      const maxX = Math.max(...allItems.map((c) => c.x + (c.width || 200)));
      const maxY = Math.max(...allItems.map((c) => c.y + (c.height || 150)));
      const contentW = maxX - minX;
      const contentH = maxY - minY;

      const containerEl = containerRef.current;
      if (!containerEl) return;
      const { width: viewW, height: viewH } = containerEl.getBoundingClientRect();
      if (viewW === 0 || viewH === 0) return;

      const scaleX = (viewW - margin * 2) / contentW;
      const scaleY = (viewH - margin * 2) / contentH;
      // Fit to content but never zoom below 80% (keeps cards readable)
      // and never zoom above 100% (don't magnify small canvases)
      const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.8), 1);

      const newPan = {
        x: (viewW - contentW * newZoom) / 2 - minX * newZoom,
        y: (viewH - contentH * newZoom) / 2 - minY * newZoom,
      };
      setPan(newPan);
      setZoom(newZoom);
      hasAutoFittedRef.current = true;
    }, 80);
    return () => clearTimeout(timer);
  }, [cards]);

  const panStateRef = useRef(null);
  const dragStateRef = useRef(null);
  const resizeStateRef = useRef(null);

  const [colorPickerCard, setColorPickerCard] = useState(null);
  const [documentCard, setDocumentCard] = useState(null);
  const [sketchCard, setSketchCard] = useState(null);
  const [tableCard, setTableCard] = useState(null);
  const [pendingImageCard, setPendingImageCard] = useState(null);
  const [imageUploadError, setImageUploadError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedArrow, setSelectedArrow] = useState(null);
  const arrowDragRef = useRef(null); // tracks dragging an arrow's endpoint/curve/whole-line handle
  const [arrowDragTick, setArrowDragTick] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []); // bumped on every arrow-drag move to force a re-render
  // Holds the just-committed value for an arrow right after you release
  // a drag, until the real Firestore update actually arrives through
  // the `arrows` prop — without this, there's a brief window where the
  // drag ref has been cleared but the prop still reflects the old
  // pre-drag position, causing a visible "flash back" before the real
  // update catches up.
  const [arrowOptimisticOverrides, setArrowOptimisticOverrides] = useState({});
  // Tracks which card currently has its resize handles revealed via
  // long-press (for mobile where hover doesn't exist).
  const [selectedCardId, setSelectedCardId] = useState(null);
  // Mobile tap-to-place: when an unsorted item is tapped on iOS, we enter
  // this mode — the canvas shows a hint and the next tap places the card.
  const [pendingPlacement, setPendingPlacement] = useState(null); // unsorted item | null

  // Hide the zoom/undo bar whenever any modal or overlay is open — on iPhone
  // the fixed zoom bar can cover modal content and inputs.
  const hasModal = !!(colorPickerCard || documentCard || sketchCard || tableCard || pendingPlacement);

  // --- Panning ---
  // Fit the entire canvas viewport to the screen at 100% zoom, centered.
  const fitToWindow = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Compute a zoom + pan that makes all cards visible on screen with
  // a small margin — works for any screen size (iPhone, iPad, desktop).
  const fitToContent = () => {
    const freeCards = cards.filter((c) => c.type !== "column" && !c.parentId);
    const columnCards = cards.filter((c) => c.type === "column");
    const allItems = [...freeCards, ...columnCards];
    if (allItems.length === 0) { fitToWindow(); return; }

    const margin = 48;
    const minX = Math.min(...allItems.map((c) => c.x));
    const minY = Math.min(...allItems.map((c) => c.y));
    const maxX = Math.max(...allItems.map((c) => c.x + (c.width || 200)));
    const maxY = Math.max(...allItems.map((c) => c.y + (c.height || 150)));
    const contentW = maxX - minX;
    const contentH = maxY - minY;

    const containerEl = containerRef.current;
    if (!containerEl) return;
    const { width: viewW, height: viewH } = containerEl.getBoundingClientRect();

    const scaleX = (viewW - margin * 2) / contentW;
    const scaleY = (viewH - margin * 2) / contentH;
    const newZoom = clampZoom(Math.min(scaleX, scaleY));

    // Pan so content is centered in the viewport at the new zoom level
    const newPan = {
      x: (viewW - contentW * newZoom) / 2 - minX * newZoom,
      y: (viewH - contentH * newZoom) / 2 - minY * newZoom,
    };
    setZoom(newZoom);
    setPan(newPan);
  };

  const handleCanvasPointerDown = (e) => {
    // Tap-to-place mode: a mobile unsorted item is waiting to be placed.
    // Any tap on the canvas (not on a card) places it at the tap position.
    if (pendingPlacement) {
      if (e.target !== e.currentTarget) return; // tapped a card, ignore
      const rect = containerRef.current.getBoundingClientRect();
      const dropPoint = screenToCanvas(e.clientX, e.clientY, rect, pan, zoom);
      const item = pendingPlacement;
      const w = item.cardData?.width || 200;
      const h = item.cardData?.height || 150;
      if (item.cardData) {
        undoable.createCardUndoable(uid, boardId, {
          ...item.cardData,
          x: dropPoint.x - w / 2,
          y: dropPoint.y - h / 2,
          parentId: null,
        });
      } else if (item.type === "note") {
        undoable.createCardUndoable(uid, boardId, {
          type: "text", x: dropPoint.x - 100, y: dropPoint.y - 75,
          width: 200, height: 150, content: item.content || "",
          color: "#f6f0fc", parentId: null,
        });
      } else if (item.type === "sketch") {
        undoable.createCardUndoable(uid, boardId, {
          type: "sketch", x: dropPoint.x - 100, y: dropPoint.y - 75,
          width: 200, height: 150, strokes: item.strokes || [],
          sketchWidth: item.sketchWidth || 800, sketchHeight: item.sketchHeight || 600,
          parentId: null,
        });
      }
      // Signal board to delete from unsorted
      window.dispatchEvent(new CustomEvent("bd-placement-complete", { detail: { itemId: item.id } }));
      setPendingPlacement(null);
      return;
    }

    if (e.target !== e.currentTarget) return;
    setSelectedCardId(null);
    panStateRef.current = { startX: e.clientX, startY: e.clientY, startPan: pan };
  };

  const handleCanvasPointerMove = useCallback(
    (e) => {
      if (panStateRef.current) {
        const dx = e.clientX - panStateRef.current.startX;
        const dy = e.clientY - panStateRef.current.startY;
        setPan({ x: panStateRef.current.startPan.x + dx, y: panStateRef.current.startPan.y + dy });
      }
      if (dragStateRef.current) {
        const drag = dragStateRef.current;

        if (!drag.committed) {
          const screenDx = e.clientX - drag.startScreenX;
          const screenDy = e.clientY - drag.startScreenY;
          if (Math.sqrt(screenDx * screenDx + screenDy * screenDy) < 6) return;
          drag.committed = true;
          document.body.classList.add("bd-dragging");
        }

        const dx = (e.clientX - drag.startScreenX) / zoom;
        const dy = (e.clientY - drag.startScreenY) / zoom;
        const newX = drag.startCardX + dx;
        const newY = drag.startCardY + dy;

        if (!drag.wasInColumn) {
          // Free card: move the DOM element directly for smooth dragging.
          const el = document.getElementById(`bd-card-${drag.cardId}`);
          if (el) {
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
          }
        } else {
          // Column child: ghost follows cursor via React re-render.
          setArrowDragTick((t) => t + 1);
        }

        drag.latestX = newX;
        drag.latestY = newY;
        drag.lastClientX = e.clientX;
        drag.lastClientY = e.clientY;
      }
      if (resizeStateRef.current) {
        const r = resizeStateRef.current;
        const dx = (e.clientX - r.startScreenX) / zoom;
        const dy = (e.clientY - r.startScreenY) / zoom;
        const corner = r.corner || "br";
        // Width grows right for br/tr, grows left (card moves) for bl/tl
        const newWidth = Math.max(80, corner.endsWith("r") ? r.startWidth + dx : r.startWidth - dx);
        // Height grows down for br/bl, grows up (card moves) for tr/tl
        const newHeight = Math.max(60, corner.startsWith("b") ? r.startHeight + dy : r.startHeight - dy);
        const newX = corner.endsWith("l") ? r.startX + (r.startWidth - newWidth) : r.startX;
        const newY = corner.startsWith("t") ? r.startY + (r.startHeight - newHeight) : r.startY;
        const el = document.getElementById(`bd-card-${r.cardId}`);
        if (el) {
          el.style.width = `${newWidth}px`;
          el.style.height = `${newHeight}px`;
          el.style.left = `${newX}px`;
          el.style.top = `${newY}px`;
        }
        r.latestWidth = newWidth;
        r.latestHeight = newHeight;
        r.latestX = newX;
        r.latestY = newY;
      }
      if (arrowDragRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const point = screenToCanvas(e.clientX, e.clientY, rect, pan, zoom);
        const drag = arrowDragRef.current;
        const dx = point.x - drag.startPoint.x;
        const dy = point.y - drag.startPoint.y;

        if (drag.mode === "endpoint1") {
          drag.latest = { x1: drag.start.x1 + dx, y1: drag.start.y1 + dy };
        } else if (drag.mode === "endpoint2") {
          drag.latest = { x2: drag.start.x2 + dx, y2: drag.start.y2 + dy };
        } else if (drag.mode === "curve") {
          drag.latest = { curveX: drag.start.curveX + dx, curveY: drag.start.curveY + dy };
        } else if (drag.mode === "whole") {
          drag.latest = {
            x1: drag.start.x1 + dx,
            y1: drag.start.y1 + dy,
            x2: drag.start.x2 + dx,
            y2: drag.start.y2 + dy,
            curveX: drag.start.curveX + dx,
            curveY: drag.start.curveY + dy,
          };
        }
        setArrowDragTick((t) => t + 1); // force a re-render so the live preview follows the pointer
      }
    },
    [zoom, pan]
  );

  const handleCanvasPointerUp = useCallback(() => {
    document.body.style.userSelect = "";
    document.body.classList.remove("bd-dragging");
    panStateRef.current = null;

    if (dragStateRef.current) {
      const drag = dragStateRef.current;
      // Clear ref FIRST to prevent any re-entrant calls from firing this twice
      dragStateRef.current = null;

      if (drag.committed) {
        // Check if released over the unsorted panel
        const unsortedPanel = document.querySelector('[data-unsorted-panel="true"]');
        const overUnsorted = unsortedPanel && drag.lastClientX !== undefined && (() => {
          const r = unsortedPanel.getBoundingClientRect();
          return drag.lastClientX >= r.left && drag.lastClientX <= r.right &&
                 drag.lastClientY >= r.top && drag.lastClientY <= r.bottom;
        })();

        if (overUnsorted && !drag.isColumn) {
          createUnsortedCard(uid, drag.card);
          undoable.deleteCardUndoable(drag.card);
          return;
        }

        // Guard: if latestX is undefined, the card never moved — skip update
        if (drag.latestX === undefined || drag.latestY === undefined) return;

        if (drag.isColumn) {
          const dx = drag.latestX - drag.startCardX;
          const dy = drag.latestY - drag.startCardY;
          moveGroupWithChildren(drag.card, dx, dy, drag.childCards);
        } else {
          // Check if the card was dropped over a column
          let targetColumnId = null;
          if (drag.lastClientX !== undefined) {
            const columnEls = Array.from(document.querySelectorAll('[data-column="true"]')).filter(
              (el) => el.dataset.cardId !== drag.cardId
            );
            const columnEl = columnEls.find((el) => {
              const r = el.getBoundingClientRect();
              return drag.lastClientX >= r.left && drag.lastClientX <= r.right &&
                     drag.lastClientY >= r.top && drag.lastClientY <= r.bottom;
            });
            if (columnEl) targetColumnId = columnEl.dataset.cardId;
          }

          if (targetColumnId) {
            const newOrder = Date.now();
            const prevParentId = drag.card.parentId ?? null;
            const prevOrder = drag.card.order || 0;
            updateCard(drag.cardId, { parentId: targetColumnId, order: newOrder });
            pushAction({
              undo: () => updateCard(drag.cardId, { parentId: prevParentId, order: prevOrder }),
              redo: () => updateCard(drag.cardId, { parentId: targetColumnId, order: newOrder }),
            });
          } else {
            const prevX = drag.startCardX;
            const prevY = drag.startCardY;
            const prevParentId = drag.card.parentId ?? null;
            updateCard(drag.cardId, { x: drag.latestX, y: drag.latestY, parentId: null });
            pushAction({
              undo: () => updateCard(drag.cardId, { x: prevX, y: prevY, parentId: prevParentId }),
              redo: () => updateCard(drag.cardId, { x: drag.latestX, y: drag.latestY, parentId: null }),
            });
          }
        }
      }
    }

    if (resizeStateRef.current) {
      const r = resizeStateRef.current;
      resizeStateRef.current = null; // clear first
      if (r.latestWidth !== undefined) {
        const changes = { width: r.latestWidth, height: r.latestHeight };
        if (r.latestX !== undefined) { changes.x = r.latestX; changes.y = r.latestY; }
        updateCard(r.cardId, changes);
      }
    }

    if (arrowDragRef.current) {
      const drag = arrowDragRef.current;
      arrowDragRef.current = null; // clear first
      if (drag.latest) {
        updateArrow(drag.arrowId, drag.latest);
        setArrowOptimisticOverrides((prev) => ({ ...prev, [drag.arrowId]: drag.latest }));
        const previousValues = {};
        for (const key of Object.keys(drag.latest)) previousValues[key] = drag.start[key];
        pushAction({
          undo: () => updateArrow(drag.arrowId, previousValues),
          redo: () => updateArrow(drag.arrowId, drag.latest),
        });
      }
    }
  }, [uid, boardId]);

  useEffect(() => {
    window.addEventListener("pointermove", handleCanvasPointerMove);
    window.addEventListener("pointerup", handleCanvasPointerUp);
    window.addEventListener("pointercancel", handleCanvasPointerUp); // iOS touch cancel
    return () => {
      window.removeEventListener("pointermove", handleCanvasPointerMove);
      window.removeEventListener("pointerup", handleCanvasPointerUp);
      window.removeEventListener("pointercancel", handleCanvasPointerUp);
    };
  }, [handleCanvasPointerMove, handleCanvasPointerUp]);

  // Once the real `arrows` prop reflects an optimistic override (i.e.
  // Firestore's update has actually arrived), drop that override —
  // otherwise it would keep masking any further real changes forever.
  useEffect(() => {
    setArrowOptimisticOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const arrowId of Object.keys(prev)) {
        const realArrow = arrows.find((a) => a.id === arrowId);
        const override = prev[arrowId];
        const matches =
          realArrow && Object.keys(override).every((key) => realArrow[key] === override[key]);
        if (matches) {
          delete next[arrowId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [arrows]);

  // Keyboard shortcuts: Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z or
  // Ctrl/Cmd+Y to redo — standard convention in tools like this.
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isModifier = e.ctrlKey || e.metaKey;
      if (!isModifier) return;
      // Don't hijack undo/redo while typing in a text field.
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Pending drag: pointerdown sets a short timer. If the pointer is
  // released before the timer fires (a tap or double-tap), we cancel
  // without ever setting dragStateRef, so click/dblclick events fire
  // normally. Only a sustained hold (>150ms) commits to a drag.
  const handleCardDragStart = (e, card) => {
    e.stopPropagation();
    e.preventDefault(); // prevents native text drag on notes
    const isColumn = card.type === "column";
    const wasInColumn = Boolean(card.parentId) && !isColumn;

    document.body.style.userSelect = "none";

    const childCards = isColumn ? cards.filter((c) => c.parentId === card.id) : [];
    let startCardX = card.x;
    let startCardY = card.y;
    if (wasInColumn) {
      const rect = containerRef.current.getBoundingClientRect();
      const point = screenToCanvas(e.clientX, e.clientY, rect, pan, zoom);
      startCardX = point.x - card.width / 2;
      startCardY = point.y - card.height / 2;
    }

    dragStateRef.current = {
      cardId: card.id,
      card,
      isColumn,
      childCards,
      wasInColumn,
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startCardX,
      startCardY,
      committed: false,
    };

    const maxZ = Math.max(0, ...cards.map((c) => c.zIndex || 1));
    if ((card.zIndex || 1) <= maxZ) {
      updateCard(card.id, { zIndex: maxZ + 1 });
    }
  };

  const handleResizeStart = (e, card, corner = "br") => {
    e.stopPropagation();
    e.preventDefault();
    document.body.style.userSelect = "none";
    resizeStateRef.current = {
      cardId: card.id,
      corner, // br | bl | tr | tl
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      startWidth: card.width,
      startHeight: card.height,
      startX: card.x,
      startY: card.y,
    };
  };

  // --- Dragging an arrow's endpoint, curve handle, or whole-line move
  // handle. mode is one of "endpoint1" | "endpoint2" | "curve" | "whole".
  const handleArrowDragStart = (e, arrow, mode) => {
    e.stopPropagation();
    e.preventDefault();
    document.body.style.userSelect = "none";
    const rect = containerRef.current.getBoundingClientRect();
    const startPoint = screenToCanvas(e.clientX, e.clientY, rect, pan, zoom);
    arrowDragRef.current = {
      arrowId: arrow.id,
      mode,
      startPoint,
      start: { x1: arrow.x1, y1: arrow.y1, x2: arrow.x2, y2: arrow.y2, curveX: arrow.curveX, curveY: arrow.curveY },
      latest: null,
    };
  };

  // --- Zoom ---
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const pointBefore = screenToCanvas(e.clientX, e.clientY, rect, pan, zoom);
      const newZoom = clampZoom(zoom - e.deltaY * 0.001);
      const newPan = {
        x: e.clientX - rect.left - pointBefore.x * newZoom,
        y: e.clientY - rect.top - pointBefore.y * newZoom,
      };
      setZoom(newZoom);
      setPan(newPan);
    },
    [pan, zoom]
  );

  // React's onWheel prop attaches the listener as passive by default,
  // which silently blocks preventDefault() and logs a console warning
  // (this is what caused "Unable to preventDefault inside passive
  // event listener"). Attaching manually with { passive: false } lets
  // us actually intercept the wheel event to drive zoom instead of the
  // browser's normal page-scroll behavior.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // --- Drop new cards from the toolbar ---
  const handleDragOver = (e) => e.preventDefault();

  // Core drop logic — shared between HTML5 drag (desktop) and the
  // custom bd-toolbar-drop event from the pointer-based toolbar (iOS).
  const handleCardDropAt = useCallback(async (cardType, clientX, clientY) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropPoint = screenToCanvas(clientX, clientY, rect, pan, zoom);

    if (cardType === "arrow") {
      undoable.createArrowUndoable(uid, boardId, dropPoint.x, dropPoint.y - 40, dropPoint.x, dropPoint.y + 40);
      return;
    }

    const columnEls = Array.from(document.querySelectorAll('[data-column="true"]'));
    const columnEl = columnEls.find((el) => {
      const r = el.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    });
    const parentId = columnEl ? columnEl.dataset.cardId : null;
    let newCardOrder = 0;
    if (parentId) newCardOrder = Date.now();

    const baseProps = parentId
      ? { parentId, x: 0, y: 0, order: newCardOrder }
      : { x: dropPoint.x, y: dropPoint.y, parentId: null };

    if (cardType === "text") {
      undoable.createCardUndoable(uid, boardId, {
        type: "text",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 100, y: dropPoint.y - 75 }),
        width: 200,
        height: 150,
        content: "",
        color: "#f6f0fc",
      });
    } else if (cardType === "title") {
      undoable.createCardUndoable(uid, boardId, {
        type: "title",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 100, y: dropPoint.y - 24 }),
        width: 220,
        height: 48,
        content: "",
      });
    } else if (cardType === "color") {
      undoable.createCardUndoable(uid, boardId, {
        type: "color",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 60, y: dropPoint.y - 60 }),
        width: 120,
        height: 120,
        color: "#a878d8",
      });
    } else if (cardType === "image") {
      undoable.createCardUndoable(uid, boardId, {
        type: "image",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 100, y: dropPoint.y - 75 }),
        width: 200,
        height: 150,
        imageUrl: "",
      });
    } else if (cardType === "document") {
      undoable.createCardUndoable(uid, boardId, {
        type: "document",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 90, y: dropPoint.y - 60 }),
        width: 180,
        height: 120,
        title: "",
        content: "",
      });
    } else if (cardType === "sketch") {
      undoable.createCardUndoable(uid, boardId, {
        type: "sketch",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 100, y: dropPoint.y - 75 }),
        width: 200,
        height: 150,
        strokes: [],
      });
    } else if (cardType === "link") {
      undoable.createCardUndoable(uid, boardId, {
        type: "link",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 100, y: dropPoint.y - 80 }),
        width: 200,
        height: 160,
        linkUrl: "",
        linkTitle: "",
        linkDescription: "",
        linkImage: "",
        linkDomain: "",
        color: "#5fa3d6",
      });
    } else if (cardType === "table") {
      undoable.createCardUndoable(uid, boardId, {
        type: "table",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 110, y: dropPoint.y - 75 }),
        width: 220,
        height: 150,
        tableData: DEFAULT_TABLE,
      });
    } else if (cardType === "list") {
      undoable.createCardUndoable(uid, boardId, {
        type: "list",
        ...baseProps,
        ...(parentId ? {} : { x: dropPoint.x - 90, y: dropPoint.y - 70 }),
        width: 200,
        height: 200,
        listItems: [{ id: Date.now().toString(), text: "", checked: false }],
        listMode: "bullet",
      });
    } else if (cardType === "column") {
      // Columns themselves can't be dropped inside another column.
      undoable.createCardUndoable(uid, boardId, {
        type: "column",
        x: dropPoint.x - 110,
        y: dropPoint.y - 20,
        width: 220,
        height: 100,
        title: "Column",
      });
    } else if (cardType === "board") {
      // Nested boards always land as a free card on the canvas, even if
      // dropped over a column — createNestedBoard creates both the
      // sub-board and its linking card together, which doesn't cleanly
      // support being parented into a column's stack in this version.
      createNestedBoard(uid, boardId, dropPoint.x - 90, dropPoint.y - 65);
    }
  }, [pan, zoom, uid, boardId, undoable]);

  // HTML5 drop event — desktop browsers
  const handleDrop = (e) => {
    e.preventDefault();
    const cardType = e.dataTransfer.getData("text/bd-card-type");
    if (cardType) handleCardDropAt(cardType, e.clientX, e.clientY);
  };

  useEffect(() => {
    const handler = (e) => {
      const { item, clientX, clientY } = e.detail;
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      // If the drop landed outside the canvas area (e.g. over the unsorted
      // panel itself), don't create a card — the item stays in unsorted.
      if (clientX < rect.left || clientX > rect.right ||
          clientY < rect.top  || clientY > rect.bottom) return;

      const dropPoint = screenToCanvas(clientX, clientY, rect, pan, zoom);
      const w = item.cardData?.width || 200;
      const h = item.cardData?.height || 150;

      // Signal back to BrainDumpBoard that the drop was accepted
      e.detail.accepted = true;

      if (item.cardData) {
        undoable.createCardUndoable(uid, boardId, {
          ...item.cardData,
          x: dropPoint.x - w / 2,
          y: dropPoint.y - h / 2,
          parentId: null,
        });
      } else if (item.type === "note") {
        undoable.createCardUndoable(uid, boardId, {
          type: "text",
          x: dropPoint.x - 100, y: dropPoint.y - 75,
          width: 200, height: 150,
          content: item.content || "",
          color: "#f6f0fc", parentId: null,
        });
      } else if (item.type === "sketch") {
        undoable.createCardUndoable(uid, boardId, {
          type: "sketch",
          x: dropPoint.x - 100, y: dropPoint.y - 75,
          width: 200, height: 150,
          strokes: item.strokes || [],
          sketchWidth: item.sketchWidth || 800,
          sketchHeight: item.sketchHeight || 600,
          parentId: null,
        });
      }
    };
    window.addEventListener("bd-unsorted-drop", handler);
    return () => window.removeEventListener("bd-unsorted-drop", handler);
  }, [pan, zoom, uid, boardId, undoable]);

  // Mobile tap-to-place: listen for an unsorted item tapped on iOS.
  // Entering this mode shows a canvas hint; the next canvas tap places the card.
  useEffect(() => {
    const handler = (e) => setPendingPlacement(e.detail.item);
    window.addEventListener("bd-unsorted-tap-place", handler);
    return () => window.removeEventListener("bd-unsorted-tap-place", handler);
  }, []);

  // Listen for the custom event dispatched by the pointer-based toolbar
  // drag system — this is what makes iOS drag-and-drop work, since the
  // native HTML5 drag API is broken on iOS Safari.
  useEffect(() => {
    const handler = (e) => handleCardDropAt(e.detail.type, e.detail.clientX, e.detail.clientY);
    window.addEventListener("bd-toolbar-drop", handler);
    return () => window.removeEventListener("bd-toolbar-drop", handler);
  }, [handleCardDropAt]);

  // --- Image picker flow ---
  const handleOpenImagePicker = (card) => {
    setPendingImageCard(card);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingImageCard) return;

    setImageUploadError("");
    setUploadingImage(true);
    try {
      const url = await uploadBrainDumpImage(uid, boardId, file);
      await updateCard(pendingImageCard.id, { imageUrl: url });
    } catch (err) {
      console.error("Image upload failed:", err);
      setImageUploadError(err.message || "Couldn't add that image — please try again.");
    } finally {
      setUploadingImage(false);
      setPendingImageCard(null);
    }
  };

  // Renders the right card component for a given card's type. When
  // inColumn is true, the card renders without its own absolute x/y
  // (the column's flex layout positions it instead) and at the
  // column's full inner width, since column children give up free
  // positioning in exchange for auto-stacking.
  const renderCardInline = (card, { inColumn }) => {
    const common = {
      card: inColumn ? { ...card, x: 0, y: 0 } : card,
      onUpdate: updateCard,
      onDelete: (c) => undoable.deleteCardUndoable(c),
      onDragStart: handleCardDragStart,
      inColumn,
      zIndex: inColumn ? undefined : card.zIndex || 1,
    };

    const rendered = (() => {
      if (card.type === "text") return <TextCard key={card.id} {...common} onOpenColorPicker={setColorPickerCard} />;
      if (card.type === "title") return <TitleCard key={card.id} {...common} onOpenColorPicker={setColorPickerCard} />;
      if (card.type === "color") return <ColorCard key={card.id} {...common} onOpenColorPicker={setColorPickerCard} />;
      if (card.type === "image") return <ImageCard key={card.id} {...common} onOpenImagePicker={handleOpenImagePicker} />;
      if (card.type === "document") return <DocumentCard key={card.id} {...common} onOpenDocument={setDocumentCard} />;
      if (card.type === "sketch") return <SketchCard key={card.id} {...common} onOpenSketch={setSketchCard} />;
      if (card.type === "link") return <LinkCard key={card.id} {...common} />;
      if (card.type === "table") return <TableCard key={card.id} {...common} onOpenTable={setTableCard} />;
      if (card.type === "list") return <ListCard key={card.id} {...common} />;
      if (card.type === "board") return <BoardLinkCardWrapper key={card.id} card={card} common={common} uid={uid} />;
      return null;
    })();

    // Column children skip the resize wrapper — their size is managed
    // by the column's auto-stacking layout, not by manual dragging.
    if (inColumn || !rendered) return rendered;

    return (
      <React.Fragment key={card.id}>
        {rendered}
        {/* Invisible overlay that exactly covers the card's bounding box
            so the four corner handles land precisely on its corners.
            Also detects long-press (500ms) to reveal handles on mobile
            where hover doesn't exist. pointer-events-none lets clicks
            pass through to the card; handles re-enable their own events. */}
        <LongPressOverlay
          card={card}
          selectedCardId={selectedCardId}
          setSelectedCardId={setSelectedCardId}
          onResizeStart={handleResizeStart}
        />
      </React.Fragment>
    );
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-brand-50 dark:bg-brand-950 touch-none select-none cursor-default"
      data-bd-canvas="true"
      style={{
        backgroundImage: "radial-gradient(circle, var(--bd-dot-color, #ddc9f2) 1px, transparent 1px)",
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        backgroundColor: boardColor ? `${boardColor}1a` : undefined, // ~10% opacity tint, dot grid still shows through
      }}
      onPointerDown={handleCanvasPointerDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className="absolute top-0 left-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        {/* Arrows render on top of every card (z-index), per spec —
            despite being declared first in the markup for layout
            convenience, the explicit z-index ensures they're never
            visually hidden behind a card placed later. */}
        <svg
          className="absolute"
          style={{
            left: -2000,
            top: -2000,
            width: 8000,
            height: 8000,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: 50,
          }}
        >
          <defs>
            {/* One arrowhead marker per arrow, so each can carry its own
                custom color independently of the shared theme default. */}
            {arrows.map((arrow) => (
              <marker
                key={arrow.id}
                id={`bd-arrowhead-${arrow.id}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill={arrow.color || "var(--bd-arrow-color, #8a52c4)"} />
              </marker>
            ))}
          </defs>
          {arrows.map((arrow) => {
            // While this specific arrow is being actively dragged, use
            // the live in-progress values. After release but before
            // Firestore's real update has propagated back, fall back to
            // the optimistic override instead — this is what prevents
            // the brief "flash back to the old position" glitch.
            const live =
              arrowDragRef.current?.arrowId === arrow.id
                ? arrowDragRef.current.latest
                : arrowOptimisticOverrides[arrow.id] || null;
            const a = { ...arrow, ...live };
            const strokeColor = arrow.color || "var(--bd-arrow-color, #8a52c4)";

            const p1 = { x: 2000 + a.x1, y: 2000 + a.y1 };
            const p2 = { x: 2000 + a.x2, y: 2000 + a.y2 };
            const curve = { x: 2000 + (a.curveX ?? (a.x1 + a.x2) / 2), y: 2000 + (a.curveY ?? (a.y1 + a.y2) / 2) };
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            // The control point (curve) sits OFF the visible line by
            // design — that's what makes it bend. The label needs to
            // sit ON the line, like it does for a straight arrow, so
            // it shouldn't use the control point directly. The actual
            // point on a quadratic bezier at its midpoint (t=0.5) is
            // this weighted average, which IS on the visible curve.
            const onCurveMidpoint = {
              x: 0.25 * p1.x + 0.5 * curve.x + 0.25 * p2.x,
              y: 0.25 * p1.y + 0.5 * curve.y + 0.25 * p2.y,
            };
            const labelAnchor = a.curved ? onCurveMidpoint : { x: midX, y: midY };

            const pathD = a.curved
              ? `M ${p1.x} ${p1.y} Q ${curve.x} ${curve.y} ${p2.x} ${p2.y}`
              : `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;

            return (
              <g key={arrow.id}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="2"
                  markerEnd={`url(#bd-arrowhead-${arrow.id})`}
                />
                {/* Wider invisible hit-area so the line is easy to tap,
                    and doubles as the "whole arrow" move handle. Double
                    click opens the editor, since a single click would
                    conflict with starting a drag-to-move. */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  style={{ cursor: "grab", pointerEvents: "stroke" }}
                  onPointerDown={(e) => handleArrowDragStart(e, arrow, "whole")}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedArrow(arrow);
                  }}
                />

                {/* Endpoint handles — the "point on top" and "point on
                    bottom" the person can grab and move independently. */}
                <circle
                  cx={p1.x}
                  cy={p1.y}
                  r="7"
                  fill="white"
                  stroke={strokeColor}
                  strokeWidth="2"
                  style={{ cursor: "grab", pointerEvents: "auto" }}
                  onPointerDown={(e) => handleArrowDragStart(e, arrow, "endpoint1")}
                />
                <circle
                  cx={p2.x}
                  cy={p2.y}
                  r="7"
                  fill="white"
                  stroke={strokeColor}
                  strokeWidth="2"
                  style={{ cursor: "grab", pointerEvents: "auto" }}
                  onPointerDown={(e) => handleArrowDragStart(e, arrow, "endpoint2")}
                />

                {/* Curve handle — dragging this bends the line. Always
                    present but only visually distinct/draggable once
                    "curved" is on, matching the spec ("if I want to
                    curve there's a point in the middle"). */}
                {a.curved && (
                  <circle
                    cx={curve.x}
                    cy={curve.y}
                    r="6"
                    fill={strokeColor}
                    stroke="white"
                    strokeWidth="2"
                    style={{ cursor: "grab", pointerEvents: "auto" }}
                    onPointerDown={(e) => handleArrowDragStart(e, arrow, "curve")}
                  />
                )}

                {arrow.label && (
                  <g style={{ pointerEvents: "auto" }}>
                    <rect
                      x={labelAnchor.x - arrow.label.length * 3 - 6}
                      y={labelAnchor.y - 10}
                      width={arrow.label.length * 6 + 12}
                      height="18"
                      rx="9"
                      fill="white"
                      stroke={strokeColor}
                      strokeWidth="1"
                    />
                    <text
                      x={labelAnchor.x}
                      y={labelAnchor.y + 3}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#3c1968"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedArrow(arrow);
                      }}
                    >
                      {arrow.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Columns render next so they sit visually behind any free
            cards that happen to overlap them on the canvas. */}
        {cards
          .filter((c) => c.type === "column")
          .map((card) => {
            const childCards = cards
              .filter((c) => c.parentId === card.id)
              .sort((a, b) => {
                const orderDiff = (a.order || 0) - (b.order || 0);
                if (orderDiff !== 0) return orderDiff;
                // Tiebreaker: createdAt timestamp for cards with the same
                // legacy order value (e.g. everything at order: 0).
                const aTime = a.createdAt?.toMillis?.() ?? 0;
                const bTime = b.createdAt?.toMillis?.() ?? 0;
                return aTime - bTime;
              });
            return (
              <ColumnCard
                key={card.id}
                card={card}
                childCards={childCards}
                onUpdate={updateCard}
                onDelete={(c) => undoable.deleteCardUndoable(c)}
                onDragStart={handleCardDragStart}
                onOpenColorPicker={setColorPickerCard}
                renderChildCard={(child) => {
                  const isBeingDragged = dragStateRef.current?.cardId === child.id
                    && dragStateRef.current?.wasInColumn
                    && dragStateRef.current?.committed;
                  if (isBeingDragged) {
                    return <div key={child.id} style={{ width: "100%", height: child.height, opacity: 0 }} />;
                  }
                  return (
                    <div key={child.id} className="relative" style={{ width: "100%" }}>
                      {renderCardInline(child, { inColumn: true })}
                    </div>
                  );
                }}
              />
            );
          })}

        {/* Free-floating cards: anything not inside a column and not a
            column itself. Cards with a parentId are rendered by their
            column instead, so they're excluded here to avoid duplicates. */}
        {cards
          .filter((c) => c.type !== "column" && !c.parentId)
          .map((card) => renderCardInline(card, { inColumn: false }))}

        {/* Drag ghost: while dragging a card OUT of a column, it
            can't be repositioned via direct DOM manipulation (it's
            nested inside the column's own subtree) — so instead it
            renders here as a genuine sibling positioned directly in
            canvas coordinates, following the cursor each tick. The
            original in-column instance is hidden while this is active. */}
        {dragStateRef.current?.wasInColumn && dragStateRef.current?.committed &&
          (() => {
            const drag = dragStateRef.current;
            const liveX = drag.latestX ?? drag.startCardX;
            const liveY = drag.latestY ?? drag.startCardY;
            const ghostCard = { ...drag.card, x: liveX, y: liveY };
            return (
              <div key="drag-ghost" className="pointer-events-none opacity-90" style={{ zIndex: 9999 }}>
                {renderCardInline(ghostCard, { inColumn: false })}
              </div>
            );
          })()}
      </div>

      {/* Tap-to-place overlay — shown on mobile when an unsorted item is
          waiting to be placed. Tapping anywhere on the canvas places it. */}
      {pendingPlacement && (
        <div className="fixed inset-x-0 top-16 z-[190] flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-brand-800/90 dark:bg-brand-900/90 text-white px-4 py-2.5 rounded-2xl shadow-lg">
            <span className="text-base">👆</span>
            <div>
              <p className="text-xs font-medium">Tap anywhere to place</p>
              <p className="text-[10px] opacity-70">
                {(pendingPlacement.cardData?.type || pendingPlacement.type || "item")}
              </p>
            </div>
            <button
              className="ml-2 text-white/60 hover:text-white text-lg leading-none pointer-events-auto"
              onClick={() => setPendingPlacement(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Combined zoom + undo/redo widget — hidden when any modal is open
          so it doesn't cover modal content or inputs on iPhone. */}
      {!hasModal && <div
        className="fixed flex items-center gap-2 rounded-2xl bg-white dark:bg-brand-800 shadow-md border border-brand-100 dark:border-brand-700"
        style={{
          zIndex: 200,
          ...(isMobile
            ? { right: 8, top: "50%", transform: "translateY(-50%)", flexDirection: "column-reverse", padding: "12px 6px" }
            : { bottom: 12, right: 12, flexDirection: "row", padding: "6px 12px" }
          )
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Undo */}
        <button onClick={undo} disabled={!canUndo}
          className="w-7 h-7 rounded-full flex items-center justify-center text-brand-500 dark:text-brand-300 disabled:opacity-30 disabled:cursor-default hover:bg-brand-50 dark:hover:bg-brand-700 flex-shrink-0"
          title="Undo"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        {/* Redo */}
        <button onClick={redo} disabled={!canRedo}
          className="w-7 h-7 rounded-full flex items-center justify-center text-brand-500 dark:text-brand-300 disabled:opacity-30 disabled:cursor-default hover:bg-brand-50 dark:hover:bg-brand-700 flex-shrink-0"
          title="Redo"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>

        {/* Divider */}
        <div className={isMobile ? "w-5 h-px bg-brand-200 dark:bg-brand-600" : "h-5 w-px bg-brand-200 dark:bg-brand-600"} />

        {/* Fit to window */}
        <button onClick={fitToWindow} title="Reset zoom (100%)"
          className="text-brand-400 hover:text-brand-600 dark:hover:text-brand-200 flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          </svg>
        </button>

        {/* Zoom out */}
        <button onClick={() => setZoom(clampZoom(zoom - 0.1))} title="Zoom out"
          className="text-brand-400 hover:text-brand-600 dark:hover:text-brand-200 text-base leading-none flex-shrink-0 w-4 text-center"
        >−</button>

        {/* Slider */}
        <input type="range" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="accent-accent-500"
          style={isMobile
            ? { writingMode: "vertical-lr", direction: "rtl", height: 80, width: "auto" }
            : { width: 80 }
          }
          title={`Zoom: ${Math.round(zoom * 100)}%`}
        />

        {/* Zoom in */}
        <button onClick={() => setZoom(clampZoom(zoom + 0.1))} title="Zoom in"
          className="text-brand-400 hover:text-brand-600 dark:hover:text-brand-200 text-base leading-none flex-shrink-0 w-4 text-center"
        >+</button>

        {/* Percentage */}
        <span className="text-xs text-brand-400 w-8 text-center flex-shrink-0 tabular-nums">
          {Math.round(zoom * 100)}%
        </span>

        {/* Fit to content */}
        <button onClick={fitToContent} title="Fit all content to screen"
          className="text-brand-400 hover:text-brand-600 dark:hover:text-brand-200 flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            <rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
        </button>
      </div>}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />

      {uploadingImage && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white dark:bg-brand-800 rounded-full px-4 py-2 text-xs text-brand-600 dark:text-brand-300 shadow-lg z-30">
          Adding image...
        </div>
      )}
      {imageUploadError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2 text-xs text-red-600 dark:text-red-300 shadow-lg z-30 flex items-center gap-2">
          {imageUploadError}
          <button onClick={() => setImageUploadError("")} className="text-red-400 hover:text-red-600">
            &times;
          </button>
        </div>
      )}

      {colorPickerCard && (
        <ColorPickerPopover card={colorPickerCard} onClose={() => setColorPickerCard(null)} onSave={updateCard} />
      )}
      {documentCard && (
        <DocumentModal card={documentCard} onClose={() => setDocumentCard(null)} onSave={updateCard} />
      )}
      {sketchCard && (
        <SketchModal card={sketchCard} onClose={() => setSketchCard(null)} onSave={updateCard} />
      )}
      {tableCard && (
        <TableModal card={tableCard} onClose={() => setTableCard(null)} onSave={updateCard} />
      )}
      {selectedArrow && (
        <ArrowEditorPopover
          arrow={selectedArrow}
          onClose={() => setSelectedArrow(null)}
          onSave={updateArrow}
          onDelete={undoable.deleteArrowUndoable}
        />
      )}
    </div>
  );
}

// Small wrapper so BoardLinkCard can use react-router's Link/navigate
// without every other card needing the same import.
function BoardLinkCardWrapper({ card, common, uid }) {
  return (
    <BoardLinkCard
      {...common}
      uid={uid}
      onOpenBoard={(linkedBoardId) => {
        window.location.href = `/brain-dump/${linkedBoardId}`;
      }}
    />
  );
}

export default BrainDumpCanvas;
