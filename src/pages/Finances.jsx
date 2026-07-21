import { useState, useEffect, useMemo } from "react";
import PageLayout from "../components/PageLayout";
import { auth } from "../firebase";
import {
  listenToTransactions, createTransaction, updateTransaction, deleteTransaction,
  listenToFinanceCategories, createFinanceCategory, deleteFinanceCategory,
  listenToBudgets, createBudget, updateBudget, deleteBudget,
  listenToBudgetItems, createBudgetItem, updateBudgetItem, deleteBudgetItem,
  todayStr, fmtCurrency, fmtDate,
  DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES,
  CATEGORY_COLORS,
} from "../lib/finances";

// ── Helpers ───────────────────────────────────────────────────────────
const COLORS = ["violet","blue","emerald","amber","red","pink","sky","gray"];
const CURRENCIES = ["USD","EUR","GBP","JPY","ILS","BRL","CAD","AUD","CHF","MXN","KRW"];

function getCatStyle(color) {
  return CATEGORY_COLORS[color] || CATEGORY_COLORS.gray;
}

// ── Transaction Form ──────────────────────────────────────────────────
function TransactionForm({ uid, categories, existing, onDone, onCancel }) {
  const [type, setType]     = useState(existing?.type || "expense");
  const [amount, setAmount] = useState(existing?.amount || "");
  const [category, setCat]  = useState(existing?.category || "");
  const [note, setNote]     = useState(existing?.note || "");
  const [date, setDate]     = useState(existing?.date || todayStr());
  const [saving, setSaving] = useState(false);

  const cats = categories.filter(c => c.type === type || c.type === "both");

  const save = async () => {
    if (!amount || isNaN(Number(amount))) return;
    setSaving(true);
    try {
      const data = { type, amount: Number(amount), category, note, date };
      if (existing) await updateTransaction(existing.id, data);
      else await createTransaction(uid, data);
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border-2 border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 shadow-sm p-4 space-y-3">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">{existing ? "EDIT" : "NEW"} TRANSACTION</p>

      {/* Type toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-900">
        {[["expense","💸 Expense"],["income","💰 Income"]].map(([val, label]) => (
          <button key={val} onClick={() => { setType(val); setCat(""); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${type === val ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm" : "text-brand-400 dark:text-brand-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div>
        <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Amount</label>
        <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none" />
      </div>

      {/* Category */}
      <div>
        <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Category</label>
        <select value={category} onChange={e => setCat(e.target.value)}
          className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none appearance-none">
          <option value="">— Select category —</option>
          {cats.length > 0
            ? cats.map(c => <option key={c.id} value={c.name}>{c.name}</option>)
            : (type === "expense" ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES).map(c =>
                <option key={c} value={c}>{c}</option>
              )
          }
        </select>
      </div>

      {/* Note */}
      <div>
        <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Note (optional)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="What was this for?"
          className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
      </div>

      {/* Date */}
      <div>
        <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving || !amount}
          className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition">
          {saving ? "Saving…" : existing ? "Update" : "Add"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-sm text-brand-400 hover:text-brand-600">Cancel</button>
      </div>
    </div>
  );
}

// ── Budget Detail View ────────────────────────────────────────────────
function BudgetDetail({ uid, budget, onBack }) {
  const [items, setItems] = useState([]);
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetName, setBudgetName] = useState(budget.name);
  const [budgetNote, setBudgetNote] = useState(budget.note || "");

  useEffect(() => {
    return listenToBudgetItems(uid, budget.id, setItems);
  }, [uid, budget.id]);

  const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const byCategory = items.reduce((acc, item) => {
    const cat = item.category || "Uncategorized";
    acc[cat] = (acc[cat] || 0) + (Number(item.amount) || 0);
    return acc;
  }, {});

  const addItem = async () => {
    if (!newName.trim() || !newAmount) return;
    setSaving(true);
    try {
      if (editingItem) {
        await updateBudgetItem(editingItem.id, { name: newName.trim(), category: newCat, amount: Number(newAmount), note: newNote });
        setEditingItem(null);
      } else {
        await createBudgetItem(uid, budget.id, { name: newName.trim(), category: newCat, amount: Number(newAmount), note: newNote });
      }
      setNewName(""); setNewCat(""); setNewAmount(""); setNewNote(""); setAdding(false);
    } finally { setSaving(false); }
  };

  const startEdit = (item) => {
    setEditingItem(item); setNewName(item.name); setNewCat(item.category || "");
    setNewAmount(item.amount); setNewNote(item.note || ""); setAdding(true);
  };

  return (
    <div className="space-y-4">
      {/* Budget header */}
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onBack} className="text-accent-500 dark:text-accent-300 text-sm font-medium">‹ Back</button>
        <span className="text-brand-300 dark:text-brand-600">/</span>
        {editingBudget ? (
          <input value={budgetName} onChange={e => setBudgetName(e.target.value)}
            onBlur={async () => { await updateBudget(budget.id, { name: budgetName, note: budgetNote }); setEditingBudget(false); }}
            className="text-sm font-semibold text-brand-800 dark:text-brand-100 bg-transparent border-b border-accent-400 focus:outline-none flex-1" autoFocus />
        ) : (
          <button onClick={() => setEditingBudget(true)} className="text-sm font-semibold text-brand-800 dark:text-brand-100 hover:text-accent-500 dark:hover:text-accent-300 flex-1 text-left">
            {budget.name}
          </button>
        )}
      </div>

      {/* Summary card */}
      <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm p-4">
        <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-3">BUDGET SUMMARY</p>
        <div className="text-center mb-3">
          <p className="text-3xl font-bold text-brand-800 dark:text-brand-100">{fmtCurrency(total, budget.currency)}</p>
          <p className="text-xs text-brand-400 dark:text-brand-500 mt-0.5">total planned</p>
        </div>
        {/* Category breakdown */}
        {Object.keys(byCategory).length > 0 && (
          <div className="space-y-1.5 mt-3 pt-3 border-t border-brand-100 dark:border-brand-700">
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
              const pct = total > 0 ? (amt / total) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-brand-600 dark:text-brand-300">{cat}</span>
                    <span className="font-medium text-brand-700 dark:text-brand-200">{fmtCurrency(amt, budget.currency)}</span>
                  </div>
                  <div className="w-full h-1.5 bg-brand-100 dark:bg-brand-700 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-400 dark:bg-accent-300 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {budget.note && <p className="text-xs text-brand-400 dark:text-brand-500 mt-3 italic">{budget.note}</p>}
      </div>

      {/* Add item form */}
      {adding ? (
        <div className="rounded-2xl border-2 border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 shadow-sm p-4 space-y-2">
          <p className="text-[10px] font-pixel text-brand-400">{editingItem ? "EDIT ITEM" : "NEW ITEM"}</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Item name"
            className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
          <div className="flex gap-2">
            <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Category"
              className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none" />
            <input type="number" min="0" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Amount"
              className="w-28 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none appearance-none" />
          </div>
          <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Note (optional)"
            className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none" />
          <div className="flex gap-2 pt-1">
            <button onClick={addItem} disabled={saving || !newName.trim() || !newAmount}
              className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium disabled:opacity-50">
              {saving ? "…" : editingItem ? "Update" : "Add"}
            </button>
            <button onClick={() => { setAdding(false); setEditingItem(null); setNewName(""); setNewAmount(""); setNewCat(""); setNewNote(""); }}
              className="px-4 text-sm text-brand-400">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
          + Add item
        </button>
      )}

      {/* Items list */}
      {items.length === 0 && !adding && (
        <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-6">No items yet. Add your first expense.</p>
      )}
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-3 rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-brand-800 dark:text-brand-100 truncate">{item.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {item.category && <span className="text-[10px] text-brand-400 dark:text-brand-500">{item.category}</span>}
                {item.note && <span className="text-[10px] text-brand-400 dark:text-brand-500 italic truncate">{item.note}</span>}
              </div>
            </div>
            <span className="text-sm font-semibold text-brand-700 dark:text-brand-200 flex-shrink-0">{fmtCurrency(item.amount, budget.currency)}</span>
            <button onClick={() => startEdit(item)} className="text-xs text-accent-500 dark:text-accent-300 flex-shrink-0">Edit</button>
            <button onClick={() => { if (confirm(`Delete "${item.name}"?`)) deleteBudgetItem(item.id); }}
              className="text-brand-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Finances Component ───────────────────────────────────────────
function Finances() {
  const uid = auth.currentUser?.uid;
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [tab, setTab] = useState("overview"); // overview | log | budgets | categories
  const [openBudget, setOpenBudget] = useState(null);
  const [addingTx, setAddingTx] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [txFilter, setTxFilter] = useState("all"); // all | income | expense
  const [txMonth, setTxMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });
  // Budget form
  const [addingBudget, setAddingBudget] = useState(false);
  const [budgetName, setBudgetName] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [budgetNote, setBudgetNote] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  // Category form
  const [addingCat, setAddingCat] = useState(false);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("violet");
  const [catType, setCatType] = useState("expense");
  const [savingCat, setSavingCat] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const u1 = listenToTransactions(uid, setTransactions);
    const u2 = listenToFinanceCategories(uid, setCategories);
    const u3 = listenToBudgets(uid, setBudgets);
    return () => { u1(); u2(); u3(); };
  }, [uid]);

  // Overview stats
  const monthTx = useMemo(() => transactions.filter(t => t.date?.startsWith(txMonth)), [transactions, txMonth]);
  const totalIncome  = useMemo(() => monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0), [monthTx]);
  const totalExpense = useMemo(() => monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0), [monthTx]);
  const balance      = totalIncome - totalExpense;

  const expenseByCategory = useMemo(() => {
    const acc = {};
    monthTx.filter(t => t.type === "expense").forEach(t => {
      const cat = t.category || "Other";
      acc[cat] = (acc[cat] || 0) + t.amount;
    });
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [monthTx]);

  const filteredTx = useMemo(() => {
    let tx = transactions.filter(t => t.date?.startsWith(txMonth));
    if (txFilter !== "all") tx = tx.filter(t => t.type === txFilter);
    return tx;
  }, [transactions, txMonth, txFilter]);

  // Month navigation
  const changeMonth = (delta) => {
    const [y, m] = txMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setTxMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  };
  const monthLabel = new Date(txMonth + "-02").toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const createBudgetHandler = async () => {
    if (!budgetName.trim()) return;
    setSavingBudget(true);
    try {
      await createBudget(uid, { name: budgetName.trim(), currency: budgetCurrency, note: budgetNote });
      setBudgetName(""); setBudgetCurrency("USD"); setBudgetNote(""); setAddingBudget(false);
    } finally { setSavingBudget(false); }
  };

  const createCatHandler = async () => {
    if (!catName.trim()) return;
    setSavingCat(true);
    try {
      await createFinanceCategory(uid, { name: catName.trim(), color: catColor, type: catType });
      setCatName(""); setCatColor("violet"); setCatType("expense"); setAddingCat(false);
    } finally { setSavingCat(false); }
  };

  if (openBudget) {
    const budget = budgets.find(b => b.id === openBudget);
    if (budget) return (
      <PageLayout title="Finances">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
          <BudgetDetail uid={uid} budget={budget} onBack={() => setOpenBudget(null)} />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Finances">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10 space-y-4">

        {/* Month selector (shared across tabs) */}
        <div className="flex items-center justify-between">
          <button onClick={() => changeMonth(-1)} className="w-8 h-8 rounded-full border-2 border-brand-200 dark:border-brand-600 flex items-center justify-center text-brand-500 dark:text-brand-400 hover:border-accent-400 transition text-sm">‹</button>
          <span className="text-sm font-semibold text-brand-700 dark:text-brand-200">{monthLabel}</span>
          <button onClick={() => changeMonth(1)} className="w-8 h-8 rounded-full border-2 border-brand-200 dark:border-brand-600 flex items-center justify-center text-brand-500 dark:text-brand-400 hover:border-accent-400 transition text-sm">›</button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800">
          {[["overview","📊 Overview"],["log","📋 Log"],["budgets","🗂️ Budgets"],["categories","🏷️ Categories"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 text-[10px] py-1.5 rounded-lg transition font-medium ${tab === id ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm" : "text-brand-400 dark:text-brand-500"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm p-3 text-center">
                <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-1">Income</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">${totalIncome.toFixed(0)}</p>
              </div>
              <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm p-3 text-center">
                <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-1">Expenses</p>
                <p className="text-sm font-bold text-red-500 dark:text-red-400">${totalExpense.toFixed(0)}</p>
              </div>
              <div className={`rounded-2xl border-2 shadow-sm p-3 text-center ${balance >= 0 ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30"}`}>
                <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-1">Balance</p>
                <p className={`text-sm font-bold ${balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>${Math.abs(balance).toFixed(0)}</p>
              </div>
            </div>

            {/* Expense breakdown by category */}
            {expenseByCategory.length > 0 && (
              <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm p-4">
                <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-3">EXPENSES BY CATEGORY</p>
                <div className="space-y-2.5">
                  {expenseByCategory.map(([cat, amt]) => {
                    const pct = totalExpense > 0 ? (amt / totalExpense) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-brand-700 dark:text-brand-200">{cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-brand-400 dark:text-brand-500">{pct.toFixed(0)}%</span>
                            <span className="font-semibold text-brand-700 dark:text-brand-200">${amt.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-brand-100 dark:bg-brand-700 rounded-full overflow-hidden">
                          <div className="h-full bg-accent-400 dark:bg-accent-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {monthTx.length === 0 && (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">💸</p>
                <p className="text-sm text-brand-300 dark:text-brand-500 italic">No transactions this month.</p>
                <button onClick={() => { setTab("log"); setAddingTx(true); }} className="text-xs text-accent-500 dark:text-accent-300 underline mt-2">Log your first one</button>
              </div>
            )}
          </div>
        )}

        {/* ── LOG TAB ── */}
        {tab === "log" && (
          <div className="space-y-3">
            {(addingTx || editingTx) ? (
              <TransactionForm uid={uid} categories={categories}
                existing={editingTx}
                onDone={() => { setAddingTx(false); setEditingTx(null); }}
                onCancel={() => { setAddingTx(false); setEditingTx(null); }} />
            ) : (
              <button onClick={() => setAddingTx(true)}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
                + Log transaction
              </button>
            )}

            {/* Filter */}
            {!addingTx && !editingTx && (
              <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800">
                {[["all","All"],["income","Income"],["expense","Expenses"]].map(([val, label]) => (
                  <button key={val} onClick={() => setTxFilter(val)}
                    className={`flex-1 text-[10px] py-1.5 rounded-lg transition font-medium ${txFilter === val ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm" : "text-brand-400 dark:text-brand-500"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {filteredTx.length === 0 && !addingTx && (
              <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-8">No transactions this month.</p>
            )}

            {!addingTx && !editingTx && filteredTx.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm px-4 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${tx.type === "income" ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                  {tx.type === "income" ? "+" : "−"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-800 dark:text-brand-100 truncate">{tx.note || tx.category || "Transaction"}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tx.category && <span className="text-[10px] text-brand-400 dark:text-brand-500">{tx.category}</span>}
                    <span className="text-[10px] text-brand-300 dark:text-brand-600">{fmtDate(tx.date)}</span>
                  </div>
                </div>
                <span className={`text-sm font-semibold flex-shrink-0 ${tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                  {tx.type === "income" ? "+" : "−"}${tx.amount.toFixed(2)}
                </span>
                <button onClick={() => setEditingTx(tx)} className="text-xs text-accent-500 dark:text-accent-300 flex-shrink-0">Edit</button>
                <button onClick={() => { if (confirm("Delete this transaction?")) deleteTransaction(tx.id); }}
                  className="text-brand-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        )}

        {/* ── BUDGETS TAB ── */}
        {tab === "budgets" && (
          <div className="space-y-3">
            {addingBudget ? (
              <div className="rounded-2xl border-2 border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 shadow-sm p-4 space-y-2">
                <p className="text-[10px] font-pixel text-brand-400">NEW BUDGET</p>
                <input value={budgetName} onChange={e => setBudgetName(e.target.value)} placeholder="Budget name (e.g. Japan Trip)"
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
                <div className="flex gap-2">
                  <select value={budgetCurrency} onChange={e => setBudgetCurrency(e.target.value)}
                    className="w-24 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-2 text-sm focus:outline-none appearance-none">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input value={budgetNote} onChange={e => setBudgetNote(e.target.value)} placeholder="Note (optional)"
                    className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={createBudgetHandler} disabled={savingBudget || !budgetName.trim()}
                    className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium disabled:opacity-50">
                    {savingBudget ? "…" : "Create"}
                  </button>
                  <button onClick={() => setAddingBudget(false)} className="px-4 text-sm text-brand-400">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingBudget(true)}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
                + New budget
              </button>
            )}

            {budgets.length === 0 && !addingBudget && (
              <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-8">No budgets yet. Create one for trips, events, or goals.</p>
            )}

            {budgets.map(b => (
              <div key={b.id} onClick={() => setOpenBudget(b.id)} role="button" tabIndex={0}
                onKeyDown={e => e.key === "Enter" && setOpenBudget(b.id)}
                className="w-full text-left rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm p-4 hover:border-accent-300 dark:hover:border-accent-500 transition cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-brand-800 dark:text-brand-100 truncate">{b.name}</p>
                    {b.note && <p className="text-xs text-brand-400 dark:text-brand-500 mt-0.5 truncate">{b.note}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] bg-brand-100 dark:bg-brand-700 text-brand-500 dark:text-brand-400 px-2 py-0.5 rounded-full">{b.currency}</span>
                    <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${b.name}"?`)) deleteBudget(b.id); }}
                      className="text-brand-300 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                </div>
                <p className="text-[10px] text-accent-500 dark:text-accent-300 mt-2">Tap to open →</p>
              </div>
            ))}
          </div>
        )}

        {/* ── CATEGORIES TAB ── */}
        {tab === "categories" && (
          <div className="space-y-3">
            {addingCat ? (
              <div className="rounded-2xl border-2 border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 shadow-sm p-4 space-y-2">
                <p className="text-[10px] font-pixel text-brand-400">NEW CATEGORY</p>
                <input value={catName} onChange={e => setCatName(e.target.value)} placeholder="Category name"
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
                <div className="flex gap-2">
                  <select value={catType} onChange={e => setCatType(e.target.value)}
                    className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-2 text-sm focus:outline-none appearance-none">
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="both">Both</option>
                  </select>
                  <select value={catColor} onChange={e => setCatColor(e.target.value)}
                    className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-2 text-sm focus:outline-none appearance-none">
                    {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={createCatHandler} disabled={savingCat || !catName.trim()}
                    className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium disabled:opacity-50">
                    {savingCat ? "…" : "Add"}
                  </button>
                  <button onClick={() => setAddingCat(false)} className="px-4 text-sm text-brand-400">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingCat(true)}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
                + New category
              </button>
            )}

            {/* Default categories notice */}
            {categories.length === 0 && !addingCat && (
              <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-800 shadow-sm p-4">
                <p className="text-xs font-medium text-brand-600 dark:text-brand-300 mb-2">Default categories</p>
                <p className="text-xs text-brand-400 dark:text-brand-500 mb-3">Using built-in categories. Add custom ones above to override.</p>
                <div className="space-y-1">
                  <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-1">EXPENSE</p>
                  <div className="flex flex-wrap gap-1">
                    {DEFAULT_EXPENSE_CATEGORIES.map(c => (
                      <span key={c} className="px-2 py-0.5 rounded-full text-[10px] bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">{c}</span>
                    ))}
                  </div>
                  <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500 mb-1 mt-2">INCOME</p>
                  <div className="flex flex-wrap gap-1">
                    {DEFAULT_INCOME_CATEGORIES.map(c => (
                      <span key={c} className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {categories.map(c => {
                const style = getCatStyle(c.color);
                return (
                  <div key={c.id} className={`flex items-center justify-between rounded-2xl border-2 px-4 py-3 shadow-sm ${style.badge}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                      <span className="text-sm font-medium">{c.name}</span>
                      <span className="text-[10px] opacity-60">{c.type}</span>
                    </div>
                    <button onClick={() => { if (confirm(`Delete "${c.name}"?`)) deleteFinanceCategory(c.id); }}
                      className="text-brand-300 hover:text-red-400 text-lg leading-none">×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </PageLayout>
  );
}

export default Finances;
