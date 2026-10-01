import { describe, expect, it, vi } from "vitest";

import { preloadVisibleSources } from "./source-preload";
import type { SidebarTabId } from "./preferences";

function panel(preload: () => Promise<void>) {
    return { preload };
}

describe("条目来源预加载协调", () => {
    it("按固定顺序预加载可见标签页并跳过隐藏标签页", async () => {
        const calls: SidebarTabId[] = [];
        const panels = {
            bookmarks: panel(async () => { calls.push("bookmarks"); }),
            tags: panel(async () => { calls.push("tags"); }),
            databases: panel(async () => { calls.push("databases"); }),
            pages: panel(async () => { calls.push("pages"); }),
        };

        await preloadVisibleSources(panels, ["pages", "bookmarks", "tags"]);

        expect(calls).toEqual(["bookmarks", "tags", "pages"]);
        expect(calls).not.toContain("databases");
    });

    it("限制两个并发预加载，并继续处理失败的来源", async () => {
        let active = 0;
        let maximum = 0;
        const calls: SidebarTabId[] = [];
        const pending: Array<() => void> = [];
        const createTask = (tabId: SidebarTabId, fails = false) => panel(async () => {
            calls.push(tabId);
            active += 1;
            maximum = Math.max(maximum, active);
            await new Promise<void>((resolve) => pending.push(resolve));
            active -= 1;
            if (fails) {
                throw new Error("preload failed");
            }
        });
        const panels = {
            bookmarks: createTask("bookmarks"),
            tags: createTask("tags", true),
            databases: createTask("databases"),
            pages: createTask("pages"),
        };

        const preload = preloadVisibleSources(panels, ["bookmarks", "tags", "databases", "pages"]);
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        expect(maximum).toBe(2);

        pending.shift()!();
        await vi.waitFor(() => expect(calls).toHaveLength(3));
        pending.shift()!();
        await vi.waitFor(() => expect(calls).toHaveLength(4));
        pending.shift()!();
        await vi.waitFor(() => expect(pending).toHaveLength(1));
        pending.shift()!();
        await preload;

        expect(calls).toEqual(["bookmarks", "tags", "databases", "pages"]);
        expect(maximum).toBe(2);
    });
});
