import { useState, useEffect } from "react";
import { CATEGORY_COLORS, getCategoryColor } from "../lib/categoryColors";
import {
  listenToBlockDefinitions,
  createBlockDefinition,
  updateBlockDefinition,
  deleteBlockDefinition,
} from "../lib/routine";
import { auth } from "../firebase";
import ColorPicker from "./ColorPicker";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toggleDay(days, day) {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
}

function BlockForm({ uid, type, existingBlock, onDone, onCancel }) {
  const [name, setName] = useState(existingBlock?.name || "");
  const [color, setColor] = useState(existingBlock?.color || CATEGORY_COLORS[0].id);
  const [customColor, setCustomColor] = useState(existingBlock?.customColor || null);
  const [daysOfWeek, setDaysOfWeek] = useState(existingBlock?.defaultDaysOfWeek || []);
  const [startTime, setStartTime] = useState(existingBlock?.defaultStartTime || "09:00");
  const [endTime, setEndTime] = useState(existingBlock?.defaultEndTime || "10:00");
  const [durationMinutes, setDurationMinutes] = useState(existingBlock?.durationMinutes ?? 30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const timeInvalid = type === "fixed" && endTime <= startTime;
  const durationInvalid = type === "freeform" && (!durationMinutes || durationMinutes <= 0);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give this block a name first.");
      return;
    }
    if (type === "fixed" && daysOfWeek.length === 0) {
      setError("Pick at least one day for a fixed block.");
      return;
    }
    if (timeInvalid) {
      setError("End time needs to be after the start time.");
      return;
    }
    if (durationInvalid) {
      setError("Give this task a duration in minutes.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      const data = {
        type,
        name: trimmed,
        color,
        customColor: customColor || null,
        defaultDaysOfWeek: type === "fixed" ? daysOfWeek : [],
        defaultStartTime: type === "fixed" ? startTime : null,
        defaultEndTime: type === "fixed" ? endTime : null,
        durationMinutes: type === "freeform" ? Number(durationMinutes) : null,
      };
      if (existingBlock) {
        await updateBlockDefinition(existingBlock.id, data);
      } else {
        await createBlockDefinition(uid, data);
      }
      onDone();
    } catch (err) {
      console.error("Failed to save block:", err);
      setError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 p-3 rounded-lg bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={type === "fixed" ? "e.g. Work, Class" : "e.g. Work on Goals"}
        className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-900 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
      />

      <ColorPicker
        value={{ colorId: color, customColor }}
        onChange={({ colorId, customColor: cc }) => {
          setColor(colorId);
          setCustomColor(cc);
        }}
      />

      {type === "fixed" && (
        <>
          <div>
            <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
              Days
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDaysOfWeek((prev) => toggleDay(prev, i))}
                  className={`w-9 h-9 rounded-lg text-xs font-medium transition ${
                    daysOfWeek.includes(i)
                      ? "bg-brand-600 text-white"
                      : "bg-white dark:bg-brand-800 text-brand-500 dark:text-brand-300 border border-brand-200 dark:border-brand-600"
                  }`}
                >
                  {d[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                Start
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-900 dark:text-brand-100 px-3 pr-4 py-1.5 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
                End
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={`w-full rounded-lg border bg-white dark:bg-brand-800 text-brand-900 dark:text-brand-100 px-3 pr-4 py-1.5 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 ${
                  timeInvalid
                    ? "border-red-300 dark:border-red-600"
                    : "border-brand-200 dark:border-brand-600"
                }`}
              />
            </div>
          </div>
          {timeInvalid && (
            <p className="text-xs text-red-500 dark:text-red-400">
              End time must be after the start time.
            </p>
          )}
        </>
      )}

      {type === "freeform" && (
        <div>
          <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-1">
            How long does this take?
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[15, 30, 45, 60, 90, 120].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setDurationMinutes(mins)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                  durationMinutes === mins
                    ? "bg-brand-600 text-white"
                    : "bg-white dark:bg-brand-800 text-brand-500 dark:text-brand-300 border border-brand-200 dark:border-brand-600"
                }`}
              >
                {mins < 60 ? `${mins}m` : `${mins / 60}h${mins % 60 ? ` ${mins % 60}m` : ""}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className={`w-24 rounded-lg border bg-white dark:bg-brand-800 text-brand-900 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 ${
                durationInvalid
                  ? "border-red-300 dark:border-red-600"
                  : "border-brand-200 dark:border-brand-600"
              }`}
            />
            <span className="text-xs text-brand-400 dark:text-brand-500">minutes</span>
          </div>
          {durationInvalid && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">
              Enter a duration greater than 0.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

function formatDuration(mins) {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function BlockRow({ block, onEdit, onDelete }) {
  const color = getCategoryColor(block.color, true, block.customColor);
  const dayLabel =
    block.type === "fixed" && block.defaultDaysOfWeek?.length
      ? block.defaultDaysOfWeek.map((d) => DAY_NAMES[d][0]).join("")
      : null;

  return (
    <div
      className={`relative rounded-lg border-2 px-2 py-1.5 flex flex-col ${
        color.isCustom ? "" : `${color.badge} border-current/20`
      }`}
      style={
        color.isCustom
          ? { ...color.badgeStyle, borderColor: color.hex, height: "84px" }
          : { borderColor: "currentColor", height: "84px" }
      }
    >
      <div className="flex items-start gap-1 min-w-0">
        {color.isCustom ? (
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={color.dotStyle} />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${color.dot}`} />
        )}
        <span className="text-xs font-medium leading-tight line-clamp-2">{block.name}</span>
      </div>

      <div className="flex-1 min-h-0">
        {dayLabel && (
          <p className="text-[9px] opacity-75 mt-0.5 truncate">
            {dayLabel} · {block.defaultStartTime}–{block.defaultEndTime}
          </p>
        )}
        {block.type === "freeform" && block.durationMinutes && (
          <p className="text-[9px] opacity-75 mt-0.5">{formatDuration(block.durationMinutes)}</p>
        )}
      </div>

      <div className="flex gap-2 mt-auto pt-1">
        <button
          onClick={() => onEdit(block)}
          className="text-[9px] font-medium opacity-75 hover:opacity-100"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(block.id)}
          className="text-[9px] font-medium opacity-75 hover:opacity-100"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function BlockLibrarySection({ uid, type, title, blocks }) {
  const [adding, setAdding] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);

  const handleDelete = async (blockId) => {
    if (!confirm("Delete this block from your library? Already-placed copies on past/future weeks stay as they are.")) return;
    await deleteBlockDefinition(blockId);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-pixel text-brand-600 dark:text-brand-300">{title}</h3>
        {!adding && !editingBlock && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-accent-500 dark:text-accent-300 font-medium"
          >
            + Add
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3">
          <BlockForm uid={uid} type={type} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      )}

      {editingBlock && (
        <div className="mb-3">
          <BlockForm
            uid={uid}
            type={type}
            existingBlock={editingBlock}
            onDone={() => setEditingBlock(null)}
            onCancel={() => setEditingBlock(null)}
          />
        </div>
      )}

      {blocks.length === 0 ? (
        <p className="text-xs text-brand-300 dark:text-brand-500 italic">No {title.toLowerCase()} yet.</p>
      ) : (
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-1.5">
          {blocks.map((block) => (
            <BlockRow key={block.id} block={block} onEdit={setEditingBlock} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockLibraryManager() {
  const uid = auth.currentUser?.uid;
  const [blockDefs, setBlockDefs] = useState([]);

  useEffect(() => {
    if (!uid) return;
    return listenToBlockDefinitions(uid, setBlockDefs);
  }, [uid]);

  const fixedBlocks = blockDefs.filter((b) => b.type === "fixed");
  const freeformBlocks = blockDefs.filter((b) => b.type === "freeform");

  return (
    <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-4 space-y-6">
      <BlockLibrarySection uid={uid} type="fixed" title="Fixed blocks" blocks={fixedBlocks} />
      <BlockLibrarySection uid={uid} type="freeform" title="Freeform blocks" blocks={freeformBlocks} />
    </div>
  );
}

export default BlockLibraryManager;
