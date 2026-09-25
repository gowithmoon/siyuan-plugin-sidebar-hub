import { describe, expect, it, vi } from "vitest";

import {
    BOOKMARK_SORT_OPTIONS,
    createBookmarkNavigator,
    type BookmarkGroup,
} from "./bookmarks";

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
            {
                id: "20260924100000-bbbbbbb",
                rootID: "20260924100000-bbbbbbb",
                content: "插件开发记录",
                created: "20260924100000",
                updated: "20260926120000",
                type: "d",
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

describe("书签导航", () => {
    it("只声明书签可靠支持的六种排序", () => {
        expect(BOOKMARK_SORT_OPTIONS.map((option) => option.value)).toEqual([
            "name:asc",
            "name:desc",
            "created:asc",
            "created:desc",
            "updated:asc",
            "updated:desc",
        ]);
    });

    it("加载后保留分组和组内文档、块书签", async () => {
        const navigator = createBookmarkNavigator({
            load: vi.fn().mockResolvedValue(groups),
            open: vi.fn(),
        });

        const result = await navigator.query({ query: "", sort: { field: "name", direction: "asc" } });

        expect(result.map((group) => ({
            name: group.name,
            entries: group.entries.map((entry) => ({ id: entry.id, rootID: entry.rootID, label: entry.label })),
        }))).toEqual([
            {
                name: "参考",
                entries: [
                    {
                        id: "20260925100000-aaaaaaa",
                        rootID: "20260925090000-rootaaa",
                        label: "API 索引",
                    },
                    {
                        id: "20260924100000-bbbbbbb",
                        rootID: "20260924100000-bbbbbbb",
                        label: "插件开发记录",
                    },
                ],
            },
            {
                name: "常用",
                entries: [{
                    id: "20260923100000-ccccccc",
                    rootID: "20260923090000-rootccc",
                    label: "产品路线图",
                }],
            },
        ]);
    });

    it("搜索同时匹配分组名称和条目内容，清空后恢复完整列表", async () => {
        const navigator = createBookmarkNavigator({
            load: vi.fn().mockResolvedValue(groups),
            open: vi.fn(),
        });

        expect((await navigator.query({ query: "参考", sort: { field: "name", direction: "asc" } }))[0].entries).toHaveLength(2);
        expect((await navigator.query({ query: "路线", sort: { field: "name", direction: "asc" } })).map((group) => ({
            name: group.name,
            labels: group.entries.map((entry) => entry.label),
        }))).toEqual([{ name: "常用", labels: ["产品路线图"] }]);
        expect(await navigator.query({ query: "不存在", sort: { field: "name", direction: "asc" } })).toEqual([]);
        expect(await navigator.query({ query: "", sort: { field: "name", direction: "asc" } })).toHaveLength(2);
    });

    it("支持名称、创建时间和修改时间升降序", async () => {
        const navigator = createBookmarkNavigator({
            load: vi.fn().mockResolvedValue(groups),
            open: vi.fn(),
        });

        const labels = async (field: "name" | "created" | "updated", direction: "asc" | "desc") =>
            (await navigator.query({ query: "参考", sort: { field, direction } }))[0].entries.map((entry) => entry.label);

        await expect(labels("name", "desc")).resolves.toEqual(["插件开发记录", "API 索引"]);
        await expect(labels("created", "asc")).resolves.toEqual(["插件开发记录", "API 索引"]);
        await expect(labels("updated", "desc")).resolves.toEqual(["插件开发记录", "API 索引"]);
    });

    it("打开书签时把目标块交给思源打开能力", async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const navigator = createBookmarkNavigator({ load: vi.fn(), open });

        await navigator.open({
            id: "20260925100000-aaaaaaa",
            rootID: "20260925090000-rootaaa",
            label: "API 索引",
            created: "20260925100000",
            updated: "20260925103000",
        });

        expect(open).toHaveBeenCalledWith("20260925100000-aaaaaaa");
    });

    it("刷新后重新加载，并允许失败后重试", async () => {
        const load = vi.fn()
            .mockRejectedValueOnce(new Error("暂时不可用"))
            .mockResolvedValueOnce(groups)
            .mockResolvedValueOnce(groups.slice(0, 1));
        const navigator = createBookmarkNavigator({ load, open: vi.fn() });
        const input = { query: "", sort: { field: "name", direction: "asc" } } as const;

        await expect(navigator.query(input)).rejects.toThrow("暂时不可用");
        await expect(navigator.query(input)).resolves.toHaveLength(2);
        navigator.invalidate();
        await expect(navigator.query(input)).resolves.toHaveLength(1);
        expect(load).toHaveBeenCalledTimes(3);
    });

    it("同一轮并发查询共享一次加载", async () => {
        let resolveLoad: (value: BookmarkGroup[]) => void;
        const load = vi.fn(() => new Promise<BookmarkGroup[]>((resolve) => {
            resolveLoad = resolve;
        }));
        const navigator = createBookmarkNavigator({ load, open: vi.fn() });

        const first = navigator.query({ query: "路线", sort: { field: "name", direction: "asc" } });
        const second = navigator.query({ query: "API", sort: { field: "updated", direction: "desc" } });
        resolveLoad!(groups);

        await expect(first).resolves.toHaveLength(1);
        await expect(second).resolves.toHaveLength(1);
        expect(load).toHaveBeenCalledTimes(1);
    });
});
