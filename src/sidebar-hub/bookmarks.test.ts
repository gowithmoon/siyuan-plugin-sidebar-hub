import { describe, expect, it, vi } from "vitest";

import {
    BOOKMARK_SORT_FIELDS,
    createBookmarkSource,
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

const input = { query: "", sort: { field: "name", direction: "asc" } } as const;

describe("书签导航", () => {
    it("只声明书签可靠支持的三个排序字段", () => {
        const source = createBookmarkSource({ load: vi.fn(), open: vi.fn() });
        expect(source.sortFields).toEqual(BOOKMARK_SORT_FIELDS);
    });

    it("加载后保留分组和组内文档、块书签", async () => {
        const source = createBookmarkSource({ load: vi.fn().mockResolvedValue(groups), open: vi.fn() });

        await expect(source.query(input)).resolves.toMatchObject({ status: "ready", sections: [
            {
                key: "参考",
                label: "参考",
                entries: [
                    { key: "20260925100000-aaaaaaa", label: "API 索引", icon: "iconBookmark" },
                    { key: "20260924100000-bbbbbbb", label: "插件开发记录", icon: "iconFile" },
                ],
            },
            {
                key: "常用",
                label: "常用",
                entries: [{ key: "20260923100000-ccccccc", label: "产品路线图", icon: "iconBookmark" }],
            },
        ] });
    });

    it("搜索同时匹配分组名称和条目内容，清空后恢复完整列表", async () => {
        const source = createBookmarkSource({ load: vi.fn().mockResolvedValue(groups), open: vi.fn() });

        expect((await source.query({ ...input, query: "参考" })).sections[0].entries).toHaveLength(2);
        expect((await source.query({ ...input, query: "路线" })).sections).toMatchObject([
            { key: "常用", entries: [{ label: "产品路线图" }] },
        ]);
        expect((await source.query({ ...input, query: "不存在" })).sections).toEqual([]);
        expect((await source.query(input)).sections).toHaveLength(2);
    });

    it("支持名称、创建时间和修改时间升降序", async () => {
        const source = createBookmarkSource({ load: vi.fn().mockResolvedValue(groups), open: vi.fn() });
        const labels = async (field: "name" | "created" | "updated", direction: "asc" | "desc") =>
            (await source.query({ query: "参考", sort: { field, direction } })).sections[0].entries.map((entry) => entry.label);

        await expect(labels("name", "desc")).resolves.toEqual(["插件开发记录", "API 索引"]);
        await expect(labels("created", "asc")).resolves.toEqual(["插件开发记录", "API 索引"]);
        await expect(labels("updated", "desc")).resolves.toEqual(["插件开发记录", "API 索引"]);
    });

    it("打开书签时把条目 key 交给思源打开能力", async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const source = createBookmarkSource({ load: vi.fn(), open });

        await source.open("20260925100000-aaaaaaa");

        expect(open).toHaveBeenCalledWith("20260925100000-aaaaaaa");
    });

    it("同一轮并发查询共享一次加载", async () => {
        let resolveLoad: (value: BookmarkGroup[]) => void;
        const load = vi.fn(() => new Promise<BookmarkGroup[]>((resolve) => {
            resolveLoad = resolve;
        }));
        const source = createBookmarkSource({ load, open: vi.fn() });

        const first = source.query({ ...input, query: "路线" });
        const second = source.query({ ...input, query: "API" });
        resolveLoad!(groups);

        await Promise.all([first, second]);
        expect(source.snapshot).toMatchObject({ status: "ready", sections: [{ entries: [{ label: "API 索引" }] }] });
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("合并重复书签值、忽略空白值并跳过异常记录", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const source = createBookmarkSource({
            load: vi.fn().mockResolvedValue([
                { name: "参考", blocks: [groups[0].blocks[0]] },
                { name: "参考", blocks: [groups[0].blocks[1]] },
                { name: "  ", blocks: [groups[1].blocks[0]] },
                null,
                { name: "异常", blocks: [null, { id: "", content: "坏数据" }] },
            ]),
            open: vi.fn(),
        });

        await expect(source.query(input)).resolves.toMatchObject({
            status: "ready",
            sections: [{ key: "参考", entries: [{ label: "API 索引" }, { label: "插件开发记录" }] }],
        });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
