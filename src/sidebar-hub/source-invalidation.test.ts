import { describe, expect, it } from "vitest";

import { sourceInvalidationForEvent } from "./source-invalidation";

describe("思源事件触发的来源失效", () => {
    it("笔记本打开或关闭时让全部来源与日历失效", () => {
        expect(sourceInvalidationForEvent("opened-notebook")).toEqual({
            tabs: ["bookmarks", "tags", "databases", "pages"],
            dailyNotes: true,
        });
        expect(sourceInvalidationForEvent("closed-notebook")).toEqual({
            tabs: ["bookmarks", "tags", "databases", "pages"],
            dailyNotes: true,
        });
    });

    it("内容事务只让操作实际影响的来源失效", () => {
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "transactions",
            data: [{ doOperations: [{
                action: "updateAttrs",
                data: { old: { bookmark: "" }, new: { bookmark: "参考" } },
            }] }],
        })).toEqual({
            tabs: ["bookmarks"],
        });
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "transactions",
            data: [{ doOperations: [{
                action: "update",
                data: '<span data-type="tag">项目</span>',
            }] }],
        })).toEqual({
            tabs: ["tags"],
        });
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "transactions",
            data: [{ doOperations: [{ action: "setAttrViewName", avID: "av-1" }] }],
        })).toEqual({
            tabs: ["databases"],
        });
    });

    it("文档树变化只让页面与日历失效", () => {
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "createdailynote",
            data: { box: "daily", path: "/2026/09/28.sy" },
        })).toEqual({
            tabs: ["pages"],
            dailyNotes: true,
        });
        expect(sourceInvalidationForEvent("ws-main", { cmd: "refreshAttributeView" })).toEqual({
            tabs: ["databases"],
        });
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "rename",
            data: { id: "doc-id", title: "新标题" },
        })).toEqual({
            tabs: ["bookmarks", "pages"],
            pageChange: { kind: "rename", id: "doc-id", title: "新标题" },
        });
        expect(sourceInvalidationForEvent("ws-main", { cmd: "savedoc" })).toEqual({
            tabs: ["pages"],
        });
    });

    it("文档删除和笔记本挂载会刷新所有可能受影响的来源", () => {
        expect(sourceInvalidationForEvent("ws-main", { cmd: "removeDoc" })).toEqual({
            tabs: ["bookmarks", "tags", "databases", "pages"],
        });
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "removeDoc",
            data: { ids: ["doc-id"] },
        })).toEqual({
            tabs: ["bookmarks", "tags", "databases", "pages"],
            pageChange: { kind: "remove", ids: ["doc-id"] },
        });
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "moveDoc",
            data: {
                fromNotebook: "work",
                fromPath: "/old.sy",
                toNotebook: "work",
                newPath: "/new.sy",
            },
        })).toEqual({
            tabs: ["pages"],
            pageChange: {
                kind: "move",
                fromNotebook: "work",
                fromPath: "/old.sy",
                toNotebook: "work",
                newPath: "/new.sy",
            },
        });
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "moveDocs",
            data: { moves: [] },
        })).toEqual({ tabs: ["pages"] });
        expect(sourceInvalidationForEvent("ws-main", { cmd: "mount" })).toEqual({
            tabs: ["bookmarks", "tags", "databases", "pages"],
            dailyNotes: true,
        });
    });

    it("忽略与导航数据无关或未知的消息", () => {
        expect(sourceInvalidationForEvent("ws-main", { cmd: "readonly" })).toBeUndefined();
        expect(sourceInvalidationForEvent("ws-main", { cmd: "unknown" })).toBeUndefined();
        expect(sourceInvalidationForEvent("ws-main", {
            cmd: "transactions",
            data: [{ doOperations: [{ action: "update", data: "普通段落" }] }],
        })).toBeUndefined();
        expect(sourceInvalidationForEvent("ws-main", {})).toBeUndefined();
    });
});
