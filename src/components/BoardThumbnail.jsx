import { useState, useEffect } from "react";
import { Sakura } from "./Decorations";
import { listenToCards } from "../lib/brainDump";
import { getCategoryColor } from "../lib/categoryColors";

// Live "map view" of a board's cards — each card renders as a tiny
// proportionally-positioned rectangle in its own color, rather than
// trying to show actual readable content at thumbnail size (which
// wouldn't be legible anyway, and would mean loading full images for
// every preview). Shared between the boards list page and the
// in-canvas board-link card, so both stay visually consistent.
//
// compact: smaller icon/padding for the tiny board-link card context,
//   versus the larger boards-list card context.
function BoardThumbnail({ uid, boardId, boardColor, compact = false }) {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!uid || !boardId) return;
    return listenToCards(uid, boardId, setCards);
  }, [uid, boardId]);

  // Slightly stronger tint at small thumbnail sizes so the color still
  // reads clearly, but never so strong it replaces/hides the preview.
  const tintStyle = boardColor ? { backgroundColor: `${boardColor}${compact ? "14" : "22"}` } : undefined;

  if (cards.length === 0) {
    return (
      <div
        className={`w-full h-full rounded-lg bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-700 dark:to-brand-900 flex items-center justify-center ${
          compact ? "" : "aspect-video mb-2"
        }`}
        style={tintStyle}
      >
        <Sakura className={compact ? "w-3.5 h-3.5 text-brand-300 dark:text-brand-500" : "w-6 h-6 text-brand-300 dark:text-brand-500"} />
      </div>
    );
  }

  // Find the bounding box of all cards so the mini-map scales to fit
  // whatever area is actually in use, regardless of where on the
  // (effectively infinite) canvas they happen to sit.
  const minX = Math.min(...cards.map((c) => c.x));
  const minY = Math.min(...cards.map((c) => c.y));
  const maxX = Math.max(...cards.map((c) => c.x + c.width));
  const maxY = Math.max(...cards.map((c) => c.y + c.height));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  return (
    <div
      className={`relative w-full h-full rounded-lg bg-brand-50 dark:bg-brand-900 overflow-hidden ${
        compact ? "" : "aspect-video mb-2 border border-brand-200 dark:border-brand-700"
      }`}
      style={tintStyle}
    >
      {cards.map((card) => {
        const color = getCategoryColor(card.color, true, card.type === "color" ? card.color : null);
        // Map each card's canvas position/size into 0-100% of the
        // thumbnail box, preserving relative layout.
        const leftPct = ((card.x - minX) / spanX) * 100;
        const topPct = ((card.y - minY) / spanY) * 100;
        const widthPct = Math.max((card.width / spanX) * 100, 3);
        const heightPct = Math.max((card.height / spanY) * 100, 3);

        let bg = "#ddc9f2";
        if (card.type === "color") bg = card.color || "#a878d8";
        else if (card.type === "image" && card.imageUrl) bg = null; // rendered as a real image below
        else if (card.type === "column" || card.type === "group") bg = "transparent";
        else if (card.type === "document") bg = "#ffffff";
        else if (card.type === "board") bg = "#c4a3e8";

        if (card.type === "image" && card.imageUrl) {
          return (
            <img
              key={card.id}
              src={card.imageUrl}
              alt=""
              className="absolute object-cover rounded-sm"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
              }}
            />
          );
        }

        return (
          <div
            key={card.id}
            className={`absolute rounded-sm ${
              card.type === "column" || card.type === "group"
                ? "border border-dashed border-brand-300 dark:border-brand-500"
                : ""
            }`}
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
              backgroundColor: bg || undefined,
            }}
          />
        );
      })}
    </div>
  );
}

export default BoardThumbnail;
