import { describe, expect, it, vi } from "vitest";

import {
    createDailyNoteNavigator,
    DailyNoteNavigationError,
    loadDailyNotebookOptions,
    type DailyNoteDocument,
    type DailyNoteNotebook,
} from "./daily-notes";

const notebooks: DailyNoteNotebook[] = [
    { id: "daily", name: "日记", closed: false },
    { id: "plain", name: "普通", closed: false },
    { id: "closed", name: "已关闭", closed: true },
];

describe("日记导航", () => {
    it("设置候选项只包含已打开且配置了日记路径的笔记本", async () => {
        const options = await loadDailyNotebookOptions({
            listNotebooks: vi.fn().mockResolvedValue(notebooks),
            getNotebookConfig: vi.fn(async (id: string) => ({
                dailyNoteSavePath: id === "daily" || id === "closed" ? "/daily/{{now | date \"2006-01-02\"}}" : "",
            })),
        });

        expect(options).toEqual([{
            id: "daily",
            name: "日记",
            dailyNoteSavePath: "/daily/{{now | date \"2006-01-02\"}}",
        }]);
    });

    it("加载月份并根据日记属性标记已有日期", async () => {
        const navigator = createNavigator();

        await expect(navigator.loadMonth(2026, 8)).resolves.toEqual({
            year: 2026,
            month: 8,
            dates: { "2026-09-25": "existing" },
        });
    });

    it("缓存失效后重新扫描并发现外部创建的日记", async () => {
        const documents: DailyNoteDocument[] = [
            { id: "existing", path: "/existing.sy", name: "2026-09-25", subFileCount: 0 },
        ];
        const attributes: Record<string, Record<string, string>> = {
            existing: { "custom-dailynote-20260925": "20260925" },
        };
        const navigator = createNavigator({
            listDocuments: vi.fn(async (_notebookId: string, path: string) => path === "/" ? documents : []),
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(
                ids.map((id) => [id, attributes[id] ?? {}]),
            )),
        });

        await expect(navigator.loadMonth(2026, 8)).resolves.toMatchObject({
            dates: { "2026-09-25": "existing" },
        });

        documents.push({ id: "external", path: "/external.sy", name: "2026-09-28", subFileCount: 0 });
        attributes.external = { "custom-dailynote-20260928": "20260928" };

        await expect(navigator.loadMonth(2026, 8)).resolves.toMatchObject({
            dates: { "2026-09-25": "existing" },
        });

        const refreshMonth = navigator.refreshMonth;
        await expect(refreshMonth(2026, 8)).resolves.toMatchObject({
            dates: {
                "2026-09-25": "existing",
                "2026-09-28": "external",
            },
        });
    });

    it("日记被删除并失效后不会继续打开已删除的块", async () => {
        const documents: DailyNoteDocument[] = [
            { id: "deleted", path: "/deleted.sy", name: "2026-09-25", subFileCount: 0 },
        ];
        const attributes: Record<string, Record<string, string>> = {
            deleted: { "custom-dailynote-20260925": "20260925" },
        };
        const confirmCreate = vi.fn().mockResolvedValue(false);
        const open = vi.fn();
        const navigator = createNavigator({
            listDocuments: vi.fn(async (_notebookId: string, path: string) => path === "/" ? documents : []),
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(
                ids.map((id) => [id, attributes[id] ?? {}]),
            )),
            confirmCreate,
            open,
        });

        await navigator.loadMonth(2026, 8);
        documents.length = 0;
        delete attributes.deleted;
        expect(navigator.removeDocuments(["deleted"])).toEqual(["2026-09-25"]);

        await expect(navigator.openDate("2026-09-25")).resolves.toBe("cancelled");
        expect(open).not.toHaveBeenCalled();
        expect(confirmCreate).toHaveBeenCalledWith("2026-09-25");
    });

    it("打开已有日记失败后刷新索引并重试打开", async () => {
        const open = vi.fn()
            .mockRejectedValueOnce(new Error("块暂时不可用"))
            .mockResolvedValue(undefined);
        const confirmCreate = vi.fn();
        const navigator = createNavigator({ open, confirmCreate });

        await expect(navigator.openDate("2026-09-25")).resolves.toBe("opened");
        expect(open).toHaveBeenNthCalledWith(1, "existing");
        expect(open).toHaveBeenNthCalledWith(2, "existing");
        expect(confirmCreate).not.toHaveBeenCalled();
    });

    it("打开今日旧日记失败且刷新后已不存在时进入创建流程", async () => {
        const documents: DailyNoteDocument[] = [
            { id: "deleted", path: "/deleted.sy", name: "2026-09-25", subFileCount: 0 },
        ];
        const attributes: Record<string, Record<string, string>> = {
            deleted: { "custom-dailynote-20260925": "20260925" },
        };
        const open = vi.fn()
            .mockImplementationOnce(() => {
                documents.length = 0;
                delete attributes.deleted;
                return Promise.reject(new Error("找不到块"));
            })
            .mockResolvedValue(undefined);
        const createToday = vi.fn().mockResolvedValue("created");
        const confirmCreate = vi.fn().mockResolvedValue(true);
        const navigator = createNavigator({
            listDocuments: vi.fn(async (_notebookId: string, path: string) => path === "/" ? documents : []),
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(
                ids.map((id) => [id, attributes[id] ?? {}]),
            )),
            open,
            createToday,
            confirmCreate,
        });

        await expect(navigator.openDate("2026-09-25")).resolves.toBe("created");
        expect(confirmCreate).toHaveBeenCalledWith("2026-09-25");
        expect(createToday).toHaveBeenCalledWith("daily");
        expect(open).toHaveBeenNthCalledWith(2, "created");
    });

    it("缓存失效时仍在执行的旧扫描不会覆盖刷新结果", async () => {
        let finishOldScan!: (documents: DailyNoteDocument[]) => void;
        const oldScan = new Promise<DailyNoteDocument[]>((resolve) => {
            finishOldScan = resolve;
        });
        const listDocuments = vi.fn()
            .mockReturnValueOnce(oldScan)
            .mockResolvedValueOnce([
                { id: "external", path: "/external.sy", name: "2026-09-28", subFileCount: 0 },
            ]);
        const confirmCreate = vi.fn();
        const createToday = vi.fn();
        const open = vi.fn();
        const navigator = createNavigator({
            listDocuments,
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(
                ids.map((id) => [id, { "custom-dailynote-20260928": "20260928" }]),
            )),
            confirmCreate,
            createToday,
            open,
        });

        const oldMonth = navigator.loadMonth(2026, 8);
        await vi.waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(1));
        await expect(navigator.refreshMonth(2026, 8)).resolves.toMatchObject({
            dates: { "2026-09-28": "external" },
        });

        finishOldScan([]);
        await oldMonth;

        await expect(navigator.openDate("2026-09-28")).resolves.toBe("opened");
        expect(open).toHaveBeenCalledWith("external");
        expect(confirmCreate).not.toHaveBeenCalled();
        expect(createToday).not.toHaveBeenCalled();
    });

    it("打开日期时的旧扫描失效后改用刷新后的索引", async () => {
        let finishOldScan!: (documents: DailyNoteDocument[]) => void;
        const oldScan = new Promise<DailyNoteDocument[]>((resolve) => {
            finishOldScan = resolve;
        });
        const listDocuments = vi.fn()
            .mockReturnValueOnce(oldScan)
            .mockResolvedValue([
                { id: "external", path: "/external.sy", name: "2026-09-28", subFileCount: 0 },
            ]);
        const confirmCreate = vi.fn();
        const createToday = vi.fn();
        const open = vi.fn();
        const navigator = createNavigator({
            listDocuments,
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(
                ids.map((id) => [id, { "custom-dailynote-20260928": "20260928" }]),
            )),
            confirmCreate,
            createToday,
            open,
            today: () => "2026-09-28",
        });

        const opening = navigator.openDate("2026-09-28");
        await vi.waitFor(() => expect(listDocuments).toHaveBeenCalledTimes(1));
        await navigator.refreshMonth(2026, 8);
        finishOldScan([]);

        await expect(opening).resolves.toBe("opened");
        expect(open).toHaveBeenCalledWith("external");
        expect(confirmCreate).not.toHaveBeenCalled();
        expect(createToday).not.toHaveBeenCalled();
    });

    it("已有日记直接打开，不请求确认", async () => {
        const confirmCreate = vi.fn();
        const open = vi.fn();
        const navigator = createNavigator({ confirmCreate, open });

        await expect(navigator.openDate("2026-09-25")).resolves.toBe("opened");

        expect(open).toHaveBeenCalledWith("existing");
        expect(confirmCreate).not.toHaveBeenCalled();
    });

    it("按方向跳过缺失日期并打开最近的已有日记", async () => {
        const open = vi.fn();
        const confirmCreate = vi.fn();
        const createToday = vi.fn();
        const navigator = createNavigator({ open, confirmCreate, createToday });

        await expect(navigator.openAdjacentDate("2026-11-25", "previous")).resolves.toBe("2026-11-20");
        await expect(navigator.openAdjacentDate("2026-11-25", "next")).resolves.toBe("2026-12-03");

        expect(open).toHaveBeenNthCalledWith(1, "previous");
        expect(open).toHaveBeenNthCalledWith(2, "next-near");
        expect(confirmCreate).not.toHaveBeenCalled();
        expect(createToday).not.toHaveBeenCalled();
    });

    it("目标方向没有已有日记时返回边界错误", async () => {
        const navigator = createNavigator();

        await expect(navigator.openAdjacentDate("2026-08-01", "previous")).rejects.toEqual(
            new DailyNoteNavigationError("no-adjacent-note"),
        );
        await expect(navigator.openAdjacentDate("2027-01-01", "next")).rejects.toEqual(
            new DailyNoteNavigationError("no-adjacent-note"),
        );
    });

    it("缺失的今日日记只有确认后才使用官方能力创建并打开", async () => {
        const createToday = vi.fn().mockResolvedValue("created");
        const open = vi.fn();
        const cancelNavigator = createNavigator({
            getBlockAttrs: vi.fn(async () => ({})),
            confirmCreate: vi.fn().mockResolvedValue(false),
            createToday,
            open,
        });

        await expect(cancelNavigator.openDate("2026-09-25")).resolves.toBe("cancelled");
        expect(createToday).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();

        const confirmNavigator = createNavigator({
            getBlockAttrs: vi.fn(async () => ({})),
            confirmCreate: vi.fn().mockResolvedValue(true),
            createToday,
            open,
        });
        await expect(confirmNavigator.openDate("2026-09-25")).resolves.toBe("created");
        expect(createToday).toHaveBeenCalledWith("daily");
        expect(open).toHaveBeenCalledWith("created");
    });

    it("所选笔记本关闭时要求重新打开，且不自动打开笔记本", async () => {
        const navigator = createNavigator({
            selectedNotebookId: () => "closed",
            open: vi.fn(),
        });

        await expect(navigator.openDate("2026-09-25")).rejects.toEqual(
            new DailyNoteNavigationError("notebook-closed"),
        );
    });

    it("本阶段不会猜测性创建缺失的过去或未来日记", async () => {
        const navigator = createNavigator({ getBlockAttrs: vi.fn(async () => ({})) });

        await expect(navigator.openDate("2026-09-24")).rejects.toEqual(
            new DailyNoteNavigationError("date-creation-unsupported"),
        );
    });
});

