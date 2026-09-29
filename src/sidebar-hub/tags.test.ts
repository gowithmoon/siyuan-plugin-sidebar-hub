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
    it("显示真实标签的零值，虚拟父标签不显示计数", async () => {
        const source = createTagSource({ load: vi.fn().mockResolvedValue([
            { name: "空标签", label: "空标签", count: 0, children: [] },
            { name: "父", label: "父", count: 0, children: [{ name: "子", label: "父/子", count: 2, children: [] }] },
        ]), open: vi.fn() });
        const entries = (await source.query(input)).sections[0].entries;
        expect(entries.find((entry) => entry.label === "空标签")).toMatchObject({ count: 0, countable: true });
        const parent = entries.find((entry) => entry.label === "父");
        expect(parent).toMatchObject({ countable: false });
        expect(parent?.children?.[0]).toMatchObject({ label: "子", count: 2, countable: true });
        expect((await source.query(input)).totalCount).toBe(1);
    });

    it("生成思源原生标签搜索关键词", () => {
        expect(tagSearchKeyword("项目/开发")).toBe("#项目/开发#");
    });

    it("保留标签树层级，并让虚拟父标签只作为结构节点", async () => {
        const source = createTagSource({ load: vi.fn().mockResolvedValue(tags), open: vi.fn() });

        expect(source.sortFields).toEqual(TAG_SORT_FIELDS);
        await expect(source.query(input)).resolves.toMatchObject({
            status: "ready",
            sections: [
            {
                key: "tags",
                entries: [
                    { key: "阅读", label: "阅读", icon: "iconTag" },
                    {
                        key: "项目",
                        label: "项目",
                        icon: "iconTag",
                        openable: false,
                        children: [{ key: "项目/开发", label: "开发", icon: "iconTag" }],
                    },
                ],
            },
            ],
        });
    });

    it("搜索叶子保留祖先，命中父节点显示完整子树，并支持同级引用数排序", async () => {
        const source = createTagSource({ load: vi.fn().mockResolvedValue(tags), open: vi.fn() });

        expect((await source.query({ ...input, query: "开发" })).sections).toMatchObject([
            { entries: [{ key: "项目", children: [{ key: "项目/开发", label: "开发" }] }] },
        ]);
        expect((await source.query({ ...input, query: "项目" })).sections).toMatchObject([
            { entries: [{ key: "项目", children: [{ key: "项目/开发" }] }] },
        ]);
        expect((await source.query({ query: "", sort: { field: "count", direction: "desc" } })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["阅读", "项目"]);
        expect((await source.query({ query: "", sort: { field: "count", direction: "asc" } })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["项目", "阅读"]);
        expect((await source.query({ ...input, query: "不存在" })).sections).toEqual([]);
        expect((await source.query(input)).sections).toHaveLength(1);
    });

    it("相同局部名称使用完整路径作为身份，并让虚拟父标签不可打开", async () => {
        const source = createTagSource({
            load: vi.fn().mockResolvedValue([
                { name: "A", label: "A", count: 1, children: [{ name: "共同", label: "A/共同", count: 2, children: [] }] },
                { name: "B", label: "B", count: 1, children: [{ name: "共同", label: "B/共同", count: 3, children: [] }] },
            ]),
            open: vi.fn(),
        });

        const entries = (await source.query(input)).sections[0].entries;
        expect(entries.map((entry) => entry.key)).toEqual(["A", "B"]);
        expect(entries[0].children?.[0].key).toBe("A/共同");
        expect(entries[1].children?.[0].key).toBe("B/共同");
        expect(entries[0].openable).toBe(true);
    });

    it("打开标签时把原生搜索关键词交给适配器", async () => {
        const open = vi.fn().mockResolvedValue(undefined);
        const source = createTagSource({ load: vi.fn(), open });

        await source.open("项目/开发");

        expect(open).toHaveBeenCalledWith("项目/开发");
    });
});
