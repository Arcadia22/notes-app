import { useState, useRef } from "react";
import { updateCard, deleteCard, createCard, updateArrow, deleteArrow, createArrow } from "./brainDump";

// Module-level stacks (not React state) so history survives navigating
// between boards within the same session — only resets on a full page
// reload, per spec. Each entry knows how to undo itself and how to
// redo itself (re-apply the original action).
let undoStack = [];
let redoStack = [];
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

async function performUndo() {
  const entry = undoStack.pop();
  if (!entry) return;
  await entry.undo();
  redoStack.push(entry);
  notify();
}

async function performRedo() {
  const entry = redoStack.pop();
  if (!entry) return;
  await entry.redo();
  undoStack.push(entry);
  notify();
}

// React hook: gives components pushAction (to register a new undoable
// entry), undo/redo functions, and live canUndo/canRedo booleans that
// update whenever the stacks change.
export function useBrainDumpHistory() {
  const [, forceRender] = useState(0);
  const subscribedRef = useRef(false);

  if (!subscribedRef.current) {
    subscribedRef.current = true;
    listeners.add(() => forceRender((n) => n + 1));
  }

  const pushAction = (entry) => {
    undoStack.push(entry);
    redoStack = []; // a new action invalidates anything that was "ahead"
    notify();
  };

  return {
    pushAction,
    undo: performUndo,
    redo: performRedo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}

// ---------------------------------------------------------------------
// makeUndoableActions(pushAction) returns wrapper functions that
// perform the real Firestore mutation AND register how to reverse it.
// Use these instead of the raw card/arrow functions for any
// user-initiated action that should be undoable.
// ---------------------------------------------------------------------

export function makeUndoableActions(pushAction) {
  return {
    async createCardUndoable(uid, boardId, data) {
      const ref = await createCard(uid, boardId, data);
      pushAction({
        undo: () => deleteCard(ref.id),
        redo: async () => {
          const newRef = await createCard(uid, boardId, data);
          ref.id = newRef.id;
        },
      });
      return ref;
    },

    async deleteCardUndoable(card) {
      await deleteCard(card.id);
      const { id, ...data } = card;
      pushAction({
        undo: () => createCard(data.uid, data.boardId, data),
        redo: () => deleteCard(card.id),
      });
    },

    async createArrowUndoable(uid, boardId, x1, y1, x2, y2) {
      const ref = await createArrow(uid, boardId, x1, y1, x2, y2);
      pushAction({
        undo: () => deleteArrow(ref.id),
        redo: async () => {
          const newRef = await createArrow(uid, boardId, x1, y1, x2, y2);
          ref.id = newRef.id;
        },
      });
      return ref;
    },

    async deleteArrowUndoable(arrow) {
      await deleteArrow(arrow.id);
      const { id, ...data } = arrow;
      pushAction({
        undo: () => createArrow(data.uid, data.boardId, data.x1, data.y1, data.x2, data.y2),
        redo: () => deleteArrow(arrow.id),
      });
    },
  };
}
