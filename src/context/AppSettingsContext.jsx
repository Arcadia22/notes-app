import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { listenToXpLedger } from "../lib/xp";
import { auth, db } from "../firebase";

const AppSettingsContext = createContext(null);
const THEME_KEY = "chaos-theme-mode"; // keep theme local — it's device preference

// ── XP / Level / Rank system ──────────────────────────────────────────
export const RANKS = [
  { name: "Novice",     minLevel: 1  },
  { name: "Apprentice", minLevel: 6  },
  { name: "Adept",      minLevel: 11 },
  { name: "Expert",     minLevel: 16 },
  { name: "Master",     minLevel: 21 },
  { name: "Champion",   minLevel: 26 },
  { name: "Legend",     minLevel: 31 },
  { name: "Mythic",     minLevel: 36 },
];

export function getRank(level) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (level >= r.minLevel) rank = r;
    else break;
  }
  return rank;
}

export function xpForLevel(level) {
  return 100 + (level - 1) * 50;
}

export function computeLevel(totalXp) {
  let xp = Math.max(0, totalXp);
  let level = 1;
  while (true) {
    const needed = xpForLevel(level);
    if (xp >= needed) { xp -= needed; level++; }
    else break;
  }
  return { level, xp, xpToNext: xpForLevel(level) };
}

function isNightTime() {
  const hour = new Date().getHours();
  return hour < 7 || hour >= 19;
}

function getLocalTheme() {
  try { return localStorage.getItem(THEME_KEY) || "auto"; } catch { return "auto"; }
}

// Save player profile to Firestore (syncs across devices)
async function savePlayerProfile(uid, data) {
  await setDoc(doc(db, "userSettings", uid), data, { merge: true });
}

export function AppSettingsProvider({ children }) {
  // Theme stays local
  const [themeMode, setThemeModeState] = useState(getLocalTheme);

  // Player profile comes from Firestore
  const [playerName, setPlayerNameState] = useState("Player Name");
  const [playerIcon, setPlayerIconState] = useState("🧙");

  // XP from ledger
  const [totalXp, setTotalXp] = useState(0);

  // Listen to auth + load profile + XP
  useEffect(() => {
    let unsubXp = null;
    let unsubProfile = null;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      // Cleanup previous listeners
      if (unsubXp) { unsubXp(); unsubXp = null; }
      if (unsubProfile) { unsubProfile(); unsubProfile = null; }

      if (user) {
        // Listen to player profile in Firestore (live updates)
        unsubProfile = onSnapshot(doc(db, "userSettings", user.uid), (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.playerName) setPlayerNameState(data.playerName);
            if (data.playerIcon) setPlayerIconState(data.playerIcon);
          }
        });

        // Listen to XP ledger
        unsubXp = listenToXpLedger(user.uid, ({ total }) => setTotalXp(total));
      } else {
        setTotalXp(0);
        setPlayerNameState("Player Name");
        setPlayerIconState("🧙");
      }
    });

    return () => {
      unsubAuth();
      if (unsubXp) unsubXp();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const { level: playerLevel, xp: playerXp, xpToNext } = computeLevel(totalXp);

  // Dark mode — local only
  const [isDark, setIsDark] = useState(() => {
    const mode = getLocalTheme();
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return isNightTime();
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeMode);
    if (themeMode === "dark") { setIsDark(true); return; }
    if (themeMode === "light") { setIsDark(false); return; }
    setIsDark(isNightTime());
    const interval = setInterval(() => setIsDark(isNightTime()), 60 * 1000);
    return () => clearInterval(interval);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setThemeMode = (mode) => setThemeModeState(mode);

  const setPlayerName = (name) => {
    setPlayerNameState(name);
    const uid = auth.currentUser?.uid;
    if (uid) savePlayerProfile(uid, { playerName: name });
  };

  const setPlayerIcon = (icon) => {
    setPlayerIconState(icon);
    const uid = auth.currentUser?.uid;
    if (uid) savePlayerProfile(uid, { playerIcon: icon });
  };

  return (
    <AppSettingsContext.Provider value={{
      themeMode, isDark, setThemeMode,
      playerName, setPlayerName,
      playerIcon, setPlayerIcon,
      playerLevel, playerXp, xpToNext, totalXp,
    }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error("useAppSettings must be used inside AppSettingsProvider");
  return ctx;
}
