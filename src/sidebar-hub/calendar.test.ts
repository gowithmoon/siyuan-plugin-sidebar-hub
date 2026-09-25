import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildCalendarMonth, toDateKey } from "./calendar";

const originalTimezone = process.env.TZ;

describe("月历", () => {
    beforeAll(() => {
        process.env.TZ = "Asia/Shanghai";
    });

    afterAll(() => {
        process.env.TZ = originalTimezone;
    });

    it("在固定时区按本地日期标记今天", () => {
        const fixedClock = new Date("2026-09-24T16:30:00.000Z");
        const month = buildCalendarMonth(2026, 8, fixedClock);

        expect(toDateKey(fixedClock)).toBe("2026-09-25");
        expect(month.days.find((day) => day.isToday)?.date).toBe("2026-09-25");
    });
});
