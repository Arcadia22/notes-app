import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  getDocs,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------
// BOARDS (top-level, lightweight — actual canvas content lives in
// separate collections scoped by boardId, added in later stages)
// ---------------------------------------------------------------------

// Only top-level boards (no parent) show on the main Brain Dump list —
// boards created from a "Board" card nested inside another board are
// reachable only through that card, not listed alongside the top-level
// ones, so the main list doesn't get cluttered with sub-boards.
export function listenToBoards(uid, callback) {
  const q = query(
    collection(db, "brainDumpBoards"),
    where("uid", "==", uid),
    where("parentBoardId", "==", null),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// Live listener for a single board's own data (name, parentBoardId) —
// used so a nested board's view can show a "back to parent" link with
// the parent's actual name.
export function listenToBoard(boardId, callback) {
  return onSnapshot(doc(db, "brainDumpBoards", boardId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function createBoard(uid, name, parentBoardId = null) {
  const ref = await addDoc(collection(db, "brainDumpBoards"), {
    uid,
    name: name.trim() || "Untitled board",
    parentBoardId,
    color: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref;
}

export async function renameBoard(boardId, newName) {
  return updateDoc(doc(db, "brainDumpBoards", boardId), {
    name: newName.trim() || "Untitled board",
    updatedAt: serverTimestamp(),
  });
}

export async function updateBoardColor(boardId, color) {
  return updateDoc(doc(db, "brainDumpBoards", boardId), {
    color: color || null,
    updatedAt: serverTimestamp(),
  });
}

// Walks up the parentBoardId chain from a board, returning an array of
// { id, name } from the TOP-LEVEL board down to (but not including)
// the board itself — used to build a full breadcrumb trail so you can
// jump straight back to any ancestor, not just the immediate parent.
// Capped at 20 levels as a safety net against any accidental cycle.
export async function getBoardAncestry(boardId) {
  const chain = [];
  let currentId = boardId;
  let guard = 0;

  while (guard < 20) {
    guard++;
    const snap = await getDoc(doc(db, "brainDumpBoards", currentId));
    if (!snap.exists()) break;
    const data = snap.data();
    if (!data.parentBoardId) break;

    const parentSnap = await getDoc(doc(db, "brainDumpBoards", data.parentBoardId));
    if (!parentSnap.exists()) break;
    chain.unshift({ id: data.parentBoardId, name: parentSnap.data().name || "Untitled board" });
    currentId = data.parentBoardId;
  }

  return chain;
}

// Deletes the board plus all of its cards and arrows (added in later
// stages), so nothing orphaned lingers in the database.
export async function deleteBoard(uid, boardId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "brainDumpBoards", boardId));

  const cardsSnap = await getDocs(
    query(
      collection(db, "brainDumpCards"),
      where("uid", "==", uid),
      where("boardId", "==", boardId)
    )
  );
  cardsSnap.forEach((cardDoc) => batch.delete(cardDoc.ref));

  const arrowsSnap = await getDocs(
    query(
      collection(db, "brainDumpArrows"),
      where("uid", "==", uid),
      where("boardId", "==", boardId)
    )
  );
  arrowsSnap.forEach((arrowDoc) => batch.delete(arrowDoc.ref));

  await batch.commit();
}

// ---------------------------------------------------------------------
// CARDS (the actual content placed on a board's freeform canvas)
// type: "text" | "image" | "color"
// x/y: top-left position in canvas coordinates (not screen pixels —
// canvas coordinates stay fixed regardless of pan/zoom)
// width/height: card's size in canvas units
// ---------------------------------------------------------------------

export function listenToCards(uid, boardId, callback) {
  const q = query(
    collection(db, "brainDumpCards"),
    where("uid", "==", uid),
    where("boardId", "==", boardId)
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createCard(uid, boardId, data) {
  return addDoc(collection(db, "brainDumpCards"), {
    uid,
    boardId,
    type: "text",
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    content: "",
    color: "#f6f0fc",
    parentId: null, // set when this card is dropped inside a "group" card
    order: 0, // sort order among siblings within the same column
    zIndex: 1, // stacking order among free-floating cards — bumped to "bring to front" when dragged
    createdAt: serverTimestamp(),
    ...data,
  });
}

export async function updateCard(cardId, changes) {
  return updateDoc(doc(db, "brainDumpCards", cardId), changes);
}

export async function deleteCard(cardId) {
  return deleteDoc(doc(db, "brainDumpCards", cardId));
}

// Compresses the image client-side and returns it as a Base64 data URL,
// to be stored directly on the card document — no Firebase Storage
// needed, which keeps the whole app usable on the free Spark plan.
export async function uploadBrainDumpImage(uid, boardId, file) {
  const { compressImageFile } = await import("./imageCompression");
  return compressImageFile(file);
}

// Moves a group card by (dx, dy) and cascades the same delta to every
// card whose parentId is this group, so dragging a group moves
// everything inside it together. Writes are batched into one commit.
export async function moveGroupWithChildren(groupCard, dx, dy, childCards) {
  const batch = writeBatch(db);
  batch.update(doc(db, "brainDumpCards", groupCard.id), {
    x: groupCard.x + dx,
    y: groupCard.y + dy,
  });
  for (const child of childCards) {
    batch.update(doc(db, "brainDumpCards", child.id), {
      x: child.x + dx,
      y: child.y + dy,
    });
  }
  await batch.commit();
}

// Creates a new nested board, then a "board" card on the current board
// that links to it.
export async function createNestedBoard(uid, parentBoardId, x, y) {
  const boardRef = await createBoard(uid, "Untitled board", parentBoardId);
  await createCard(uid, parentBoardId, {
    type: "board",
    x,
    y,
    width: 180,
    height: 130,
    linkedBoardId: boardRef.id,
    content: "Untitled board",
  });
  return boardRef.id;
}

// ---------------------------------------------------------------------
// ARROWS (freeform lines placed directly on the canvas — not anchored
// to any card, so they're a standalone draggable/curvable tool)
// x1/y1: the "top" endpoint, x2/y2: the "bottom" endpoint, both in
//   canvas coordinates and independently draggable.
// curved: false = straight line, true = curved
// curveX/curveY: midpoint control point, only meaningful when curved
//   is true — dragging it bends the line.
// label: optional text shown at the arrow's midpoint
// ---------------------------------------------------------------------

export function listenToArrows(uid, boardId, callback) {
  const q = query(
    collection(db, "brainDumpArrows"),
    where("uid", "==", uid),
    where("boardId", "==", boardId)
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createArrow(uid, boardId, x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return addDoc(collection(db, "brainDumpArrows"), {
    uid,
    boardId,
    x1,
    y1,
    x2,
    y2,
    curved: false,
    curveX: midX,
    curveY: midY,
    label: "",
  });
}

export async function updateArrow(arrowId, changes) {
  return updateDoc(doc(db, "brainDumpArrows", arrowId), changes);
}

export async function deleteArrow(arrowId) {
  return deleteDoc(doc(db, "brainDumpArrows", arrowId));
}

// ---------------------------------------------------------------------
// UNSORTED ITEMS — quick notes/sketches not yet assigned to any board
// ---------------------------------------------------------------------

export function listenToUnsorted(uid, callback) {
  const q = query(
    collection(db, "brainDumpUnsorted"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function createUnsortedNote(uid, content = "") {
  return addDoc(collection(db, "brainDumpUnsorted"), {
    uid,
    type: "note",
    content,
    createdAt: serverTimestamp(),
  });
}

export async function createUnsortedSketch(uid) {
  return addDoc(collection(db, "brainDumpUnsorted"), {
    uid,
    type: "sketch",
    strokes: [],
    sketchWidth: 800,
    sketchHeight: 600,
    createdAt: serverTimestamp(),
  });
}

export async function updateUnsorted(itemId, changes) {
  return updateDoc(doc(db, "brainDumpUnsorted", itemId), changes);
}

export async function deleteUnsorted(itemId) {
  return deleteDoc(doc(db, "brainDumpUnsorted", itemId));
}

// Save any card type (not just note/sketch) to unsorted. Strips canvas-
// specific positioning fields but keeps all content fields so the card
// can be recreated in full on another board.
export async function createUnsortedCard(uid, card) {
  const { id, x, y, zIndex, parentId, order, boardId, ...cardData } = card;
  return addDoc(collection(db, "brainDumpUnsorted"), {
    uid,
    type: card.type,
    cardData, // full card content: content, strokes, imageUrl, listItems, etc.
    createdAt: serverTimestamp(),
  });
}