function createNavigator(overrides: Record<string, unknown> = {}) {
    const documents: Record<string, DailyNoteDocument[]> = {
        "/": [{ id: "folder", path: "/folder.sy", name: "daily", subFileCount: 1 }],
        "/folder.sy": [
            { id: "previous-far", path: "/folder/previous-far.sy", name: "2026-10-20", subFileCount: 0 },
            { id: "previous", path: "/folder/previous.sy", name: "2026-11-20", subFileCount: 0 },
            { id: "existing", path: "/folder/existing.sy", name: "2026-09-25", subFileCount: 0 },
            { id: "next", path: "/folder/next.sy", name: "2026-10-03", subFileCount: 0 },
            { id: "next-near", path: "/folder/next-near.sy", name: "2026-12-03", subFileCount: 0 },
            { id: "next-far", path: "/folder/next-far.sy", name: "2026-12-10", subFileCount: 0 },
        ],
    };
    const attributes: Record<string, Record<string, string>> = {
        "previous-far": { "custom-dailynote-20261020": "20261020" },
        previous: { "custom-dailynote-20261120": "20261120" },
        existing: { "custom-dailynote-20260925": "20260925" },
        next: { "custom-dailynote-20261003": "20261003" },
        "next-near": { "custom-dailynote-20261203": "20261203" },
        "next-far": { "custom-dailynote-20261210": "20261210" },
    };
    return createDailyNoteNavigator({
        selectedNotebookId: () => "daily",
        listNotebooks: vi.fn().mockResolvedValue(notebooks),
        getNotebookConfig: vi.fn().mockResolvedValue({ dailyNoteSavePath: "/daily/{{now | date \"2006-01-02\"}}" }),
        listDocuments: vi.fn(async (_notebookId: string, path: string) => documents[path] ?? []),
        getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, attributes[id] ?? {}]))),
        confirmCreate: vi.fn().mockResolvedValue(true),
        createToday: vi.fn().mockResolvedValue("created"),
        open: vi.fn(),
        today: () => "2026-09-25",
        ...overrides,
    });
}
