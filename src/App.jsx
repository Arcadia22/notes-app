import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { AppSettingsProvider } from "./context/AppSettingsContext";
import { registerServiceWorker, fireOverdueNotifications } from "./lib/notifications";

import Home from "./pages/Home";
import Routine from "./pages/Routine";
import DefaultWeekTemplate from "./pages/DefaultWeekTemplate";
import Calendar from "./pages/Calendar";
import Habits from "./pages/Habits";
import HabitDetail from "./pages/HabitDetail";
import Finances from "./pages/Finances";
import Projects from "./pages/Projects";
import Chores from "./pages/Chores";
import Reminders from "./pages/Reminders";
import Timer from "./pages/Timer";
import BrainDump from "./pages/BrainDump";
import BrainDumpBoard from "./pages/BrainDumpBoard";

function BrainDumpHistoryLayout() {
  return <Outlet />;
}
import DailyLog from "./pages/DailyLog";
import Fitness from "./pages/Fitness";
import Hobbies from "./pages/Hobbies";
import MiniGame from "./pages/MiniGame";
import Others from "./pages/Others";
import ShoppingLists from "./pages/ShoppingLists";
import Settings from "./pages/Settings";

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    registerServiceWorker();
    // Fire any notifications that triggered while the app was backgrounded
    fireOverdueNotifications();
    const onVisible = () => { if (document.visibilityState === "visible") fireOverdueNotifications(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = () => {
    signInWithPopup(auth, googleProvider).catch((error) => {
      console.error("Sign-in error:", error);
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-50">
        <button
          onClick={handleSignIn}
          className="px-6 py-3 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-700"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  // Sign out is reachable from Settings page, not the top-level shell anymore,
  // since each page now manages its own header via PageLayout.
  return (
    <AppSettingsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/routine" element={<Routine />} />
          <Route path="/default-week" element={<DefaultWeekTemplate />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/habits/:habitId" element={<HabitDetail />} />
          <Route path="/goals" element={<Projects />} />
          <Route path="/finances" element={<Finances />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/chores" element={<Chores />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/timer" element={<Timer />} />
          <Route element={<BrainDumpHistoryLayout />}>
            <Route path="/brain-dump" element={<BrainDump />} />
            <Route path="/brain-dump/:boardId" element={<BrainDumpBoard />} />
          </Route>
          <Route path="/daily-log" element={<DailyLog />} />
          <Route path="/fitness" element={<Fitness />} />
          <Route path="/hobbies" element={<Hobbies />} />
          <Route path="/mini-game" element={<MiniGame />} />
          <Route path="/others" element={<Others />} />
          <Route path="/shopping-lists" element={<ShoppingLists />} />
          <Route path="/settings" element={<Settings onSignOut={() => signOut(auth)} user={user} />} />
        </Routes>
      </BrowserRouter>
    </AppSettingsProvider>
  );
}

export default App;
