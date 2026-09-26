import { describe, expect, it, vi } from "vitest";

import { createPageSource, type PageDocument, type PageNotebook } from "./pages";

const notebooks: PageNotebook[] = [
    { id: "work", name: "工作", closed: false },
    { id: "archive", name: "归档", closed: true },
    { id: "life", name: "生活", closed: false },
];

const trees: Record<string, PageDocument[]> = {
    "work:/": [
        doc("year", "/year.sy", "2026", 1),
        doc("guide", "/guide.sy", "项目说明"),
    ],
    "work:/year.sy": [doc("month", "/year/month.sy", "2026-09", 1)],
    "work:/year/month.sy": [doc("daily", "/year/month/daily.sy", "2026-09-25")],
    "life:/": [
        doc("reading", "/reading.sy", "阅读方法", 0, 20, 40),
        doc("journal-other", "/journal-other.sy", "日记本中的普通页面", 0, 30, 35),
    ],
};

const sort = { field: "name", direction: "asc" } as const;

describe("普通页面来源", () => {
    it("列表就绪后批量加载文档引用数量，并保留零值", async () => {
        const getDocRefCounts = vi.fn().mockResolvedValue({ reading: 0, "journal-other": 3 });
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            getDocRefCounts,
            open: vi.fn(),
        });
        const updates: number[][] = [];
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.count ?? -1)));
        });

        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledWith(["reading", "journal-other"]));
        expect(updates[updates.length - 1]).toEqual([3, 0]);
    });

    it("切换离开再回来时不会丢失已经完成的批量计数", async () => {
        let resolveCounts: ((value: Record<string, number>) => void) | undefined;
        const getDocRefCounts = vi.fn(() => new Promise<Record<string, number>>((resolve) => {
            resolveCounts = resolve;
        }));
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            getDocRefCounts,
            open: vi.fn(),
        });
        const updates: number[][] = [];
        source.setCountEnabled(true);
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.count ?? -1)));
        });
        source.setCountEnabled(false);
        resolveCounts!({ reading: 4, "journal-other": 0 });
        await Promise.resolve();
        source.setCountEnabled(true);
        expect(updates[updates.length - 1]).toEqual([0, 4]);
    });

    it("递归扫描已打开笔记本，渐进呈现结果和进度，并排除日记及其祖先", async () => {
        const listDocuments = vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []);
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks),
            listDocuments,
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [
                id,
                id === "daily" ? { "custom-dailynote-20260925": "20260925" } : {},
            ]))),
            open: vi.fn(),
        });
        const updates: string[][] = [];

        const snapshot = await source.query({ query: "", sort }, (progress) => {
            updates.push(progress.sections.flatMap((section) => section.entries.map((entry) => entry.label)));
        });

        expect(snapshot).toMatchObject({
            status: "ready",
            progress: { current: 6 },
            sections: [{ entries: [
                { key: "journal-other", label: "日记本中的普通页面" },
                { key: "reading", label: "阅读方法" },
                { key: "guide", label: "项目说明" },
            ] }],
        });
        expect(updates.some((labels) => labels.length > 0 && labels.length < 3)).toBe(true);
        expect(listDocuments).not.toHaveBeenCalledWith("archive", expect.anything());
    });

    it("支持搜索及按名称、创建时间、修改时间升降序", async () => {
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });

        expect((await source.query({ query: "普通", sort })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["日记本中的普通页面"]);
        expect((await source.query({ query: "", sort: { field: "created", direction: "desc" } })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["日记本中的普通页面", "阅读方法"]);
        expect((await source.query({ query: "", sort: { field: "updated", direction: "desc" } })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["阅读方法", "日记本中的普通页面"]);
    });

    it("点击条目时打开文档，并在刷新后重新扫描", async () => {
        const open = vi.fn();
        const listDocuments = vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []);
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments,
            getBlockAttrs: vi.fn(async () => ({})),
            open,
        });

        await source.query({ query: "", sort });
        await source.open("reading");
        source.invalidate();
        await source.query({ query: "", sort });

        expect(open).toHaveBeenCalledWith("reading");
        expect(listDocuments).toHaveBeenCalledTimes(2);
    });
});

function doc(
    id: string,
    path: string,
    name: string,
    subFileCount = 0,
    created = 10,
    updated = 20,
): PageDocument {
    return { id, path, name, subFileCount, created, updated };
}
