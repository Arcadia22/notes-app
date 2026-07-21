import { useState, useEffect, useMemo } from "react";
import { auth } from "../firebase";
import { getKanjiForDate, totalKanjiCount } from "../lib/kanjiData";
import {
  recordKanjiViewed, listenToKanjiHistoryInMonth, listenToAllKanjiHistory, localDateStr,
} from "../lib/kanjiOfTheDay";

// ── Kanji detail card ────────────────────────────────────────────────

function KanjiCard({ entry, dateLabel }) {
  return (
    <div className="rounded-2xl border-2 border-accent-500 bg-gradient-to-b from-brand-900 to-brand-950 p-6 text-center space-y-4">
      {dateLabel && <p className="text-[10px] font-pixel text-brand-400">{dateLabel}</p>}

      {/* The kanji itself, large */}
      <div className="py-4">
        <span className="text-7xl font-bold text-white" style={{ fontFamily: "'Noto Serif JP', serif" }}>
          {entry.kanji}
        </span>
      </div>

      {/* Reading + pronunciation */}
      <div className="flex justify-center gap-6">
        <div>
          <p className="text-[9px] text-brand-500 mb-1">READING</p>
          <p className="text-sm text-accent-300 font-medium">{entry.kunyomi}</p>
        </div>
        <div>
          <p className="text-[9px] text-brand-500 mb-1">SOUNDS LIKE</p>
          <p className="text-sm text-accent-300 font-medium">{entry.pronunciation}</p>
        </div>
      </div>

      {/* Meanings */}
      <div>
        <p className="text-[9px] text-brand-500 mb-1.5">MEANINGS</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {entry.meanings.map((m, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-accent-900/40 border border-accent-700 text-accent-200">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="pt-2 border-t border-brand-700">
        <p className="text-xs text-brand-300 leading-relaxed">{entry.description}</p>
      </div>

      {/* Example sentence */}
      {entry.sentence && (
        <div className="pt-2 border-t border-brand-700 space-y-1.5">
          <p className="text-[9px] text-brand-500">EXAMPLE</p>
          <p
            className="text-base text-white font-medium leading-loose"
            style={{ fontFamily: "'Noto Serif JP', serif", rubyPosition: "over" }}
            dangerouslySetInnerHTML={{ __html: entry.sentence }}
          />
          <p className="text-xs text-brand-400 italic">{entry.sentenceMeaning}</p>
        </div>
      )}
    </div>
  );
}

// ── History calendar ──────────────────────────────────────────────────

function HistoryCalendar({ uid, onClose }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [history, setHistory] = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    return listenToKanjiHistoryInMonth(uid, year, month, setHistory);
  }, [uid, year, month]);

  const historyByDate = useMemo(() => {
    const map = {};
    for (const h of history) map[h.date] = h;
    return map;
  }, [history]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const days = [];
  for (let i = 0; i < firstDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayStr = localDateStr();

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:w-96 max-h-[85vh] overflow-y-auto bg-brand-900 border-2 border-accent-500 rounded-t-2xl sm:rounded-2xl shadow-xl p-5">
        {selectedEntry ? (
          <div className="space-y-3">
            <button onClick={() => setSelectedEntry(null)} className="text-xs text-brand-400 hover:text-accent-300">‹ Back to calendar</button>
            <KanjiCard entry={selectedEntry} dateLabel={new Date(selectedEntry.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-pixel text-accent-300">KANJI HISTORY</h3>
              <button onClick={onClose} className="text-brand-300 text-xl leading-none">&times;</button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-lg text-brand-300 hover:bg-brand-800">‹</button>
              <span className="text-sm font-pixel text-brand-100">{monthLabel.toUpperCase()}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-lg text-brand-300 hover:bg-brand-800">›</button>
            </div>

            <div className="grid grid-cols-7 mb-1">
              {["S","M","T","W","T","F","S"].map((d,i) => (
                <div key={i} className="text-center text-[9px] font-medium text-brand-500 py-1">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                if (d === null) return <div key={i} />;
                const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                const entry = historyByDate[dateStr];
                const isToday = dateStr === todayStr;
                const isFuture = dateStr > todayStr;
                return (
                  <button
                    key={i}
                    onClick={() => entry && setSelectedEntry(entry)}
                    disabled={!entry}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center transition ${
                      isToday ? "ring-2 ring-accent-400" : ""
                    } ${
                      entry ? "bg-accent-900/40 hover:bg-accent-800/50 cursor-pointer" : "bg-white/5 cursor-default"
                    } ${isFuture ? "opacity-30" : ""}`}
                  >
                    {entry ? (
                      <span className="text-base text-white leading-none" style={{ fontFamily: "'Noto Serif JP', serif" }}>{entry.kanji}</span>
                    ) : (
                      <span className="text-[10px] text-brand-500 leading-none">{d}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────

export default function KanjiOfTheDayApp() {
  const uid = auth.currentUser?.uid;
  const [showHistory, setShowHistory] = useState(false);
  const todayStr = localDateStr();
  const todaysKanji = useMemo(() => getKanjiForDate(todayStr), [todayStr]);

  // Save today's kanji to history the moment the app is opened
  useEffect(() => {
    if (!uid) return;
    recordKanjiViewed(uid, todayStr, todaysKanji);
  }, [uid, todayStr, todaysKanji]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-950 to-brand-900 flex flex-col items-center px-4 py-8">
      {showHistory && <HistoryCalendar uid={uid} onClose={() => setShowHistory(false)} />}

      {/* Title */}
      <div className="text-center mb-2 flex items-center gap-2">
        <h1 className="text-lg font-pixel text-accent-300 tracking-wide">KANJI OF THE DAY</h1>
        <button onClick={() => setShowHistory(true)} title="View history" className="text-brand-400 hover:text-accent-300 transition">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
      </div>
      <div className="h-0.5 w-40 mb-6 bg-gradient-to-r from-transparent via-accent-400 to-transparent" />

      {/* Today's kanji */}
      <div className="w-full max-w-sm">
        <KanjiCard
          entry={todaysKanji}
          dateLabel={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        />
      </div>

      <p className="mt-6 text-[10px] text-brand-500 italic text-center">
        A new kanji appears every day · {totalKanjiCount()} kanji in rotation
      </p>
    </div>
  );
}
