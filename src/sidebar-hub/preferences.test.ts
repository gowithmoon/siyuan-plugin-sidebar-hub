import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, normalizePreferences, setTabVisibility } from "./preferences";

describe("侧边抽屉偏好", () => {
    it("切换标签页显隐时保留日记笔记本", () => {
        const preferences = { ...DEFAULT_PREFERENCES, dailyNotebookId: "daily-notebook" };

        expect(setTabVisibility(preferences, "tags", false).dailyNotebookId).toBe("daily-notebook");
    });

    it("恢复各标签页支持的排序，并让无效旧值回退到默认排序", () => {
        const preferences = normalizePreferences({
            activeTab: "pages",
            sorts: {
                bookmarks: { field: "updated", direction: "desc" },
                tags: { field: "created", direction: "desc" },
                databases: { field: "name", direction: "desc" },
                pages: { field: "created", direction: "asc" },
            },
        });

        expect(preferences.sorts).toEqual({
            bookmarks: { field: "updated", direction: "desc" },
            tags: { field: "name", direction: "asc" },
            databases: { field: "name", direction: "desc" },
            pages: { field: "created", direction: "asc" },
        });
    });
});
