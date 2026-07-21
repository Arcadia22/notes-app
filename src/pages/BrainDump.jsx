import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/PageLayout";
import { Sakura, PixelLantern } from "../components/Decorations";
import BoardThumbnail from "../components/BoardThumbnail";
import UnsortedPanel, { UnsortedSketchEditor } from "../components/UnsortedPanel";
import { auth } from "../firebase";
import { listenToBoards, createBoard, renameBoard, deleteBoard, updateBoardColor, listenToUnsorted, createUnsortedNote, createUnsortedSketch } from "../lib/brainDump";

function BoardColorSwatch({ board }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(board.color || "#a878d8");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-4 h-4 rounded-full border border-brand-300 dark:border-brand-600 flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: board.color || "transparent" }}
        title="Change board color"
      >
        {!board.color && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5 text-brand-400">
            <circle cx="12" cy="12" r="8" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-6 left-0 z-40 bg-white dark:bg-brand-800 rounded-xl shadow-lg border border-brand-200 dark:border-brand-600 p-3 w-52">
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="w-full h-14 rounded-lg cursor-pointer border border-brand-200 dark:border-brand-600"
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

function BoardCard({ board, uid, onOpen, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(board.name);

  const handleSaveRename = async () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== board.name) {
      await onRename(board.id, trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-accent-400 dark:border-accent-300 p-3">
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveRename();
            if (e.key === "Escape") {
              setNameDraft(board.name);
              setEditing(false);
            }
          }}
          className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-2 py-1.5 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-accent-400"
        />
        <div className="flex gap-2">
          <button
            onClick={handleSaveRename}
            className="text-xs text-accent-600 dark:text-accent-300 font-medium"
          >
            Save
          </button>
          <button
            onClick={() => {
              setNameDraft(board.name);
              setEditing(false);
            }}
            className="text-xs text-brand-400 dark:text-brand-500"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 hover:border-accent-400 dark:hover:border-accent-300 transition">
      <button onClick={() => onOpen(board.id)} className="w-full text-left">
        <BoardThumbnail uid={uid} boardId={board.id} boardColor={board.color} />
        <p className="text-sm font-semibold text-brand-800 dark:text-brand-100 truncate">
          {board.name}
        </p>
      </button>
      <div className="flex items-center gap-3 mt-2">
        <BoardColorSwatch board={board} />
        <button
          onClick={() => setEditing(true)}
          className="text-[10px] text-brand-400 dark:text-brand-500 hover:text-brand-600 dark:hover:text-brand-300"
        >
          Rename
        </button>
        <button
          onClick={() => onDelete(board)}
          className="text-[10px] text-red-400 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function BrainDump() {
  const uid = auth.currentUser?.uid;
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [unsorted, setUnsorted] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [showUnsorted, setShowUnsorted] = useState(false);
  const [creatingQuickNote, setCreatingQuickNote] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState("");
  const [sketchingUnsortedItem, setSketchingUnsortedItem] = useState(null);

  useEffect(() => {
    if (!uid) return;
    return listenToBoards(uid, setBoards);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return listenToUnsorted(uid, setUnsorted);
  }, [uid]);

  const handleCreate = async () => {
    const trimmed = newBoardName.trim();
    if (!trimmed) return;
    await createBoard(uid, trimmed);
    setNewBoardName("");
    setCreating(false);
  };

  const handleOpen = (boardId) => navigate(`/brain-dump/${boardId}`);

  const handleDelete = async (board) => {
    if (!confirm(`Delete "${board.name}" and everything on it? This can't be undone.`)) return;
    await deleteBoard(uid, board.id);
  };

  const handleQuickNote = async () => {
    const trimmed = quickNoteText.trim();
    await createUnsortedNote(uid, trimmed);
    setQuickNoteText("");
    setCreatingQuickNote(false);
  };

  const handleQuickSketch = async () => {
    const ref = await createUnsortedSketch(uid);
    if (ref) {
      // Open the sketch editor immediately with the new doc
      setSketchingUnsortedItem({ id: ref.id, type: "sketch", strokes: [], sketchWidth: 800, sketchHeight: 600 });
    }
  };

  return (
    <PageLayout title="Brain Dump">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">

        {/* Quick capture bar */}
        <div className="flex items-center gap-2 mb-5 p-3 rounded-2xl bg-white dark:bg-brand-800 border border-brand-100 dark:border-brand-700 shadow-sm">
          <span className="text-xs text-brand-400 dark:text-brand-500 flex-shrink-0">Quick capture:</span>
          <button
            onClick={() => setCreatingQuickNote(true)}
            className="flex-1 text-xs text-left text-brand-300 dark:text-brand-600 italic hover:text-brand-500 dark:hover:text-brand-400"
          >
            + Quick note...
          </button>
          <button
            onClick={handleQuickSketch}
            className="flex-shrink-0 text-[10px] font-medium text-brand-500 dark:text-brand-300 bg-brand-50 dark:bg-brand-700 rounded-lg px-2.5 py-1 hover:bg-brand-100 dark:hover:bg-brand-600"
          >
            ✏️ Sketch
          </button>
        </div>

        {/* Quick note input */}
        {creatingQuickNote && (
          <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-accent-400 dark:border-accent-300 p-3 mb-4">
            <textarea
              autoFocus
              value={quickNoteText}
              onChange={(e) => setQuickNoteText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleQuickNote(); if (e.key === "Escape") { setQuickNoteText(""); setCreatingQuickNote(false); } }}
              placeholder="Write your note... (Ctrl+Enter to save)"
              rows={3}
              className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={handleQuickNote} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                Save note
              </button>
              <button onClick={() => { setQuickNoteText(""); setCreatingQuickNote(false); }} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-300">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Unsorted items indicator */}
        {unsorted.length > 0 && (
          <button
            onClick={() => setShowUnsorted(true)}
            className="w-full flex items-center justify-between px-4 py-3 mb-4 rounded-xl bg-accent-50 dark:bg-brand-800 border border-accent-200 dark:border-accent-400/30 text-left hover:bg-accent-100 dark:hover:bg-brand-700 transition"
          >
            <span className="text-sm font-medium text-accent-600 dark:text-accent-300">
              📋 Unsorted items
            </span>
            <span className="text-xs bg-accent-500 text-white rounded-full px-2 py-0.5 font-medium">
              {unsorted.length}
            </span>
          </button>
        )}

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100 flex items-center gap-2">
            <Sakura className="w-4 h-4" />
            BOARDS
          </h2>
          {!creating && (
            <button onClick={() => setCreating(true)} className="text-xs text-accent-500 dark:text-accent-300 font-medium">
              + New board
            </button>
          )}
        </div>

        {creating && (
          <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-accent-400 dark:border-accent-300 p-3 mb-4">
            <input
              autoFocus
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setNewBoardName(""); setCreating(false); } }}
              placeholder="Board name, e.g. Trip Planning"
              className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={!newBoardName.trim()} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                Create
              </button>
              <button onClick={() => { setNewBoardName(""); setCreating(false); }} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-300">
                Cancel
              </button>
            </div>
          </div>
        )}

        {boards.length === 0 && !creating ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <PixelLantern className="w-6 h-8 opacity-60" />
            <p className="text-sm text-brand-300 dark:text-brand-500 italic">
              No boards yet — create your first one above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {boards.map((board) => (
              <BoardCard key={board.id} board={board} uid={uid} onOpen={handleOpen} onRename={renameBoard} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {showUnsorted && (
        <UnsortedPanel uid={uid} onClose={() => setShowUnsorted(false)} />
      )}

      {sketchingUnsortedItem && (
        <UnsortedSketchEditor
          item={sketchingUnsortedItem}
          onClose={() => setSketchingUnsortedItem(null)}
        />
      )}
    </PageLayout>
  );
}

export default BrainDump;
