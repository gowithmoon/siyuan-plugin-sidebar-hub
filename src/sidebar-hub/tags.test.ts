import { describe, expect, it, vi } from "vitest";

import { createTagSource, TAG_SORT_FIELDS, tagSearchKeyword, type TagNode } from "./tags";

const tags: TagNode[] = [
    {
        name: "项目",
        label: "项目",
        count: 0,
        children: [
            {
                name: "开发",
                label: "项目/开发",
                count: 7,
                children: [],
            },
        ],
    },
    {
        name: "阅读",
        label: "阅读",
        count: 3,
        children: [],
    },
];

const input = { query: "", sort: { field: "name", direction: "asc" } } as const;

describe("标签导航", () => {
    it("生成思源原生标签搜索关键词", () => {
        expect(tagSearchKeyword("项目/开发")).toBe("#项目/开发#");
    });

    it("把层级标签平铺成完整路径，并声明名称和引用数排序", async () => {
        const source = createTagSource({ load: vi.fn().mockResolvedValue(tags), open: vi.fn() });

        expect(source.sortFields).toEqual(TAG_SORT_FIELDS);
        await expect(source.query(input)).resolves.toMatchObject({
            status: "ready",
            sections: [
            {
                key: "tags",
                entries: [
                    { key: "阅读", label: "阅读", icon: "iconTag" },
                    { key: "项目", label: "项目", icon: "iconTag" },
                    { key: "项目/开发", label: "项目/开发", icon: "iconTag" },
                ],
            },
            ],
        });
    });

    it("搜索名称并支持引用数量升降序，清空后恢复完整列表", async () => {
        const source = createTagSource({ load: vi.fn().mockResolvedValue(tags), open: vi.fn() });

        expect((await source.query({ ...input, query: "开发" })).sections).toMatchObject([
            { entries: [{ key: "项目/开发", label: "项目/开发" }] },
        ]);
        expect((await source.query({ query: "", sort: { field: "count", direction: "desc" } })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["项目/开发", "阅读", "项目"]);
        expect((await source.query({ query: "", sort: { field: "count", direction: "asc" } })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["项目", "阅读", "项目/开发"]);
        expect((await source.query({ ...input, query: "不存在" })).sections).toEqual([]);
        expect((await source.query(input)).sections).toHaveLength(1);
    });

    it("打开标签时把原生搜索关键词交给适配器", async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const source = createTagSource({ load: vi.fn(), open });

        await source.open("项目/开发");

        expect(open).toHaveBeenCalledWith("项目/开发");
    });
});
