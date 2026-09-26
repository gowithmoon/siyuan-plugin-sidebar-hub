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

    it("兼容旧偏好并规范化书签分组折叠身份", () => {
        expect(normalizePreferences({}).collapsedBookmarkGroups).toEqual([]);
        expect(normalizePreferences({
            collapsedBookmarkGroups: ["参考", "参考", "", 42, " 常用 "],
        }).collapsedBookmarkGroups).toEqual(["参考", " 常用 "]);
    });

    it("兼容旧偏好并规范化标签路径折叠身份", () => {
        expect(normalizePreferences({}).collapsedTagPaths).toEqual([]);
        expect(normalizePreferences({
            collapsedTagPaths: ["标签", "标签", "", 42, "标签/子标签"],
        }).collapsedTagPaths).toEqual(["标签", "标签/子标签"]);
    });
});
