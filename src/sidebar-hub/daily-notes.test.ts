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

    it("已有日记直接打开，不请求确认", async () => {
        const confirmCreate = vi.fn();
        const open = vi.fn();
        const navigator = createNavigator({ confirmCreate, open });

        await expect(navigator.openDate("2026-09-25")).resolves.toBe("opened");

        expect(open).toHaveBeenCalledWith("existing");
        expect(confirmCreate).not.toHaveBeenCalled();
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
        "/folder.sy": [{ id: "existing", path: "/folder/existing.sy", name: "2026-09-25", subFileCount: 0 }],
    };
    return createDailyNoteNavigator({
        selectedNotebookId: () => "daily",
        listNotebooks: vi.fn().mockResolvedValue(notebooks),
        getNotebookConfig: vi.fn().mockResolvedValue({ dailyNoteSavePath: "/daily/{{now | date \"2006-01-02\"}}" }),
        listDocuments: vi.fn(async (_notebookId: string, path: string) => documents[path] ?? []),
        getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [
            id,
            id === "existing" ? { "custom-dailynote-20260925": "20260925" } : {},
        ]))),
        confirmCreate: vi.fn().mockResolvedValue(true),
        createToday: vi.fn().mockResolvedValue("created"),
        open: vi.fn(),
        today: () => "2026-09-25",
        ...overrides,
    });
}
