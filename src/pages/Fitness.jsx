import { useState, useEffect, useMemo } from "react";
import PageLayout from "../components/PageLayout";
import { auth } from "../firebase";
import {
  ALL_METRICS, getMetric, CATEGORY_COLORS, getCategoryStyle,
  listenToFitnessCategories, createFitnessCategory, updateFitnessCategory, deleteFitnessCategory,
  listenToFitnessRoutines, createFitnessRoutine, updateFitnessRoutine, deleteFitnessRoutine,
  listenToFitnessLogs, createFitnessLog, deleteFitnessLog,
  calculateWorkoutStreak, calculateCategoryStreak,
} from "../lib/fitness";
import {
  listenToMealLogs, createMealLog, deleteMealLog,
  listenToGroceryItems, createGroceryItem, updateGroceryItem, deleteGroceryItem,
  listenToRecipes, createRecipe, updateRecipe, deleteRecipe,
  listenToWeeklyMenu, saveWeeklyMenu, getWeekKey,
  WEEK_DAYS, MEAL_TIMES,
} from "../lib/meals";

// ── Meals Tab ──────────────────────────────────────────────────────────

function MealsTab({ uid }) {
  const [subTab, setSubTab] = useState("log"); // "log"|"menu"|"groceries"|"recipes"
  const [mealLogs, setMealLogs]       = useState([]);
  const [groceries, setGroceries]     = useState([]);
  const [recipes, setRecipes]         = useState([]);
  const [weekMenu, setWeekMenu]       = useState(null);
  const [weekKey, setWeekKey]         = useState(getWeekKey());
  const [menuDraft, setMenuDraft]     = useState({});

  // Forms
  const [addingMeal, setAddingMeal]         = useState(false);
  const [addingGrocery, setAddingGrocery]   = useState(false);
  const [addingRecipe, setAddingRecipe]     = useState(false);
  const [editingRecipe, setEditingRecipe]   = useState(null);
  const [saving, setSaving]                 = useState(false);

  // Meal log form
  const [mealName, setMealName]         = useState("");
  const [mealTime, setMealTime]         = useState("");
  const [mealDesc, setMealDesc]         = useState("");
  const [mealCals, setMealCals]         = useState("");
  const [mealDate, setMealDate]         = useState(() => todayStr());

  // Grocery form
  const [groceryName, setGroceryName]   = useState("");
  const [groceryCat, setGroceryCat]     = useState("");
  const [groceryQty, setGroceryQty]     = useState("");
  const [groceryUnit, setGroceryUnit]   = useState("units");

  // Recipe form
  const [recipeName, setRecipeName]     = useState("");
  const [recipeCat, setRecipeCat]       = useState("");
  const [recipeIngr, setRecipeIngr]     = useState("");
  const [recipeSteps, setRecipeSteps]   = useState("");
  const [recipeNotes, setRecipeNotes]   = useState("");

  useEffect(() => {
    if (!uid) return;
    const u1 = listenToMealLogs(uid, setMealLogs);
    const u2 = listenToGroceryItems(uid, setGroceries);
    const u3 = listenToRecipes(uid, setRecipes);
    return () => { u1(); u2(); u3(); };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return listenToWeeklyMenu(uid, weekKey, (menu) => {
      setWeekMenu(menu);
      setMenuDraft(menu?.plan || {});
    });
  }, [uid, weekKey]);

  const handleAddMeal = async () => {
    if (!mealName.trim()) return;
    setSaving(true);
    try {
      await createMealLog(uid, { date: mealDate, time: mealTime, name: mealName.trim(), description: mealDesc, calories: mealCals ? Number(mealCals) : null });
      setMealName(""); setMealTime(""); setMealDesc(""); setMealCals(""); setAddingMeal(false);
    } finally { setSaving(false); }
  };

  const handleSaveMenu = async () => {
    setSaving(true);
    try { await saveWeeklyMenu(uid, weekKey, menuDraft); }
    finally { setSaving(false); }
  };

  const handleAddGrocery = async () => {
    if (!groceryName.trim()) return;
    setSaving(true);
    try {
      await createGroceryItem(uid, { name: groceryName.trim(), category: groceryCat, quantity: groceryQty, unit: groceryUnit });
      setGroceryName(""); setGroceryCat(""); setGroceryQty(""); setGroceryUnit("units"); setAddingGrocery(false);
    } finally { setSaving(false); }
  };

  const handleSaveRecipe = async () => {
    if (!recipeName.trim()) return;
    setSaving(true);
    try {
      const data = { name: recipeName.trim(), category: recipeCat, ingredients: recipeIngr, steps: recipeSteps, notes: recipeNotes };
      if (editingRecipe) await updateRecipe(editingRecipe.id, data);
      else await createRecipe(uid, data);
      setRecipeName(""); setRecipeCat(""); setRecipeIngr(""); setRecipeSteps(""); setRecipeNotes("");
      setAddingRecipe(false); setEditingRecipe(null);
    } finally { setSaving(false); }
  };

  const startEditRecipe = (r) => {
    setEditingRecipe(r); setRecipeName(r.name); setRecipeCat(r.category);
    setRecipeIngr(r.ingredients); setRecipeSteps(r.steps); setRecipeNotes(r.notes);
    setAddingRecipe(true);
  };

  const todayMeals = mealLogs.filter(m => m.date === todayStr());
  const inp = "w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none";

  const unchecked = groceries.filter(g => !g.checked);
  const checked   = groceries.filter(g => g.checked);

  return (
    <div className="space-y-4">
      {/* Meals sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800">
        {[["log","📝 Log"],["menu","📅 Menu"],["groceries","🛒 Groceries"],["recipes","📖 Recipes"]].map(([id, label]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`flex-1 text-[10px] py-1.5 rounded-lg transition font-medium ${subTab === id ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm" : "text-brand-400 dark:text-brand-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── MEAL LOG ── */}
      {subTab === "log" && (
        <div className="space-y-3">
          {!addingMeal && (
            <button onClick={() => setAddingMeal(true)}
              className="w-full py-3 rounded-2xl border-2 shadow-sm border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
              + Log a meal
            </button>
          )}
          {addingMeal && (
            <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-2">
              <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">LOG MEAL</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] text-brand-400 mb-0.5 block">Date</label>
                  <input type="date" value={mealDate} onChange={e => setMealDate(e.target.value)} className={inp} /></div>
                <div><label className="text-[10px] text-brand-400 mb-0.5 block">Time</label>
                  <input type="time" value={mealTime} onChange={e => setMealTime(e.target.value)} className={inp} /></div>
              </div>
              <input value={mealName} onChange={e => setMealName(e.target.value)} placeholder="Meal name" className={inp} />
              <textarea value={mealDesc} onChange={e => setMealDesc(e.target.value)} placeholder="Description (optional)" rows={2} className={`${inp} resize-none`} />
              <input type="number" value={mealCals} onChange={e => setMealCals(e.target.value)} placeholder="Calories (optional)" className={inp} />
              <div className="flex gap-2">
                <button onClick={handleAddMeal} disabled={saving || !mealName.trim()} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? "…" : "Save"}</button>
                <button onClick={() => setAddingMeal(false)} className="px-3 py-1.5 text-sm text-brand-500">Cancel</button>
              </div>
            </div>
          )}
          {/* Today's meals */}
          {todayMeals.length > 0 && <p className="text-[10px] font-pixel text-brand-500 dark:text-brand-400">TODAY</p>}
          {mealLogs.map(m => (
            <div key={m.id} className="rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">{m.name}</p>
                  <p className="text-[10px] text-brand-400 dark:text-brand-500">{m.date}{m.time ? ` · ${m.time}` : ""}{m.calories ? ` · ${m.calories} kcal` : ""}</p>
                  {m.description && <p className="text-xs text-brand-500 dark:text-brand-400 mt-0.5">{m.description}</p>}
                </div>
                <button onClick={() => { if (confirm("Delete?")) deleteMealLog(m.id); }} className="text-brand-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
              </div>
            </div>
          ))}
          {mealLogs.length === 0 && !addingMeal && <p className="text-sm text-brand-300 dark:text-brand-500 italic text-center py-6">No meals logged yet.</p>}
        </div>
      )}

      {/* ── WEEKLY MENU ── */}
      {subTab === "menu" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-pixel text-brand-600 dark:text-brand-300">WEEK {weekKey.split("-W")[1]}</p>
            <div className="flex gap-2">
              <button onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setWeekKey(getWeekKey(d)); }} className="text-xs text-brand-400 hover:text-brand-600 px-2">‹ Prev</button>
              <button onClick={() => setWeekKey(getWeekKey())} className="text-xs text-accent-500 dark:text-accent-300">This week</button>
              <button onClick={() => { const d = new Date(); d.setDate(d.getDate() + 7); setWeekKey(getWeekKey(d)); }} className="text-xs text-brand-400 hover:text-brand-600 px-2">Next ›</button>
            </div>
          </div>
          {WEEK_DAYS.map(day => (
            <div key={day} className="rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-brand-600 dark:text-brand-300 capitalize">{day}</p>
              {MEAL_TIMES.map(meal => (
                <div key={meal} className="flex items-start gap-2">
                  <span className="text-[10px] text-brand-400 dark:text-brand-500 w-16 flex-shrink-0 mt-2">{meal}</span>
                  <input value={menuDraft[day]?.[meal.toLowerCase()] || ""}
                    onChange={e => setMenuDraft(d => ({ ...d, [day]: { ...(d[day] || {}), [meal.toLowerCase()]: e.target.value } }))}
                    placeholder="—"
                    className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400" />
                </div>
              ))}
            </div>
          ))}
          <button onClick={handleSaveMenu} disabled={saving}
            className="w-full py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save menu"}
          </button>
        </div>
      )}

      {/* ── GROCERIES ── */}
      {subTab === "groceries" && (
        <div className="space-y-3">
          {addingGrocery && (
            <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-3 space-y-2">
              <input autoFocus value={groceryName} onChange={e => setGroceryName(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") setAddingGrocery(false); }}
                placeholder="Item name"
                className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
              <div className="flex gap-2">
                <input value={groceryQty} onChange={e => setGroceryQty(e.target.value)}
                  placeholder="Qty" type="number" min="0"
                  className="w-20 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-2 text-sm focus:outline-none" />
                <select value={groceryUnit} onChange={e => setGroceryUnit(e.target.value)}
                  className="w-24 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-2 text-sm focus:outline-none appearance-none">
                  <option value="units">units</option>
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                  <option value="ml">ml</option>
                  <option value="L">L</option>
                  <option value="oz">oz</option>
                  <option value="lb">lb</option>
                  <option value="cups">cups</option>
                  <option value="tbsp">tbsp</option>
                  <option value="tsp">tsp</option>
                </select>
                <input value={groceryCat} onChange={e => setGroceryCat(e.target.value)}
                  placeholder="Category"
                  className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-2 text-sm focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleAddGrocery} disabled={saving || !groceryName.trim()}
                  className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg disabled:opacity-50">{saving ? "…" : "Add"}</button>
                <button onClick={() => { setAddingGrocery(false); setGroceryQty(""); setGroceryUnit("units"); }} className="text-brand-400 text-sm">Cancel</button>
              </div>
            </div>
          )}
          {!addingGrocery && (
            <button onClick={() => setAddingGrocery(true)} className="w-full py-3 rounded-2xl border-2 shadow-sm border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
              + Add item
            </button>
          )}
          {groceries.length === 0 && <p className="text-sm text-brand-300 dark:text-brand-500 italic text-center py-6">Your grocery list is empty.</p>}
          {unchecked.length > 0 && (
            <div className="space-y-1.5">
              {unchecked.map(g => (
                <div key={g.id} className="flex items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 px-3 py-2">
                  <button onClick={() => updateGroceryItem(g.id, { checked: true })}
                    className="w-4 h-4 rounded border-2 border-brand-300 dark:border-brand-600 flex-shrink-0 hover:border-emerald-500 transition" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-brand-700 dark:text-brand-200">{g.name}</p>
                    {g.category && <p className="text-[10px] text-brand-400">{g.category}</p>}
                  </div>
                  {/* Quantity + unit inline editor */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <input
                      type="number" min="0"
                      defaultValue={g.quantity || ""}
                      placeholder="—"
                      onBlur={e => updateGroceryItem(g.id, { quantity: e.target.value })}
                      className="w-12 text-center text-xs rounded border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-200 py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-accent-400"
                    />
                    <select
                      defaultValue={g.unit || "units"}
                      onChange={e => updateGroceryItem(g.id, { unit: e.target.value })}
                      className="text-[10px] rounded border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 text-brand-500 dark:text-brand-400 py-0.5 px-1 focus:outline-none appearance-none">
                      <option value="units">units</option>
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                      <option value="ml">ml</option>
                      <option value="L">L</option>
                      <option value="oz">oz</option>
                      <option value="lb">lb</option>
                      <option value="cups">cups</option>
                      <option value="tbsp">tbsp</option>
                      <option value="tsp">tsp</option>
                    </select>
                  </div>
                  <button onClick={() => deleteGroceryItem(g.id)} className="text-brand-300 hover:text-red-400 text-sm flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          )}
          {checked.length > 0 && (
            <div>
              <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-1.5">GOT IT</p>
              <div className="space-y-1.5 opacity-50">
                {checked.map(g => (
                  <div key={g.id} className="flex items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 px-3 py-2">
                    <button onClick={() => updateGroceryItem(g.id, { checked: false })}
                      className="w-4 h-4 rounded border-2 border-emerald-500 bg-emerald-500 flex-shrink-0 flex items-center justify-center">
                      <span className="text-white text-[10px]">✓</span>
                    </button>
                    <p className="text-sm text-brand-500 dark:text-brand-400 line-through flex-1">{g.name}</p>
                    {(g.quantity || g.unit) && (
                      <span className="text-[10px] text-brand-400 flex-shrink-0">{g.quantity} {g.unit}</span>
                    )}
                    <button onClick={() => deleteGroceryItem(g.id)} className="text-brand-300 hover:text-red-400 text-sm flex-shrink-0">×</button>
                  </div>
                ))}
              </div>
              <button onClick={() => checked.forEach(g => deleteGroceryItem(g.id))} className="text-xs text-brand-400 hover:text-red-400 mt-2">Clear got items</button>
            </div>
          )}
        </div>
      )}

      {/* ── RECIPES ── */}
      {subTab === "recipes" && (
        <div className="space-y-3">
          {!addingRecipe && (
            <button onClick={() => setAddingRecipe(true)} className="w-full py-3 rounded-2xl border-2 shadow-sm border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
              + Add recipe
            </button>
          )}
          {addingRecipe && (
            <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-2">
              <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">{editingRecipe ? "EDIT RECIPE" : "NEW RECIPE"}</p>
              <input value={recipeName} onChange={e => setRecipeName(e.target.value)} placeholder="Recipe name" className={inp} />
              <input value={recipeCat} onChange={e => setRecipeCat(e.target.value)} placeholder="Category (e.g. Breakfast, Pasta…)" className={inp} />
              <div>
                <label className="text-[10px] text-brand-400 mb-0.5 block">Ingredients</label>
                <textarea value={recipeIngr} onChange={e => setRecipeIngr(e.target.value)} placeholder="One per line" rows={4} className={`${inp} resize-none`} />
              </div>
              <div>
                <label className="text-[10px] text-brand-400 mb-0.5 block">Steps</label>
                <textarea value={recipeSteps} onChange={e => setRecipeSteps(e.target.value)} placeholder="1. …" rows={4} className={`${inp} resize-none`} />
              </div>
              <textarea value={recipeNotes} onChange={e => setRecipeNotes(e.target.value)} placeholder="Notes (optional)" rows={2} className={`${inp} resize-none`} />
              <div className="flex gap-2">
                <button onClick={handleSaveRecipe} disabled={saving || !recipeName.trim()} className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? "…" : "Save"}</button>
                <button onClick={() => { setAddingRecipe(false); setEditingRecipe(null); }} className="px-3 py-1.5 text-sm text-brand-500">Cancel</button>
              </div>
            </div>
          )}
          {recipes.length === 0 && !addingRecipe && <p className="text-sm text-brand-300 dark:text-brand-500 italic text-center py-6">No recipes yet.</p>}
          <div className="space-y-2">
            {recipes.map(r => (
              <div key={r.id} className="rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">{r.name}</p>
                    {r.category && <p className="text-[10px] text-brand-400 dark:text-brand-500">{r.category}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEditRecipe(r)} className="text-xs text-accent-500 dark:text-accent-300">Edit</button>
                    <button onClick={() => { if (confirm("Delete recipe?")) deleteRecipe(r.id); }} className="text-brand-300 hover:text-red-400 text-sm leading-none">×</button>
                  </div>
                </div>
                {r.ingredients && <p className="text-xs text-brand-500 dark:text-brand-400 whitespace-pre-line line-clamp-3">{r.ingredients}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Metric input ──────────────────────────────────────────────────────

function MetricInput({ metricId, value, onChange, isTarget }) {
  const m = getMetric(metricId);
  if (!m) return null;
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-[10px] text-brand-500 dark:text-brand-400 mb-0.5">
        {m.label}{m.unit ? ` (${m.unit})` : ""}
        {isTarget && <span className="text-brand-300 dark:text-brand-600"> target</span>}
      </label>
      <input
        type={m.type === "text" ? "text" : "number"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={m.placeholder}
        step={m.type === "decimal" ? "0.1" : "1"}
        min="0"
        className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none"
      />
    </div>
  );
}

// ── Category form ─────────────────────────────────────────────────────

function CategoryForm({ uid, existing, onDone, onCancel }) {
  const [name, setName] = useState(existing?.name || "");
  const [color, setColor] = useState(existing?.color || "violet");
  const [selectedMetrics, setSelectedMetrics] = useState(existing?.metrics || ["sets", "reps"]);
  const [targets, setTargets] = useState(existing?.targets || {});
  const [saving, setSaving] = useState(false);

  const toggleMetric = (id) => {
    setSelectedMetrics(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!name.trim() || selectedMetrics.length === 0) return;
    setSaving(true);
    try {
      if (existing) {
        await updateFitnessCategory(existing.id, { name: name.trim(), color, metrics: selectedMetrics, targets });
      } else {
        await createFitnessCategory(uid, { name: name.trim(), color, metrics: selectedMetrics, targets });
      }
      onDone();
    } finally { setSaving(false); }
  };

  const field = "w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400";

  return (
    <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-4">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">{existing ? "EDIT EXERCISE" : "NEW EXERCISE"}</p>

      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weights, Running, Cycling"
        className={field} onKeyDown={e => e.key === "Escape" && onCancel()} />

      {/* Color */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORY_COLORS.map(c => (
          <button key={c.id} type="button" onClick={() => setColor(c.id)}
            className={`w-6 h-6 rounded-full ${c.dot} transition ${color === c.id ? "ring-2 ring-offset-2 ring-brand-400 scale-110" : "opacity-60 hover:opacity-100"}`} />
        ))}
      </div>

      {/* Metric selection */}
      <div>
        <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-2">What to track</label>
        <div className="flex flex-wrap gap-2">
          {ALL_METRICS.map(m => (
            <button key={m.id} type="button" onClick={() => toggleMetric(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition ${
                selectedMetrics.includes(m.id)
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white dark:bg-brand-900 text-brand-500 dark:text-brand-300 border-brand-200 dark:border-brand-600"
              }`}>
              {m.label}{m.unit ? ` (${m.unit})` : ""}
            </button>
          ))}
        </div>
        {selectedMetrics.length === 0 && <p className="text-xs text-red-500 mt-1">Pick at least one metric</p>}
      </div>

      {/* Default targets */}
      {selectedMetrics.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-2">Default targets (optional)</label>
          <div className="flex flex-wrap gap-2">
            {selectedMetrics.map(mId => (
              <MetricInput key={mId} metricId={mId} isTarget
                value={targets[mId] || ""}
                onChange={v => setTargets(prev => ({ ...prev, [mId]: v }))}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim() || selectedMetrics.length === 0}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : existing ? "Save" : "Create"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Routine form ──────────────────────────────────────────────────────

function RoutineForm({ uid, categories, existing, onDone, onCancel }) {
  const [name, setName] = useState(existing?.name || "");
  const [exercises, setExercises] = useState(existing?.exercises || []);
  const [saving, setSaving] = useState(false);

  const addExercise = () => {
    if (categories.length === 0) return;
    const cat = categories[0];
    setExercises(prev => [...prev, {
      categoryId: cat.id,
      targets: { ...cat.targets },
      notes: "",
    }]);
  };

  const updateExercise = (i, changes) => {
    setExercises(prev => prev.map((e, idx) => idx === i ? { ...e, ...changes } : e));
  };

  const removeExercise = (i) => {
    setExercises(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!name.trim() || exercises.length === 0) return;
    setSaving(true);
    try {
      if (existing) {
        await updateFitnessRoutine(existing.id, { name: name.trim(), exercises });
      } else {
        await createFitnessRoutine(uid, { name: name.trim(), exercises });
      }
      onDone();
    } finally { setSaving(false); }
  };

  const field = "rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none";

  return (
    <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-4">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">{existing ? "EDIT WORKOUT" : "NEW WORKOUT"}</p>
      <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Workout name, e.g. Push Day, Leg Day"
        className={`w-full ${field}`} />

      <div className="space-y-3">
        {exercises.map((ex, i) => {
          const cat = categories.find(c => c.id === ex.categoryId);
          return (
            <div key={i} className="rounded-xl border border-brand-200 dark:border-brand-600 p-3 space-y-2 bg-brand-50 dark:bg-brand-900">
              <div className="flex items-center gap-2">
                <select value={ex.categoryId} onChange={e => {
                  const newCat = categories.find(c => c.id === e.target.value);
                  updateExercise(i, { categoryId: e.target.value, targets: { ...newCat?.targets } });
                }} className={`flex-1 ${field}`}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => removeExercise(i)} className="text-brand-300 hover:text-red-400 text-lg leading-none flex-shrink-0">&times;</button>
              </div>
              {cat && (
                <div className="flex flex-wrap gap-2">
                  {cat.metrics.map(mId => (
                    <MetricInput key={mId} metricId={mId} isTarget
                      value={ex.targets?.[mId] || ""}
                      onChange={v => updateExercise(i, { targets: { ...ex.targets, [mId]: v } })}
                    />
                  ))}
                </div>
              )}
              <input value={ex.notes || ""} onChange={e => updateExercise(i, { notes: e.target.value })}
                placeholder="Notes (optional)" className={`w-full ${field} text-xs`} />
            </div>
          );
        })}
        <button onClick={addExercise} disabled={categories.length === 0}
          className="w-full py-2 rounded-xl border-2 border-dashed border-brand-200 dark:border-brand-600 text-xs text-brand-400 dark:text-brand-500 hover:border-accent-300 dark:hover:border-accent-600 hover:text-accent-500 transition disabled:opacity-40">
          + Add exercise
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim() || exercises.length === 0}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : existing ? "Save" : "Create"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Log workout form ──────────────────────────────────────────────────

function LogWorkoutForm({ uid, categories, routines, onDone, onCancel }) {
  const [date, setDate] = useState(todayStr());
  const [routineId, setRoutineId] = useState("");
  const [exercises, setExercises] = useState([{ categoryId: categories[0]?.id || "", actuals: {}, notes: "" }]);
  const [logNotes, setLogNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // When a routine is selected, pre-fill exercises from it
  const handleRoutineChange = (rid) => {
    setRoutineId(rid);
    if (!rid) return;
    const routine = routines.find(r => r.id === rid);
    if (routine) {
      setExercises(routine.exercises.map(ex => ({
        categoryId: ex.categoryId,
        actuals: { ...ex.targets }, // pre-fill with targets as starting point
        notes: ex.notes || "",
      })));
    }
  };

  const addExercise = () => {
    setExercises(prev => [...prev, { categoryId: categories[0]?.id || "", actuals: {}, notes: "" }]);
  };

  const updateExercise = (i, changes) => {
    setExercises(prev => prev.map((e, idx) => idx === i ? { ...e, ...changes } : e));
  };

  const removeExercise = (i) => {
    setExercises(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (exercises.length === 0) return;
    setSaving(true);
    try {
      await createFitnessLog(uid, { date, routineId, exercises, notes: logNotes });
      onDone();
    } finally { setSaving(false); }
  };

  const field = "rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none";

  return (
    <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-4">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">LOG WORKOUT</p>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-brand-500 dark:text-brand-400 mb-0.5">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`w-full ${field} pr-4`} />
        </div>
        {routines.length > 0 && (
          <div className="flex-1">
            <label className="block text-[10px] text-brand-500 dark:text-brand-400 mb-0.5">Routine (optional)</label>
            <select value={routineId} onChange={e => handleRoutineChange(e.target.value)} className={`w-full ${field}`}>
              <option value="">Custom</option>
              {routines.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="block text-xs font-medium text-brand-600 dark:text-brand-300">Exercises</label>
        {exercises.map((ex, i) => {
          const cat = categories.find(c => c.id === ex.categoryId);
          const style = cat ? getCategoryStyle(cat.color) : null;
          return (
            <div key={i} className={`rounded-xl border p-3 space-y-2 ${style ? `${style.border} ${style.bg}` : "border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900"}`}>
              <div className="flex items-center gap-2">
                <select value={ex.categoryId} onChange={e => {
                  const newCat = categories.find(c => c.id === e.target.value);
                  updateExercise(i, { categoryId: e.target.value, actuals: { ...newCat?.targets } });
                }} className={`flex-1 ${field}`}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => removeExercise(i)} className="text-brand-300 hover:text-red-400 text-lg leading-none">&times;</button>
              </div>
              {cat && (
                <div className="flex flex-wrap gap-2">
                  {cat.metrics.map(mId => (
                    <MetricInput key={mId} metricId={mId}
                      value={ex.actuals?.[mId] || ""}
                      onChange={v => updateExercise(i, { actuals: { ...ex.actuals, [mId]: v } })}
                    />
                  ))}
                </div>
              )}
              <input value={ex.notes || ""} onChange={e => updateExercise(i, { notes: e.target.value })}
                placeholder="Notes (optional)" className={`w-full ${field} text-xs`} />
            </div>
          );
        })}
        <button onClick={addExercise} disabled={categories.length === 0}
          className="w-full py-2 rounded-xl border-2 border-dashed border-brand-200 dark:border-brand-600 text-xs text-brand-400 dark:text-brand-500 hover:border-accent-300 hover:text-accent-500 transition">
          + Add exercise
        </button>
      </div>

      <div>
        <label className="block text-[10px] text-brand-500 dark:text-brand-400 mb-0.5">Session notes</label>
        <textarea value={logNotes} onChange={e => setLogNotes(e.target.value)}
          placeholder="How did it go?" rows={2}
          className={`w-full ${field} resize-none`} />
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || exercises.length === 0}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : "Save workout"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Log entry card ────────────────────────────────────────────────────

function LogCard({ log, categories, routines, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const routine = routines.find(r => r.id === log.routineId);

  return (
    <div className="rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-brand-50 dark:hover:bg-brand-700 transition">
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">
              {routine?.name || log.exercises?.map(e => categories.find(c => c.id === e.categoryId)?.name).filter(Boolean).join(", ") || "Workout"}
            </p>
            <p className="text-[10px] text-brand-400 dark:text-brand-500">{formatDate(log.date)} · {log.exercises?.length || 0} exercise{log.exercises?.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-brand-400 text-sm">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-brand-100 dark:border-brand-700 pt-3">
          {log.exercises?.map((ex, i) => {
            const cat = categories.find(c => c.id === ex.categoryId);
            const style = cat ? getCategoryStyle(cat.color) : null;
            return (
              <div key={i} className={`rounded-xl p-3 ${style ? `${style.bg} border ${style.border}` : "bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600"}`}>
                <p className="text-xs font-semibold text-brand-700 dark:text-brand-200 mb-2">
                  {cat ? (
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${style?.dot}`} />
                      {cat.name}
                    </span>
                  ) : "Unknown exercise"}
                </p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(ex.actuals || {}).filter(([, v]) => v !== "" && v != null).map(([mId, val]) => {
                    const m = getMetric(mId);
                    return m ? (
                      <div key={mId} className="text-center">
                        <p className="text-xs font-bold text-brand-700 dark:text-brand-200">{val}{m.unit ? ` ${m.unit}` : ""}</p>
                        <p className="text-[9px] text-brand-400 dark:text-brand-500">{m.label}</p>
                      </div>
                    ) : null;
                  })}
                </div>
                {ex.notes && <p className="text-[10px] text-brand-500 dark:text-brand-400 mt-1 italic">{ex.notes}</p>}
              </div>
            );
          })}
          {log.notes && <p className="text-xs text-brand-500 dark:text-brand-400 italic">"{log.notes}"</p>}
          <button onClick={() => { if (confirm("Delete this workout log?")) onDelete(log.id); }}
            className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300">Delete log</button>
        </div>
      )}
    </div>
  );
}

// ── Workout detail modal (view-only, with Edit button) ─────────────────

function WorkoutDetailModal({ routine, categories, onClose, onEdit, onDelete }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-96 max-h-[85vh] overflow-y-auto bg-white dark:bg-brand-800 rounded-t-2xl sm:rounded-2xl border-2 border-brand-200 dark:border-brand-600 shadow-xl p-5">
        <div className="flex items-start justify-between mb-4 gap-2">
          <h2 className="text-base font-semibold text-brand-800 dark:text-brand-100 flex-1">{routine.name}</h2>
          <button onClick={onClose} className="text-brand-400 text-xl leading-none flex-shrink-0">&times;</button>
        </div>

        <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-3">
          {routine.exercises?.length || 0} exercise{routine.exercises?.length !== 1 ? "s" : ""}
        </p>

        <div className="space-y-3 mb-4">
          {routine.exercises?.map((ex, i) => {
            const cat = categories.find(c => c.id === ex.categoryId);
            const style = cat ? getCategoryStyle(cat.color) : null;
            return (
              <div key={i} className={`rounded-xl p-3 ${style ? `${style.bg} border ${style.border}` : "bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600"}`}>
                <p className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${style?.text || "text-brand-700 dark:text-brand-200"}`}>
                  {style && <span className={`w-2 h-2 rounded-full ${style.dot}`} />}
                  {cat?.name || "Unknown exercise"}
                </p>
                {cat && (
                  <div className="flex flex-wrap gap-3">
                    {cat.metrics.map(mId => {
                      const m = getMetric(mId);
                      const target = ex.targets?.[mId];
                      if (!m || !target) return null;
                      return (
                        <div key={mId} className="text-center">
                          <p className="text-sm font-bold text-brand-700 dark:text-brand-200">{target}{m.unit ? ` ${m.unit}` : ""}</p>
                          <p className="text-[9px] text-brand-400 dark:text-brand-500">{m.label}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                {ex.notes && <p className="text-[10px] text-brand-500 dark:text-brand-400 mt-1.5 italic">{ex.notes}</p>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button onClick={() => { onClose(); onEdit(routine); }}
            className="px-3 py-1.5 text-sm text-accent-500 dark:text-accent-300 font-medium">
            Edit
          </button>
          <button onClick={() => { if (confirm(`Delete "${routine.name}"?`)) { onDelete(routine.id); onClose(); } }}
            className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300">
            Delete workout
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

function Fitness() {
  const uid = auth.currentUser?.uid;
  const [categories, setCategories] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [mealLogs, setMealLogs] = useState([]);
  const [weekMenu, setWeekMenu] = useState(null);
  const weekKey = getWeekKey();
  const [tab, setTab] = useState("workouts");
  const [workoutSubTab, setWorkoutSubTab] = useState("log");
  const [showLogForm, setShowLogForm] = useState(false);
  const [showRoutineForm, setShowRoutineForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [selectedRoutine, setSelectedRoutine] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const u1 = listenToFitnessCategories(uid, setCategories);
    const u2 = listenToFitnessRoutines(uid, setRoutines);
    const u3 = listenToFitnessLogs(uid, setLogs);
    const u4 = listenToMealLogs(uid, setMealLogs);
    const u5 = listenToWeeklyMenu(uid, weekKey, setWeekMenu);
    return () => { u1(); u2(); u3(); u4(); u5(); };
  }, [uid]);

  const workoutStreak = useMemo(() => calculateWorkoutStreak(logs), [logs]);
  const logsThisWeek = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const sun = new Date(now); sun.setDate(now.getDate() - now.getDay());
    const sunStr = `${sun.getFullYear()}-${String(sun.getMonth()+1).padStart(2,"0")}-${String(sun.getDate()).padStart(2,"0")}`;
    return logs.filter(l => l.date >= sunStr).length;
  }, [logs]);

  const mealStreak = useMemo(() => {
    if (!mealLogs.length) return 0;
    const dates = [...new Set(mealLogs.map(m => m.date))].sort().reverse();
    let streak = 0;
    const today = todayStr();
    let cursor = new Date(today + "T00:00:00");
    for (let i = 0; i < 365; i++) {
      const ds = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}-${String(cursor.getDate()).padStart(2,"0")}`;
      if (dates.includes(ds)) { streak++; cursor.setDate(cursor.getDate() - 1); }
      else if (i === 0) { cursor.setDate(cursor.getDate() - 1); }
      else break;
    }
    return streak;
  }, [mealLogs]);

  const todayMenuDay = new Date().toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const todayMenu = weekMenu?.plan?.[todayMenuDay];

  return (
    <PageLayout title="Fitness">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-6">

        {/* Today's menu strip */}
        {todayMenu && Object.values(todayMenu).some(Boolean) && (
          <div className="rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-4">
            <p className="text-[10px] font-pixel text-brand-500 dark:text-brand-400 mb-2">📅 TODAY'S MENU</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {MEAL_TIMES.map(mt => {
                const val = todayMenu[mt.toLowerCase()];
                if (!val) return null;
                return (
                  <div key={mt}>
                    <p className="text-[10px] text-brand-400 dark:text-brand-500">{mt}</p>
                    <p className="text-sm text-brand-700 dark:text-brand-200 leading-tight">{val}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800">
          {[["workouts","🏋️ Workouts"],["meals","🍽️ Meals"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 text-[10px] py-1.5 rounded-lg transition font-medium ${
                tab === id ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm" : "text-brand-400 dark:text-brand-500"
              }`}>{label}</button>
          ))}
        </div>

        {/* WORKOUTS TAB */}
        {tab === "workouts" && (
          <div className="space-y-4">
            {/* Streak stats */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
                <p className="text-xl font-pixel text-accent-500 dark:text-accent-300">{workoutStreak}</p>
                <p className="text-[10px] text-brand-400 dark:text-brand-500">day streak 🔥</p>
              </div>
              <div className="flex-1 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
                <p className="text-xl font-pixel text-brand-700 dark:text-brand-200">{logsThisWeek}</p>
                <p className="text-[10px] text-brand-400 dark:text-brand-500">this week</p>
              </div>
              <div className="flex-1 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
                <p className="text-xl font-pixel text-brand-700 dark:text-brand-200">{logs.length}</p>
                <p className="text-[10px] text-brand-400 dark:text-brand-500">total logs</p>
              </div>
            </div>

            {/* Workout sub-tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800">
              {[["log","📋 Log"],["routines","📅 Routines"],["exercises","🏷️ Exercises"]].map(([id, label]) => (
                <button key={id} onClick={() => setWorkoutSubTab(id)}
                  className={`flex-1 text-[10px] py-1.5 rounded-lg transition font-medium ${
                    workoutSubTab === id ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm" : "text-brand-400 dark:text-brand-500"
                  }`}>{label}</button>
              ))}
            </div>

            {/* Workout detail modal */}
            {selectedRoutine && (
              <WorkoutDetailModal routine={selectedRoutine} categories={categories}
                onClose={() => setSelectedRoutine(null)}
                onEdit={setEditingRoutine} onDelete={deleteFitnessRoutine} />
            )}

            {/* ── LOG sub-tab ── */}
            {workoutSubTab === "log" && (
              <div className="space-y-3">
                {!showLogForm && (
                  <button onClick={() => setShowLogForm(true)}
                    className="w-full py-3 rounded-2xl border-2 shadow-sm border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
                    + Log a workout
                  </button>
                )}
                {showLogForm && categories.length === 0 && (
                  <div className="text-center py-6 text-sm text-brand-400 dark:text-brand-500">
                    <p>Create an exercise type first.</p>
                    <button onClick={() => { setShowLogForm(false); setWorkoutSubTab("exercises"); setShowCategoryForm(true); }}
                      className="text-accent-500 dark:text-accent-300 underline text-xs mt-1">Add exercise</button>
                  </div>
                )}
                {showLogForm && categories.length > 0 && (
                  <LogWorkoutForm uid={uid} categories={categories} routines={routines}
                    onDone={() => setShowLogForm(false)} onCancel={() => setShowLogForm(false)} />
                )}
                {logs.length === 0 && !showLogForm && (
                  <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-8">No workouts logged yet.</p>
                )}
                {!showLogForm && logs.map(log => (
                  <LogCard key={log.id} log={log} categories={categories} routines={routines} onDelete={deleteFitnessLog} />
                ))}
              </div>
            )}

            {/* ── ROUTINES sub-tab ── */}
            {workoutSubTab === "routines" && (
              <div className="space-y-3">
                {!showRoutineForm && !editingRoutine && (
                  <button onClick={() => setShowRoutineForm(true)}
                    className="w-full py-3 rounded-2xl border-2 shadow-sm border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
                    + New workout
                  </button>
                )}
                {(showRoutineForm || editingRoutine) && (
                  <RoutineForm uid={uid} categories={categories} existing={editingRoutine}
                    onDone={() => { setShowRoutineForm(false); setEditingRoutine(null); }}
                    onCancel={() => { setShowRoutineForm(false); setEditingRoutine(null); }} />
                )}
                {routines.length === 0 && !showRoutineForm && (
                  <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-8">No routines yet.</p>
                )}
                {!showRoutineForm && !editingRoutine && routines.map(routine => (
                  <button key={routine.id} onClick={() => setSelectedRoutine(routine)}
                    className="w-full text-left rounded-2xl border-2 shadow-sm border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 p-4 hover:border-accent-300 dark:hover:border-accent-500 transition">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">{routine.name}</p>
                        <p className="text-[10px] text-brand-400 dark:text-brand-500">{routine.exercises?.length || 0} exercise{routine.exercises?.length !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="text-brand-300 dark:text-brand-600 text-sm">›</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {routine.exercises?.map((ex, i) => {
                        const cat = categories.find(c => c.id === ex.categoryId);
                        if (!cat) return null;
                        const style = getCategoryStyle(cat.color);
                        return <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${style.badge}`}>{cat.name}</span>;
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── EXERCISES sub-tab ── */}
            {workoutSubTab === "exercises" && (
              <div className="space-y-3">
                {!showCategoryForm && !editingCategory && (
                  <button onClick={() => { setShowCategoryForm(true); setEditingCategory(null); }}
                    className="w-full py-3 rounded-2xl border-2 shadow-sm border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
                    + New exercise type
                  </button>
                )}
                {(showCategoryForm || editingCategory) && (
                  <CategoryForm uid={uid} existing={editingCategory}
                    onDone={() => { setShowCategoryForm(false); setEditingCategory(null); }}
                    onCancel={() => { setShowCategoryForm(false); setEditingCategory(null); }} />
                )}
                {categories.length === 0 && !showCategoryForm && (
                  <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-8">No exercises yet.</p>
                )}
                {!showCategoryForm && !editingCategory && categories.map(cat => {
                  const style = getCategoryStyle(cat.color);
                  const catStreak = calculateCategoryStreak(logs, cat.id);
                  return (
                    <div key={cat.id} className={`rounded-2xl border-2 shadow-sm ${style.border} ${style.bg} p-4`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
                          <p className={`text-sm font-semibold ${style.text}`}>{cat.name}</p>
                          {catStreak > 0 && <span className="text-[10px] text-amber-500 font-medium">🔥 {catStreak}d</span>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingCategory(cat)} className="text-xs text-accent-500 dark:text-accent-300 font-medium">Edit</button>
                          <button onClick={() => { if (confirm(`Delete "${cat.name}"?`)) deleteFitnessCategory(cat.id); }}
                            className="text-brand-300 hover:text-red-400 text-lg leading-none">×</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.metrics?.map(mId => {
                          const m = getMetric(mId);
                          return m ? <span key={mId} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${style.badge}`}>{m.label}</span> : null;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* EXERCISES TAB removed — exercises are now in Workouts tab */}

        {/* MEALS TAB */}
        {tab === "meals" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
                <p className="text-xl font-pixel text-accent-500 dark:text-accent-300">{mealStreak}</p>
                <p className="text-[10px] text-brand-400 dark:text-brand-500">day streak 🔥</p>
              </div>
              <div className="flex-1 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
                <p className="text-xl font-pixel text-brand-700 dark:text-brand-200">{mealLogs.filter(m => m.date === todayStr()).length}</p>
                <p className="text-[10px] text-brand-400 dark:text-brand-500">today</p>
              </div>
              <div className="flex-1 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 text-center">
                <p className="text-xl font-pixel text-brand-700 dark:text-brand-200">{mealLogs.length}</p>
                <p className="text-[10px] text-brand-400 dark:text-brand-500">total logs</p>
              </div>
            </div>
            <MealsTab uid={uid} />
          </div>
        )}

      </div>
    </PageLayout>
  );
}

export default Fitness;
