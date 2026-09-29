import { describe, expect, it, vi } from "vitest";

import {
    isDailyNote,
    scanOpenNotebookDocuments,
    type NotebookDocument,
} from "./notebook-documents";
import { createDailyNoteNavigator } from "./daily-notes";
import { createPageSource } from "./pages";

describe("笔记本文档扫描", () => {
    it("递归扫描已打开笔记本，并为文档附加块属性", async () => {
        const documents: Record<string, NotebookDocument[]> = {
            "work:/": [doc("parent", "/parent.sy", "父文档", 1)],
            "work:/parent.sy": [doc("daily", "/parent.sy/daily.sy", "日记")],
        };
        const scan = await scanOpenNotebookDocuments({
            listNotebooks: vi.fn().mockResolvedValue([
                { id: "work", name: "工作", closed: false },
                { id: "archive", name: "归档", closed: true },
            ]),
            listDocuments: vi.fn(async (notebookId, path) => documents[`${notebookId}:${path}`] ?? []),
            getBlockAttrs: vi.fn(async (ids) => Object.fromEntries(ids.map((id) => [
                id,
                id === "daily" ? { "custom-dailynote-20260929": "20260929" } : {},
            ]))),
        });

        expect(scan).toEqual([{
            notebook: { id: "work", name: "工作", closed: false },
            documents: [{
                document: doc("parent", "/parent.sy", "父文档", 1),
                attributes: {},
                children: [{
                    document: doc("daily", "/parent.sy/daily.sy", "日记"),
                    attributes: { "custom-dailynote-20260929": "20260929" },
                    children: [],
                }],
            }],
        }]);
        expect(isDailyNote(scan[0].documents[0].attributes)).toBe(false);
        expect(isDailyNote(scan[0].documents[0].children[0].attributes)).toBe(true);
    });

    it("扫描每个文档后发布跨笔记本累计进度", async () => {
        const progress: number[] = [];
        await scanOpenNotebookDocuments({
            listNotebooks: vi.fn().mockResolvedValue([
                { id: "work", name: "工作", closed: false },
                { id: "life", name: "生活", closed: false },
            ]),
            listDocuments: vi.fn(async (notebookId, path) => path === "/"
                ? [doc(`${notebookId}-page`, `/${notebookId}.sy`, notebookId)]
                : []),
            getBlockAttrs: vi.fn().mockResolvedValue({}),
        }, (scanned) => progress.push(scanned));

        expect(progress).toEqual([1, 2]);
    });

    it("按路径批量读取同层文档属性，空路径不请求属性", async () => {
        const getBlockAttrs = vi.fn().mockResolvedValue({});
        const adapter = {
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (_notebookId: string, path: string) => path === "/"
                ? [doc("first", "/first.sy", "第一篇"), doc("second", "/second.sy", "第二篇")]
                : []),
            getBlockAttrs,
        };

        await scanOpenNotebookDocuments(adapter);
        expect(getBlockAttrs).toHaveBeenCalledOnce();
        expect(getBlockAttrs).toHaveBeenCalledWith(["first", "second"]);

        adapter.listDocuments.mockResolvedValue([]);
        getBlockAttrs.mockClear();
        await scanOpenNotebookDocuments(adapter);
        expect(getBlockAttrs).not.toHaveBeenCalled();
    });

    it("保留 adapter 的扫描错误", async () => {
        await expect(scanOpenNotebookDocuments({
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn().mockRejectedValue(new Error("扫描失败")),
            getBlockAttrs: vi.fn(),
        })).rejects.toThrow("扫描失败");
    });

    it("同一日记属性同时驱动页面排除和日记日期索引", async () => {
        const documents = [
            { ...doc("daily", "/daily.sy", "日记"), created: 10, updated: 20 },
            { ...doc("plain", "/plain.sy", "普通页面"), created: 10, updated: 20 },
        ];
        const adapter = {
            listNotebooks: vi.fn().mockResolvedValue([{ id: "work", name: "工作", closed: false }]),
            listDocuments: vi.fn(async (_notebookId: string, path: string) => path === "/" ? documents : []),
            getBlockAttrs: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [
                id,
                id === "daily" ? { "custom-dailynote-20260929": "20260929" } : {},
            ]))),
        };
        const pages = createPageSource({ ...adapter, open: vi.fn() });
        const dailyNotes = createDailyNoteNavigator({
            ...adapter,
            selectedNotebookId: () => "work",
            getNotebookConfig: vi.fn().mockResolvedValue({ dailyNoteSavePath: "/daily" }),
            confirmCreate: vi.fn(),
            createToday: vi.fn(),
            open: vi.fn(),
            today: () => "2026-09-29",
        });

        await expect(pages.query({
            query: "",
            sort: { field: "name", direction: "asc" },
        })).resolves.toMatchObject({
            sections: [{ entries: [{ key: "plain" }] }],
        });
        await expect(dailyNotes.loadMonth(2026, 8)).resolves.toMatchObject({
            dates: { "2026-09-29": "daily" },
        });
    });
});

function doc(
    id: string,
    path: string,
    name: string,
    subFileCount = 0,
): NotebookDocument {
    return { id, path, name, subFileCount };
}
