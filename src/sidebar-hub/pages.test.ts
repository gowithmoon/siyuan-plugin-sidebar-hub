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
    it("只为显式目标页面加载引用数量，并保留零值", async () => {
        const getDocRefCounts = vi.fn().mockResolvedValue({ reading: 0, "journal-other": 3 });
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            getDocRefCounts,
            open: vi.fn(),
        });
        const updates: number[][] = [];
        source.setCountTargets(["reading"]);
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.count ?? -1)));
        });

        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledWith(["reading"]));
        expect(updates[updates.length - 1]).toEqual([-1, 0]);
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
        source.setCountTargets(["reading", "journal-other"]);
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.count ?? -1)));
        });
        source.setCountTargets([]);
        resolveCounts!({ reading: 4, "journal-other": 0 });
        await Promise.resolve();
        source.setCountTargets(["reading", "journal-other"]);
        expect(updates[updates.length - 1]).toEqual([0, 4]);
    });

    it("每批最多加载 64 个页面引用数量，并顺序处理多个批次", async () => {
        const pageIds = Array.from({ length: 130 }, (_, index) => `page-${index}`);
        const resolvers: Array<(counts: Record<string, number>) => void> = [];
        const getDocRefCounts = vi.fn((_ids: string[]) => new Promise<Record<string, number>>((resolve) => {
            resolvers.push(resolve);
        }));
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (_: string, path: string) => path === "/"
                ? pageIds.map((id) => doc(id, `/${id}.sy`, id))
                : []),
            getBlockAttrs: vi.fn(async () => ({})),
            getDocRefCounts,
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        source.setCountTargets(pageIds);

        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledOnce());
        expect(getDocRefCounts.mock.calls[0][0]).toEqual(pageIds.slice(0, 64));
        resolvers[0](Object.fromEntries(pageIds.slice(0, 64).map((id) => [id, 1])));
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledTimes(2));
        expect(getDocRefCounts.mock.calls[1][0]).toEqual(pageIds.slice(64, 128));
        resolvers[1](Object.fromEntries(pageIds.slice(64, 128).map((id) => [id, 1])));
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledTimes(3));
        expect(getDocRefCounts.mock.calls[2][0]).toEqual(pageIds.slice(128));
        resolvers[2](Object.fromEntries(pageIds.slice(128).map((id) => [id, 1])));
    });

    it("目标替换后不再加载已离屏的排队页面", async () => {
        const pageIds = Array.from({ length: 70 }, (_, index) => `page-${index}`);
        let resolveFirst!: (counts: Record<string, number>) => void;
        const getDocRefCounts = vi.fn((ids: string[]) => ids[0] === "page-0"
            ? new Promise<Record<string, number>>((resolve) => {
                resolveFirst = resolve;
            })
            : Promise.resolve({ [ids[0]]: 2 }));
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (_: string, path: string) => path === "/"
                ? pageIds.map((id) => doc(id, `/${id}.sy`, id))
                : []),
            getBlockAttrs: vi.fn(async () => ({})),
            getDocRefCounts,
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        source.setCountTargets(pageIds);
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledOnce());
        source.setCountTargets(["page-69"]);
        resolveFirst({});

        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledTimes(2));
        expect(getDocRefCounts.mock.calls[1][0]).toEqual(["page-69"]);
    });

    it("失败计数同一 generation 不重试，失效后才重试", async () => {
        const getDocRefCounts = vi.fn()
            .mockRejectedValueOnce(new Error("暂时失败"))
            .mockResolvedValueOnce({ reading: 6 });
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            getDocRefCounts,
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        source.setCountTargets(["reading"]);
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledOnce());
        source.setCountTargets([]);
        source.setCountTargets(["reading"]);
        await Promise.resolve();
        expect(getDocRefCounts).toHaveBeenCalledOnce();

        source.invalidate();
        await source.query({ query: "", sort });
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledTimes(2));
    });

    it("连续保存只在静默期后刷新一次当前页面引用数量", async () => {
        vi.useFakeTimers();
        try {
            const listDocuments = vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []);
            const getDocRefCounts = vi.fn().mockResolvedValue({ reading: 8 });
            const source = createPageSource({
                listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
                listDocuments,
                getBlockAttrs: vi.fn(async () => ({})),
                getDocRefCounts,
                open: vi.fn(),
            });

            await source.query({ query: "", sort });
            source.setCountTargets(["reading"]);
            await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledOnce());
            getDocRefCounts.mockClear();
            const scans = listDocuments.mock.calls.length;

            expect(source.applyChange({ kind: "saved", id: "reading", updated: 50 })).toBe(true);
            vi.advanceTimersByTime(200);
            expect(source.applyChange({ kind: "saved", id: "reading", updated: 51 })).toBe(true);
            vi.advanceTimersByTime(200);
            expect(source.applyChange({ kind: "saved", id: "reading", updated: 52 })).toBe(true);
            vi.advanceTimersByTime(100);
            expect(source.applyChange({ kind: "saved", id: "reading", updated: 53 })).toBe(true);
            source.setCountTargets(["journal-other"]);
            await vi.advanceTimersByTimeAsync(499);
            expect(getDocRefCounts).not.toHaveBeenCalled();
            expect(listDocuments).toHaveBeenCalledTimes(scans);

            await vi.advanceTimersByTimeAsync(1);
            await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledOnce());
            expect(getDocRefCounts).toHaveBeenCalledWith(["journal-other"]);
            expect(listDocuments).toHaveBeenCalledTimes(scans);
        } finally {
            vi.useRealTimers();
        }
    });

    it("未缓存页面的保存事件不触发全量扫描", async () => {
        const listDocuments = vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []);
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments,
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });

        expect(source.applyChange({ kind: "saved", id: "reading", updated: 52 })).toBe(true);
        await source.query({ query: "", sort });
        expect(listDocuments).toHaveBeenCalledTimes(1);
    });

    it("按修改时间排序时保存只在顺序变化后发布快照", async () => {
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });
        const updates: string[][] = [];
        await source.query({ query: "", sort: { field: "updated", direction: "asc" } }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.key)));
        });
        updates.length = 0;

        expect(source.applyChange({ kind: "saved", id: "reading", updated: 41 })).toBe(true);
        expect(updates).toEqual([]);
        expect(source.applyChange({ kind: "saved", id: "reading", updated: 10 })).toBe(true);
        expect(updates).toEqual([["reading", "journal-other"]]);
    });

    it("按名称排序时保存不发布条目顺序未变化的快照", async () => {
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });
        const updates: unknown[] = [];
        await source.query({ query: "", sort }, (next) => updates.push(next));
        updates.length = 0;

        expect(source.applyChange({ kind: "saved", id: "reading", updated: 99 })).toBe(true);
        expect(updates).toEqual([]);
    });

    it("旧 generation 的在途计数不能写回刷新后的快照", async () => {
        const resolvers: Array<(counts: Record<string, number>) => void> = [];
        const getDocRefCounts = vi.fn(() => new Promise<Record<string, number>>((resolve) => {
            resolvers.push(resolve);
        }));
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
        source.setCountTargets(["reading"]);
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledOnce());

        source.invalidate();
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.count ?? -1)));
        });
        expect(getDocRefCounts).toHaveBeenCalledOnce();
        resolvers[0]({ reading: 1 });
        await vi.waitFor(() => expect(getDocRefCounts).toHaveBeenCalledTimes(2));
        expect(updates[updates.length - 1]).toEqual([-1, -1]);

        resolvers[1]({ reading: 9 });
        await vi.waitFor(() => expect(updates[updates.length - 1]).toEqual([-1, 9]));
    });

    it("递归扫描已打开笔记本，完成后一次呈现结果，并排除日记及其祖先", async () => {
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
        const updates: Array<{ status: string; labels: string[] }> = [];

        const snapshot = await source.query({ query: "", sort }, (progress) => {
            updates.push({
                status: progress.status,
                labels: progress.sections.flatMap((section) => section.entries.map((entry) => entry.label)),
            });
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
        expect(updates.filter((update) => update.status === "loading").every((update) => update.labels.length === 0))
            .toBe(true);
        expect(updates.filter((update) => update.labels.length > 0)).toHaveLength(1);
        expect(listDocuments).not.toHaveBeenCalledWith("archive", expect.anything());
    });

    it("扫描进度最多每 100ms 发布一次", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
        const documents: Record<string, PageDocument[]> = {
            "/": [
                doc("first", "/first.sy", "第一篇", 1),
                doc("second", "/second.sy", "第二篇", 1),
                doc("third", "/third.sy", "第三篇", 1),
            ],
            "/first.sy": [doc("first-child", "/first.sy/child.sy", "第一篇子文档")],
            "/second.sy": [doc("second-child", "/second.sy/child.sy", "第二篇子文档")],
            "/third.sy": [doc("third-child", "/third.sy/child.sy", "第三篇子文档")],
        };
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (_: string, path: string) => {
                vi.advanceTimersByTime(40);
                return documents[path] ?? [];
            }),
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });
        const loadingUpdates: Array<{ time: number; current: number }> = [];

        await source.query({ query: "", sort }, (next) => {
            if (next.status === "loading") {
                loadingUpdates.push({ time: Date.now(), current: next.progress?.current ?? -1 });
            }
        });

        expect(loadingUpdates.length).toBeGreaterThan(1);
        expect(loadingUpdates[0]).toEqual({ time: 0, current: 0 });
        expect(loadingUpdates.slice(1).every((update, index) =>
            update.time - loadingUpdates[index].time >= 100)).toBe(true);
        vi.useRealTimers();
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

    it("后台重扫完成前保留旧页面列表，不发布部分结果", async () => {
        let generation = 0;
        let resolveReload!: (documents: PageDocument[]) => void;
        const listDocuments = vi.fn((_: string, path: string) => {
            if (generation === 1 && path === "/") {
                return new Promise<PageDocument[]>((resolve) => {
                    resolveReload = resolve;
                });
            }
            return Promise.resolve([
                generation === 0
                    ? doc("old", "/old.sy", "旧页面")
                    : doc("new", "/new.sy", "新页面"),
            ]);
        });
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments,
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });
        const updates: string[][] = [];
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.label)));
        });

        generation = 1;
        source.invalidate();
        const reload = source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.label)));
        });
        await Promise.resolve();

        expect(updates[updates.length - 1]).toEqual(["旧页面"]);

        resolveReload([doc("new", "/new.sy", "新页面")]);
        await reload;

        expect(updates[updates.length - 1]).toEqual(["新页面"]);
    });

    it("首次扫描失败时不把部分结果当作旧列表", async () => {
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (_: string, path: string) => {
                if (path === "/") {
                    return [doc("first", "/first.sy", "第一篇"), doc("broken", "/broken.sy", "第二篇", 1)];
                }
                throw new Error("扫描失败");
            }),
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });
        const updates: string[][] = [];

        const snapshot = await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.label)));
        });

        expect(updates.every((labels) => labels.length === 0)).toBe(true);
        expect(snapshot).toMatchObject({ status: "error", sections: [] });
    });

    it("空列表刷新时也不发布后台扫描中的部分结果", async () => {
        let generation = 0;
        let resolveChild!: (documents: PageDocument[]) => void;
        const listDocuments = vi.fn((_: string, path: string) => {
            if (generation === 0) {
                return Promise.resolve([]);
            }
            if (path === "/") {
                return Promise.resolve([
                    doc("partial", "/partial.sy", "临时页面"),
                    doc("later", "/later.sy", "后续页面", 1),
                ]);
            }
            return new Promise<PageDocument[]>((resolve) => {
                resolveChild = resolve;
            });
        });
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments,
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });
        const updates: string[][] = [];
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.label)));
        });

        generation = 1;
        source.invalidate();
        const reload = source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.label)));
        });
        await vi.waitFor(() => expect(resolveChild).toEqual(expect.any(Function)));

        expect(updates[updates.length - 1]).toEqual([]);

        resolveChild([]);
        await reload;

        expect(updates[updates.length - 1]).toEqual(["临时页面", "后续页面"]);
    });

    it("重命名可直接更新缓存而不重新扫描", async () => {
        const listNotebooks = vi.fn().mockResolvedValue(notebooks.slice(2));
        const listDocuments = vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []);
        const source = createPageSource({
            listNotebooks,
            listDocuments,
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        const callsBefore = listDocuments.mock.calls.length;

        expect(source.applyChange({ kind: "rename", id: "reading", title: "新标题" })).toBe(true);
        expect(source.snapshot.sections[0].entries.map((entry) => entry.label)).toContain("新标题");
        expect(listNotebooks).toHaveBeenCalledOnce();
        expect(listDocuments).toHaveBeenCalledTimes(callsBefore);
    });

    it("删除普通页面可直接移除，删除日记文档要求回退", async () => {
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(0, 1)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [
                id,
                id === "daily" ? { "custom-dailynote-20260925": "20260925" } : {},
            ]))),
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        expect(source.applyChange({ kind: "remove", ids: ["guide"] })).toBe(true);
        expect(source.snapshot.sections).toEqual([]);
        expect(source.applyChange({ kind: "remove", ids: ["daily"] })).toBe(false);
    });

    it("删除父页面时同时移除已扫描的普通子页面", async () => {
        const documents: Record<string, PageDocument[]> = {
            "work:/": [doc("parent", "/parent.sy", "父页面", 1)],
            "work:/parent.sy": [doc("child", "/parent.sy/child.sy", "子页面")],
        };
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (notebookId: string, path: string) => documents[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        expect(new Set(source.snapshot.sections[0].entries.map((entry) => entry.key)))
            .toEqual(new Set(["child", "parent"]));
        expect(source.applyChange({ kind: "remove", ids: ["parent"] })).toBe(true);
        expect(source.snapshot.sections).toEqual([]);
        expect(source.applyChange({ kind: "remove", ids: ["parent", "child"] })).toBe(true);
    });

    it("同一笔记本的普通页面移动可更新路径，移入日记文档子树时回退", async () => {
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(0, 1)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [
                id,
                id === "daily" ? { "custom-dailynote-20260925": "20260925" } : {},
            ]))),
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        expect(source.applyChange({
            kind: "move",
            fromNotebook: "work",
            fromPath: "/guide.sy",
            toNotebook: "work",
            newPath: "/other.sy/guide.sy",
        })).toBe(true);
        expect(source.applyChange({
            kind: "move",
            fromNotebook: "work",
            fromPath: "/other.sy/guide.sy",
            toNotebook: "work",
            newPath: "/year/month/daily.sy/guide.sy",
        })).toBe(false);
    });

    it("重复删除和重复移动事件不会再次触发回退", async () => {
        const source = createPageSource({
            listNotebooks: vi.fn().mockResolvedValue(notebooks.slice(2)),
            listDocuments: vi.fn(async (notebookId: string, path: string) => trees[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async () => ({})),
            open: vi.fn(),
        });

        await source.query({ query: "", sort });
        expect(source.applyChange({
            kind: "move",
            fromNotebook: "life",
            fromPath: "/reading.sy",
            toNotebook: "life",
            newPath: "/archive.sy/reading.sy",
        })).toBe(true);
        expect(source.applyChange({
            kind: "move",
            fromNotebook: "life",
            fromPath: "/reading.sy",
            toNotebook: "life",
            newPath: "/archive.sy/reading.sy",
        })).toBe(true);
        expect(source.applyChange({ kind: "remove", ids: ["reading"] })).toBe(true);
        expect(source.applyChange({ kind: "remove", ids: ["reading"] })).toBe(true);
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
