import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------
// SHOPPING LISTS (e.g. "Groceries", "Hardware store")
// ---------------------------------------------------------------------

export function listenToShoppingLists(uid, callback) {
  const q = query(collection(db, "shoppingLists"), where("uid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const lists = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(lists);
  });
}

export async function createShoppingList(uid, name) {
  return addDoc(collection(db, "shoppingLists"), { uid, name });
}

export async function renameShoppingList(listId, name) {
  return updateDoc(doc(db, "shoppingLists", listId), { name });
}

// Deletes a list and every item that belongs to it.
export async function deleteShoppingList(uid, listId, items) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "shoppingLists", listId));
  for (const item of items) {
    if (item.listId === listId) {
      batch.delete(doc(db, "shoppingListItems", item.id));
    }
  }
  await batch.commit();
}

// ---------------------------------------------------------------------
// SHOPPING LIST ITEMS
// ---------------------------------------------------------------------

export function listenToShoppingListItems(uid, callback) {
  const q = query(collection(db, "shoppingListItems"), where("uid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function addShoppingListItem(uid, listId, name) {
  return addDoc(collection(db, "shoppingListItems"), {
    uid,
    listId,
    name,
    checked: false,
  });
}

export async function toggleShoppingListItem(itemId, checked) {
  return updateDoc(doc(db, "shoppingListItems", itemId), { checked });
}

export async function deleteShoppingListItem(itemId) {
  return deleteDoc(doc(db, "shoppingListItems", itemId));
}
