// Opening hours picked from lists read the same way for every shop.
import { describe, expect, it } from "vitest";
import { formatDays, formatSchedule, isValidSchedule } from "@contracts/shops";

describe("shop opening hours", () => {
  it("read as short day ranges and times", () => {
    expect(formatSchedule({ days: [0, 1, 2, 3, 4, 5], open: "08:00", close: "18:00" }, "en")).toBe("Mon–Sat · 8:00–18:00");
    expect(formatSchedule({ days: [0, 1, 2, 3, 4, 5, 6], allDay: true }, "en")).toBe("Every day · 24 hours");
    expect(formatDays([0, 1, 2, 3, 4, 6], "en")).toBe("Mon–Fri, Sun");
    expect(formatDays([0, 2], "en")).toBe("Mon, Wed");
    expect(formatSchedule({ days: [0, 1, 2, 3, 4], open: "09:30", close: "24:00" }, "ar")).toBe("الإثنين–الجمعة · 9:30–24:00");
  });

  it("need days and a closing time after the opening time, unless open 24 hours", () => {
    expect(isValidSchedule({ days: [0], open: "08:00", close: "18:00" })).toBe(true);
    expect(isValidSchedule({ days: [6], allDay: true })).toBe(true);
    expect(isValidSchedule({ days: [], allDay: true })).toBe(false);
    expect(isValidSchedule({ days: [0], open: "18:00", close: "08:00" })).toBe(false);
    expect(isValidSchedule({ days: [0], open: "08:00" })).toBe(false);
    expect(isValidSchedule({ days: [7], open: "08:00", close: "18:00" })).toBe(false);
  });
});
