import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { auth } from "../firebase";
import { listenToCards, listenToBoard, renameBoard, listenToArrows, updateBoardColor, getBoardAncestry, deleteUnsorted, createCard } from "../lib/brainDump";
import BrainDumpCanvas from "../components/BrainDumpCanvas";
import BrainDumpToolbar from "../components/BrainDumpToolbar";
import UnsortedPanel from "../components/UnsortedPanel";

function BoardColorPicker({ board }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(board.color || "#a878d8");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-5 h-5 rounded-full border border-brand-300 dark:border-brand-600 flex-shrink-0"
        style={{ backgroundColor: board.color || "transparent" }}
        title="Change board color"
      >
        {!board.color && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 mx-auto text-brand-400">
            <circle cx="12" cy="12" r="8" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-7 right-0 z-40 bg-white dark:bg-brand-800 rounded-xl shadow-lg border border-brand-200 dark:border-brand-600 p-3 w-56">
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="w-full h-16 rounded-lg cursor-pointer border border-brand-200 dark:border-brand-600"
            />
            <input
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="w-full mt-2 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => {
                  updateBoardColor(board.id, hex);
                  setOpen(false);
                }}
                className="flex-1 px-2 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  updateBoardColor(board.id, null);
                  setOpen(false);
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

function BoardNameEditor({ board }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(board?.name || "");

  if (!board?.name) return null;

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed && trimmed !== board.name) renameBoard(board.id, trimmed);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.target.blur();
          if (e.key === "Escape") {
            setDraft(board.name);
            setEditing(false);
          }
        }}
        className="text-sm font-semibold text-brand-700 dark:text-brand-200 bg-brand-50 dark:bg-brand-900 rounded-lg px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-accent-400"
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(board.name);
        setEditing(true);
      }}
      className="text-sm font-semibold text-brand-700 dark:text-brand-200 truncate hover:text-accent-500 dark:hover:text-accent-300 text-left"
      title="Tap to rename this board"
    >
      {board.name}
    </button>
  );
}

function BrainDumpBoard() {
  const { boardId } = useParams();
  const uid = auth.currentUser?.uid;
  const [cards, setCards] = useState([]);
  const [arrows, setArrows] = useState([]);
  const [board, setBoard] = useState(null);
  const [ancestry, setAncestry] = useState([]);
  const [showUnsorted, setShowUnsorted] = useState(false);

  useEffect(() => {
    if (!uid || !boardId) return;
    return listenToCards(uid, boardId, setCards);
  }, [uid, boardId]);

  useEffect(() => {
    if (!uid || !boardId) return;
    return listenToArrows(uid, boardId, setArrows);
  }, [uid, boardId]);

  useEffect(() => {
    if (!boardId) return;
    return listenToBoard(boardId, setBoard);
  }, [boardId]);

  useEffect(() => {
    if (!board?.parentBoardId) { setAncestry([]); return; }
    let cancelled = false;
    getBoardAncestry(boardId).then((chain) => { if (!cancelled) setAncestry(chain); });
    return () => { cancelled = true; };
  }, [boardId, board?.parentBoardId]);

  // When an unsorted item is dragged onto this canvas: create a real
  // card from its content and remove it from unsorted.
  const droppingRef = useRef(new Set());

  // Listen for tap-to-place completion — canvas fires this when a mobile
  // unsorted item was placed, so we can delete it from unsorted.
  useEffect(() => {
    const handler = (e) => deleteUnsorted(e.detail.itemId);
    window.addEventListener("bd-placement-complete", handler);
    return () => window.removeEventListener("bd-placement-complete", handler);
  }, []);

  const handleUnsortedDrop = useCallback(async (item, clientX, clientY) => {
    // Guard against duplicate calls (iOS can fire pointerup twice)
    if (droppingRef.current.has(item.id)) return;
    droppingRef.current.add(item.id);
    setTimeout(() => droppingRef.current.delete(item.id), 2000);

    setShowUnsorted(false);
    const ev = new CustomEvent("bd-unsorted-drop", {
      detail: { item, clientX, clientY, accepted: false }
    });
    window.dispatchEvent(ev);
    // Only delete from unsorted if the canvas confirmed the drop landed on it
    if (ev.detail.accepted) {
      await deleteUnsorted(item.id);
    }
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col bg-brand-50 dark:bg-brand-950">
      <div className="flex items-center justify-between px-3 bg-white dark:bg-brand-800 border-b-2 border-brand-200 dark:border-brand-600 z-20"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top, 0.5rem))", paddingBottom: "0.5rem" }}>
        <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
          <Link to="/brain-dump" className="text-xs text-accent-500 dark:text-accent-300 font-medium flex-shrink-0 hover:underline">
            All boards
          </Link>
          {ancestry.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-brand-300 dark:text-brand-600">/</span>
              <Link to={`/brain-dump/${ancestor.id}`} className="text-xs text-brand-500 dark:text-brand-400 font-medium hover:text-accent-500 dark:hover:text-accent-300 hover:underline">
                {ancestor.name}
              </Link>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 max-w-[50%]">
          {board && <BoardColorPicker board={board} />}
          {board?.name && <BoardNameEditor board={board} />}
        </div>
      </div>

      <div className="flex-1 relative" data-bd-canvas>
        <BrainDumpCanvas uid={uid} boardId={boardId} cards={cards} arrows={arrows} boardColor={board?.color} />
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <BrainDumpToolbar onOpenUnsorted={() => setShowUnsorted(true)} />
        </div>
      </div>

      {showUnsorted && (
        <UnsortedPanel
          uid={uid}
          onClose={() => setShowUnsorted(false)}
          onDropToCanvas={handleUnsortedDrop}
        />
      )}
    </div>
  );
}

export default BrainDumpBoard;
