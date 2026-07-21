import { useState, useEffect } from "react";
import { CATEGORY_COLORS, getCategoryColor } from "../lib/categoryColors";
import { listenToCategories, updateCategory, deleteCategory } from "../lib/events";
import { auth } from "../firebase";
import ColorPicker from "./ColorPicker";

function CategoryRow({ category }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [customColor, setCustomColor] = useState(category.customColor || null);
  const [saving, setSaving] = useState(false);

  const currentColorMeta = getCategoryColor(category.color, true, category.customColor);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await updateCategory(category.id, { name: trimmed, color, customColor: customColor || null });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete "${category.name}"? Events already using this category will show as uncategorized (gray) instead of being deleted.`
      )
    )
      return;
    await deleteCategory(category.id);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 py-2 px-1">
        {currentColorMeta.isCustom ? (
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={currentColorMeta.dotStyle} />
        ) : (
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${currentColorMeta.dot}`} />
        )}
        <span className="flex-1 text-sm text-brand-800 dark:text-brand-100">{category.name}</span>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-brand-500 dark:text-brand-300 hover:text-brand-600 dark:hover:text-brand-100"
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
        >
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="py-2.5 px-1 space-y-2 bg-brand-50 dark:bg-brand-800 rounded-lg">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-700 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      <ColorPicker
        value={{ colorId: color, customColor }}
        onChange={({ colorId, customColor: cc }) => {
          setColor(colorId);
          setCustomColor(cc);
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-3 py-1 text-xs bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setName(category.name);
            setColor(category.color);
          }}
          className="px-3 py-1 text-xs text-brand-500 dark:text-brand-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CategoryManager() {
  const uid = auth.currentUser?.uid;
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!uid) return;
    return listenToCategories(uid, setCategories);
  }, [uid]);

  return (
    <div>
      <h2 className="text-sm font-semibold text-brand-600 dark:text-brand-300 mb-2">
        Event Categories
      </h2>

      {categories.length === 0 ? (
        <p className="text-sm text-brand-300 dark:text-brand-600 italic">
          No categories yet — create one while adding an event in Calendar.
        </p>
      ) : (
        <div className="divide-y divide-brand-100 dark:divide-brand-700">
          {categories.map((cat) => (
            <CategoryRow key={cat.id} category={cat} />
          ))}
        </div>
      )}

      <p className="text-xs text-brand-400 dark:text-brand-500 mt-2">
        Deleting a category leaves its events uncategorized (shown in gray) — it does not delete the events themselves.
      </p>
    </div>
  );
}

export default CategoryManager;
