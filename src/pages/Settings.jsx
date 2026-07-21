import { useState } from "react";
import PageLayout from "../components/PageLayout";
import { useAppSettings, getRank, xpForLevel } from "../context/AppSettingsContext";
import { query, collection, where, getDocs, deleteDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const THEME_OPTIONS = [
  { value: "auto",  label: "Auto (day/night)" },
  { value: "light", label: "Light (always)" },
  { value: "dark",  label: "Dark (always)" },
];

const PLAYER_ICONS = [
  // Warriors & Magic
  "🧙","⚔️","🏹","🛡️","🗡️","🪄","🔮","🧝","🧛","🧟","🧞","🧜","🧚","🦸","🦹",
  // Animals
  "🦊","🐺","🐉","🦁","🐯","🐻","🦝","🦅","🦉","🦂","🐊","🦖","🐙","🦈","🐬",
  // Nature & Elements
  "🌙","⚡","🔥","❄️","🌊","🌿","☀️","🌪️","🌋","💫","✨","🌸","🍄","🌑","⭐",
  // Gems & Objects
  "💎","💠","🔱","⚜️","🏆","👑","🎭","🎯","🎲","🗝️","📿","🪬","🧿","🪩","🎪",
  // Space & Mystic
  "🚀","🛸","🌌","🪐","☄️","🌠","🔭","🧬","⚗️","🧪","🪤","🎱","🧲","💡","🔬",
  // Cute & Fun
  "🐸","🦄","🐼","🐨","🦘","🦡","🦦","🐧","🦜","🦩","🦚","🦋","🐝","🐛","🦎",
];

function Settings({ onSignOut, user }) {
  const { themeMode, setThemeMode, playerName, setPlayerName, playerIcon, setPlayerIcon, playerLevel, playerXp } = useAppSettings();
  const [nameInput, setNameInput] = useState(playerName);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleSaveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) setPlayerName(trimmed);
  };

  const handleResetXp = async () => {
    if (!confirm("Reset all XP to zero? This cannot be undone.")) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setResetting(true);
    try {
      const q = query(collection(db, "xpLedger"), where("uid", "==", uid));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    } finally {
      setResetting(false);
    }
  };

  const rank = getRank(playerLevel);
  const xpToNext = xpForLevel(playerLevel);

  return (
    <PageLayout title="Settings">
      <div className="p-4 max-w-md mx-auto space-y-8">

        {/* Player */}
        <div>
          <h2 className="text-sm font-semibold text-brand-600 dark:text-brand-300 mb-3">Player</h2>

          {/* Current status — tap icon to open picker */}
          <div className="flex items-center gap-3 rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm px-4 py-3 mb-4">
            <button onClick={() => setShowIconPicker(true)}
              className="text-3xl w-12 h-12 rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 flex items-center justify-center hover:border-accent-400 transition flex-shrink-0"
              title="Change icon">
              {playerIcon}
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-pixel text-brand-700 dark:text-brand-200">LV {playerLevel} — {rank.name}</p>
              <p className="text-[10px] text-brand-400 dark:text-brand-500 mt-0.5">{playerXp} / {xpToNext} XP to next level</p>
              <button onClick={() => setShowIconPicker(true)} className="text-[10px] text-accent-500 dark:text-accent-300 mt-0.5">Change icon ›</button>
            </div>
          </div>

          {/* Icon picker modal */}
          {showIconPicker && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowIconPicker(false)} />
              <div className="relative w-full max-w-sm bg-white dark:bg-brand-900 rounded-2xl shadow-2xl border-2 border-brand-200 dark:border-brand-700 flex flex-col max-h-[70vh]">
                <div className="flex items-center justify-between px-4 py-3 border-b border-brand-100 dark:border-brand-700 flex-shrink-0">
                  <p className="text-sm font-pixel text-brand-700 dark:text-brand-200">CHOOSE ICON</p>
                  <button onClick={() => setShowIconPicker(false)} className="text-brand-400 hover:text-brand-700 dark:hover:text-brand-200 text-xl leading-none">×</button>
                </div>
                <div className="overflow-y-auto p-3 flex flex-wrap gap-2">
                  {PLAYER_ICONS.map((icon, i) => (
                    <button key={`${icon}-${i}`}
                      onClick={() => { setPlayerIcon(icon); setShowIconPicker(false); }}
                      className={`w-11 h-11 rounded-xl text-2xl flex items-center justify-center transition border-2 ${
                        playerIcon === icon
                          ? "border-accent-400 bg-accent-50 dark:bg-accent-900/30"
                          : "border-brand-200 dark:border-brand-600 hover:border-accent-300 bg-white dark:bg-brand-800"
                      }`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Name */}
          <p className="text-xs text-brand-500 dark:text-brand-400 mb-2">Name</p>
          <div className="flex gap-2">
            <input value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSaveName()}
              placeholder="Enter your name"
              className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-700 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <button onClick={handleSaveName} className="px-4 py-2 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600">Save</button>
          </div>
        </div>

        {/* Theme picker */}
        <div>
          <h2 className="text-sm font-semibold text-brand-600 dark:text-brand-300 mb-2">Theme</h2>
          <div className="space-y-2">
            {THEME_OPTIONS.map(option => (
              <label key={option.value}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition ${
                  themeMode === option.value
                    ? "border-brand-400 bg-brand-50 dark:bg-brand-800 dark:border-brand-600"
                    : "border-brand-100 dark:border-brand-700"
                }`}>
                <input type="radio" name="theme" value={option.value}
                  checked={themeMode === option.value}
                  onChange={() => setThemeMode(option.value)}
                  className="accent-brand-500" />
                <span className="text-brand-800 dark:text-brand-100">{option.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-brand-400 dark:text-brand-500 mt-2">Auto switches to dark purple between 7pm and 7am.</p>
        </div>

        {/* Account */}
        <div>
          <h2 className="text-sm font-semibold text-brand-600 dark:text-brand-300 mb-2">Account</h2>
          {user && (
            <p className="text-brand-600 dark:text-brand-300 mb-3 text-sm">
              Signed in as {user.displayName} ({user.email})
            </p>
          )}
          <div className="flex flex-col gap-2">
            <button onClick={onSignOut}
              className="px-4 py-2 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-300 rounded-lg font-medium hover:bg-red-100 dark:hover:bg-red-900 text-sm">
              Sign Out
            </button>
            <button onClick={handleResetXp} disabled={resetting}
              className="px-4 py-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-lg font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 text-sm border border-amber-200 dark:border-amber-800">
              {resetting ? "Resetting…" : "⚠️ Reset XP to zero"}
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default Settings;
