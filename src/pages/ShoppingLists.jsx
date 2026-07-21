import { useState, useEffect, useMemo } from "react";
import PageLayout from "../components/PageLayout";
import { PixelPips, Sakura } from "../components/Decorations";
import { auth } from "../firebase";
import {
  listenToShoppingLists,
  listenToShoppingListItems,
  createShoppingList,
  renameShoppingList,
  deleteShoppingList,
  addShoppingListItem,
  toggleShoppingListItem,
  deleteShoppingListItem,
} from "../lib/shoppingLists";

function NewListForm({ uid, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const ref = await createShoppingList(uid, trimmed);
      setName("");
      onCreated(ref.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2 mb-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        placeholder="New list name"
        className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-900 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
      />
      <button
        onClick={handleCreate}
        disabled={saving || !name.trim()}
        className="px-4 py-2 bg-brand-600 text-white rounded-lg font-medium text-sm hover:bg-brand-700 disabled:opacity-50"
      >
        + List
      </button>
    </div>
  );
}

function ListTabs({ lists, activeListId, onSelect }) {
  if (lists.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
      {lists.map((list) => (
        <button
          key={list.id}
          onClick={() => onSelect(list.id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
            activeListId === list.id
              ? "bg-brand-600 text-white"
              : "bg-brand-100 dark:bg-brand-800 text-brand-600 dark:text-brand-300 hover:bg-brand-200 dark:hover:bg-brand-700"
          }`}
        >
          {list.name}
        </button>
      ))}
    </div>
  );
}

function ListItemRow({ item, onToggle, onDelete }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 group">
      <button
        onClick={() => onToggle(item.id, !item.checked)}
        className={`w-5 h-5 rounded-md border-2 flex-shrink-0 transition ${
          item.checked
            ? "bg-brand-500 border-brand-500"
            : "border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800"
        }`}
        aria-label={item.checked ? "Mark as not bought" : "Mark as bought"}
      />
      <span
        className={`flex-1 text-sm ${
          item.checked
            ? "line-through text-brand-300 dark:text-brand-500"
            : "text-brand-800 dark:text-brand-100"
        }`}
      >
        {item.name}
      </span>
      <button
        onClick={() => onDelete(item.id)}
        className="text-xs text-red-400 dark:text-red-400 opacity-0 group-hover:opacity-100 transition"
      >
        Remove
      </button>
    </div>
  );
}

function ActiveListPanel({ uid, list, items }) {
  const [itemName, setItemName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(a.checked) - Number(b.checked)),
    [items]
  );

  const handleAddItem = async () => {
    const trimmed = itemName.trim();
    if (!trimmed) return;
    await addShoppingListItem(uid, list.id, trimmed);
    setItemName("");
  };

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    await renameShoppingList(list.id, trimmed);
    setRenaming(false);
  };

  const handleDeleteList = async () => {
    if (!confirm(`Delete "${list.name}" and all its items?`)) return;
    await deleteShoppingList(uid, list.id, items);
  };

  return (
    <div className="relative rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 overflow-hidden">
      <PixelPips color="bg-brand-300 dark:bg-brand-500" />

      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        {!renaming ? (
          <button
            onClick={() => {
              setRenaming(true);
              setRenameValue(list.name);
            }}
            className="text-sm font-semibold text-brand-800 dark:text-brand-100 hover:text-brand-600 dark:hover:text-brand-300"
          >
            {list.name}
          </button>
        ) : (
          <div className="flex gap-2 flex-1">
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
              autoFocus
            />
            <button
              onClick={handleRename}
              className="text-xs px-2 py-1 bg-brand-600 text-white rounded-lg"
            >
              Save
            </button>
          </div>
        )}
        <button
          onClick={handleDeleteList}
          className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 ml-3"
        >
          Delete list
        </button>
      </div>

      <div className="flex gap-2 px-4 pb-3">
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddItem()}
          placeholder="Add an item"
          className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-900 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
        />
        <button
          onClick={handleAddItem}
          disabled={!itemName.trim()}
          className="px-3 py-1.5 bg-accent-400 text-white rounded-lg text-sm font-medium hover:bg-accent-500 disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {sortedItems.length === 0 ? (
        <p className="text-sm text-brand-300 dark:text-brand-500 italic text-center py-6">
          No items yet — add your first one above.
        </p>
      ) : (
        <div className="divide-y divide-brand-50 dark:divide-brand-700 pb-1">
          {sortedItems.map((item) => (
            <ListItemRow
              key={item.id}
              item={item}
              onToggle={toggleShoppingListItem}
              onDelete={deleteShoppingListItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShoppingLists() {
  const uid = auth.currentUser?.uid;
  const [lists, setLists] = useState([]);
  const [items, setItems] = useState([]);
  const [activeListId, setActiveListId] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const unsubLists = listenToShoppingLists(uid, setLists);
    const unsubItems = listenToShoppingListItems(uid, setItems);
    return () => {
      unsubLists();
      unsubItems();
    };
  }, [uid]);

  // Default to the first list once lists have loaded, if nothing's selected yet
  useEffect(() => {
    if (!activeListId && lists.length > 0) {
      setActiveListId(lists[0].id);
    }
    // If the active list was deleted, fall back to the first remaining one
    if (activeListId && !lists.find((l) => l.id === activeListId)) {
      setActiveListId(lists[0]?.id || null);
    }
  }, [lists, activeListId]);

  const activeList = lists.find((l) => l.id === activeListId);
  const activeListItems = items.filter((item) => item.listId === activeListId);

  return (
    <PageLayout title="Shopping Lists">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100 mb-4 flex items-center gap-2">
          <Sakura className="w-4 h-4" />
          SHOPPING LISTS
        </h2>

        {uid && <NewListForm uid={uid} onCreated={setActiveListId} />}

        {lists.length === 0 ? (
          <p className="text-sm text-brand-300 dark:text-brand-500 italic text-center py-8">
            No lists yet — create one above to get started.
          </p>
        ) : (
          <>
            <ListTabs lists={lists} activeListId={activeListId} onSelect={setActiveListId} />
            {activeList && uid && (
              <ActiveListPanel uid={uid} list={activeList} items={activeListItems} />
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}

export default ShoppingLists;
