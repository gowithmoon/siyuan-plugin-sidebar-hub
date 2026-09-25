import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, setTabVisibility } from "./preferences";

describe("侧边抽屉偏好", () => {
    it("切换标签页显隐时保留日记笔记本", () => {
        const preferences = { ...DEFAULT_PREFERENCES, dailyNotebookId: "daily-notebook" };

        expect(setTabVisibility(preferences, "tags", false).dailyNotebookId).toBe("daily-notebook");
    });
});
