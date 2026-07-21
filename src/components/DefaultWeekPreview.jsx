import { useState, useEffect, useMemo } from "react";
import WeekTimelineGrid from "./WeekTimelineGrid";
import { listenToBlockDefinitions } from "../lib/routine";
import { auth } from "../firebase";

// Read-only preview of where fixed blocks land, derived straight from the
// block library — used both on the standalone Default Week page and
// embedded as a compact panel in the desktop Routine layout.
function DefaultWeekPreview({ fitToContainer = false, scrollHeight = 360 }) {
  const uid = auth.currentUser?.uid;
  const [blockDefs, setBlockDefs] = useState([]);

  useEffect(() => {
    if (!uid) return;
    return listenToBlockDefinitions(uid, setBlockDefs);
  }, [uid]);

  const dayColumns = useMemo(() => {
    const columns = [[], [], [], [], [], [], []];
    const fixedDefs = blockDefs.filter((b) => b.type === "fixed");
    for (const def of fixedDefs) {
      for (const day of def.defaultDaysOfWeek || []) {
        columns[day].push({
          id: `${def.id}-${day}`,
          blockDefId: def.id,
          name: def.name,
          color: def.color,
          customColor: def.customColor,
          startTime: def.defaultStartTime,
          endTime: def.defaultEndTime,
        });
      }
    }
    return columns;
  }, [blockDefs]);

  return (
    <WeekTimelineGrid
      dayColumns={dayColumns}
      onDropFreeform={() => {}}
      onTapBlock={() => {}}
      fitToContainer={fitToContainer}
      scrollHeight={scrollHeight}
    />
  );
}

export default DefaultWeekPreview;
