import { describe, expect, it, vi } from "vitest";

import { createBookmarkSource, type BookmarkGroup } from "./bookmarks";
import { createTagSource, type TagNode } from "./tags";

const groups: BookmarkGroup[] = [
    {
        name: "参考",
        blocks: [
            {
                id: "20260925100000-aaaaaaa",
                rootID: "20260925090000-rootaaa",
                content: "API 索引",
                created: "20260925100000",
                updated: "20260925103000",
                type: "p",
            },
        ],
    },
    {
        name: "常用",
        blocks: [
            {
                id: "20260923100000-ccccccc",
                rootID: "20260923090000-rootccc",
                content: "产品路线图",
                created: "20260923100000",
                updated: "20260923110000",
                type: "p",
            },
        ],
    },
];

const tags: TagNode[] = [{ name: "项目", label: "项目", count: 2, children: [] }];

describe("条目来源契约：书签", () => {
    it("声明可用排序，并支持查询、清空与打开", async () => {
        const open = vi.fn();
        const source = createBookmarkSource({ load: vi.fn().mockResolvedValue(groups), open });
        const sort = { field: "name", direction: "asc" } as const;

        expect(source.sortFields).toEqual(["name", "created", "updated"]);
        await expect(source.query({ query: "路线", sort })).resolves.toMatchObject([
            { label: "常用", entries: [{ label: "产品路线图" }] },
        ]);
        const all = await source.query({ query: "", sort });
        expect(all).toHaveLength(2);

        await source.open(all[0].entries[0].key);
        expect(open).toHaveBeenCalledWith("20260925100000-aaaaaaa");
    });

    it("失效后重新加载，并允许失败后重试", async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error("暂时不可用"))
            .mockResolvedValueOnce(groups)
            .mockResolvedValueOnce(groups.slice(0, 1));
        const source = createBookmarkSource({ load, open: vi.fn() });
        const input = { query: "", sort: { field: "name", direction: "asc" } } as const;

        await expect(source.query(input)).rejects.toThrow("暂时不可用");
        await expect(source.query(input)).resolves.toHaveLength(2);
        source.invalidate();
        await expect(source.query(input)).resolves.toHaveLength(1);
        expect(load).toHaveBeenCalledTimes(3);
    });
});

describe("条目来源契约：标签", () => {
    it("声明可用排序，并支持查询、清空与打开", async () => {
        const open = vi.fn();
        const source = createTagSource({ load: vi.fn().mockResolvedValue(tags), open });
        const sort = { field: "name", direction: "asc" } as const;

        expect(source.sortFields).toEqual(["name", "count"]);
        await expect(source.query({ query: "项目", sort })).resolves.toMatchObject([
            { entries: [{ label: "项目" }] },
        ]);
        expect(await source.query({ query: "", sort })).toHaveLength(1);

        await source.open("项目");
        expect(open).toHaveBeenCalledWith("项目");
    });

    it("失效后重新加载，并允许失败后重试", async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error("暂时不可用"))
            .mockResolvedValueOnce(tags)
            .mockResolvedValueOnce([]);
        const source = createTagSource({ load, open: vi.fn() });
        const input = { query: "", sort: { field: "name", direction: "asc" } } as const;

        await expect(source.query(input)).rejects.toThrow("暂时不可用");
        await expect(source.query(input)).resolves.toHaveLength(1);
        source.invalidate();
        await expect(source.query(input)).resolves.toEqual([]);
    });
});

describe("条目来源隔离", () => {
    it("一个来源失败时，另一个来源仍可查询", async () => {
        const bookmarks = createBookmarkSource({
            load: vi.fn().mockRejectedValue(new Error("书签不可用")),
            open: vi.fn(),
        });
        const tagSource = createTagSource({
            load: vi.fn().mockResolvedValue(tags),
            open: vi.fn(),
        });
        const input = { query: "", sort: { field: "name", direction: "asc" } } as const;

        await expect(bookmarks.query(input)).rejects.toThrow("书签不可用");
        await expect(tagSource.query(input)).resolves.toHaveLength(1);
    });
});
