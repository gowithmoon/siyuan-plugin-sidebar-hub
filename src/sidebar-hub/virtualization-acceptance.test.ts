import { describe, expect, it, vi } from "vitest";

import { createDatabaseSource, type DatabaseSearchResult } from "./databases";
import {
    createFixedVirtualList,
    VIRTUAL_LIST_OVERSCAN,
    VIRTUAL_LIST_ROW_HEIGHT,
} from "./fixed-virtual-list";
import { createPageSource, type PageDocument } from "./pages";
import { flattenTagTree } from "./tag-tree";
import type { EntrySourceEntry } from "./entry-source";

const VIEWPORT_ROWS = 12;
const VIEWPORT_HEIGHT = VIEWPORT_ROWS * VIRTUAL_LIST_ROW_HEIGHT;
const MOUNTED_ROW_LIMIT = Math.ceil(VIEWPORT_HEIGHT / VIRTUAL_LIST_ROW_HEIGHT)
    + VIRTUAL_LIST_OVERSCAN * 2;

describe("中等规模虚拟化验收", () => {
    it("5,000 页面只挂载窗口行并只请求窗口附近的计数", async () => {
        const documents = Array.from({ length: 5_000 }, (_, index): PageDocument => ({
            id: `page-${index}`,
            path: `/page-${index}.sy`,
            name: `页面 ${index}`,
            subFileCount: 0,
            created: index,
            updated: index,
        }));
        const getDocRefCounts = vi.fn(async (ids: string[]) =>
            Object.fromEntries(ids.map((id) => [id, 1])));
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (_notebookId: string, path: string) => path === "/" ? documents : []),
            getBlockAttrs: vi.fn().mockResolvedValue({}),
            getDocRefCounts,
            open: vi.fn(),
        });

        const snapshot = await source.query({ query: "", sort: { field: "name", direction: "asc" } });
        const keys = snapshot.sections[0].entries.map((entry) => entry.key);
        const mountedKeys = mountedWindow(keys, 2_500);
        source.setCountTargets(mountedKeys);

        expect(keys).toHaveLength(5_000);
        expect(mountedKeys.length).toBeLessThanOrEqual(MOUNTED_ROW_LIMIT);
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledOnce());
        expect(getDocRefCounts.mock.calls[0][0]).toEqual(mountedKeys);
    });

    it("500 数据库只挂载窗口行并只请求窗口附近的计数", async () => {
        const databases = Array.from({ length: 500 }, (_, index): DatabaseSearchResult => ({
            avID: `av-${index}`,
            avName: `数据库 ${index}`,
            blockID: `database-${index}`,
            hPath: "",
            viewID: "",
            viewName: "",
            viewLayout: "",
        }));
        const count = vi.fn().mockResolvedValue(1);
        const source = createDatabaseSource({
            load: vi.fn().mockResolvedValue(databases),
            count,
            open: vi.fn(),
        });

        const snapshot = await source.query({ query: "", sort: { field: "name", direction: "asc" } });
        const keys = snapshot.sections[0].entries.map((entry) => entry.key);
        const mountedKeys = mountedWindow(keys, 250);
        source.setCountTargets(mountedKeys);

        expect(keys).toHaveLength(500);
        expect(mountedKeys.length).toBeLessThanOrEqual(MOUNTED_ROW_LIMIT);
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(mountedKeys.length));
        expect(count.mock.calls.map(([avID]) => avID)).toEqual(
            mountedKeys.map((key) => key.replace("database-", "av-")),
        );
    });

    it("1,000 标签节点先拍平完整逻辑树，再限制窗口挂载行", () => {
        const tree = Array.from({ length: 100 }, (_, parentIndex): EntrySourceEntry => ({
            key: `tag-${parentIndex}`,
            label: `标签 ${parentIndex}`,
            icon: "iconTag",
            children: Array.from({ length: 9 }, (_, childIndex) => ({
                key: `tag-${parentIndex}/child-${childIndex}`,
                label: `子标签 ${childIndex}`,
                icon: "iconTag",
            })),
        }));

        const rows = flattenTagTree(tree, new Set(), false);
        const mountedKeys = mountedWindow(rows.map((row) => row.key), 500);

        expect(rows).toHaveLength(1_000);
        expect(mountedKeys.length).toBeLessThanOrEqual(MOUNTED_ROW_LIMIT);
        expect(mountedKeys).toEqual(
            rows.slice(492, 520).map((row) => row.key),
        );
    });
});

function mountedWindow(keys: readonly string[], firstVisibleIndex: number) {
    const list = createFixedVirtualList();
    list.setItems(keys);
    list.setViewportHeight(VIEWPORT_HEIGHT);
    const window = list.setScrollTop(firstVisibleIndex * VIRTUAL_LIST_ROW_HEIGHT);
    return keys.slice(window.startIndex, window.endIndex);
}
