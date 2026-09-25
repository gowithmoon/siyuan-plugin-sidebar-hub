import { describe, expect, it, vi } from "vitest";

import {
    createDatabaseSource,
    DATABASE_SORT_FIELDS,
    openDatabaseWithFallback,
    type DatabaseSearchResult,
} from "./databases";

const results: DatabaseSearchResult[] = [
    {
        avID: "av-projects",
        avName: "项目数据库",
        blockID: "20260925090000-projects",
        hPath: "工作/项目",
        viewID: "",
        viewName: "",
        viewLayout: "",
        children: [
            {
                avID: "av-projects",
                avName: "项目数据库",
                blockID: "20260925090000-projects",
                hPath: "工作/项目",
                viewID: "view-table",
                viewName: "表格",
                viewLayout: "table",
            },
        ],
    },
    {
        avID: "av-reading",
        avName: "阅读清单",
        blockID: "20260924090000-reading",
        hPath: "生活/阅读",
        viewID: "",
        viewName: "",
        viewLayout: "",
        children: [
            {
                avID: "av-reading",
                avName: "阅读清单",
                blockID: "20260924090000-reading",
                hPath: "生活/阅读",
                viewID: "view-board",
                viewName: "看板",
                viewLayout: "kanban",
            },
        ],
    },
];

const sort = { field: "name", direction: "asc" } as const;

describe("数据库导航", () => {
    it("按数据库 ID 合并不同视图，只展示数据库名称", async () => {
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), open: vi.fn() });

        expect(source.sortFields).toEqual(DATABASE_SORT_FIELDS);
        await expect(source.query({ query: "", sort })).resolves.toMatchObject({
            status: "ready",
            sections: [{
                entries: [
                    { key: "20260924090000-reading", label: "阅读清单", icon: "iconDatabase" },
                    { key: "20260925090000-projects", label: "项目数据库", icon: "iconDatabase" },
                ],
            }],
        });
    });

    it("支持名称搜索以及名称升降序", async () => {
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), open: vi.fn() });

        expect((await source.query({ query: "阅读", sort })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["阅读清单"]);
        expect((await source.query({ query: "", sort: { field: "name", direction: "desc" } })).sections[0].entries.map((entry) => entry.label))
            .toEqual(["项目数据库", "阅读清单"]);
        expect((await source.query({ query: "不存在", sort })).sections).toEqual([]);
    });

    it("打开条目时把数据库块 ID 交给适配器", async () => {
        const open = vi.fn();
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), open });

        await source.open("20260925090000-projects");

        expect(open).toHaveBeenCalledWith("20260925090000-projects");
    });

    it("精确定位失败时退回打开数据库所在文档", async () => {
        const open = vi.fn().mockRejectedValueOnce(new Error("定位失败")).mockResolvedValueOnce(undefined);

        await openDatabaseWithFallback({}, "20260925090000-projects", open);

        expect(open).toHaveBeenNthCalledWith(1, {
            app: {},
            doc: {
                id: "20260925090000-projects",
                action: ["cb-get-context", "cb-get-rootscroll", "cb-get-av-no-create"],
            },
        });
        expect(open).toHaveBeenNthCalledWith(2, {
            app: {},
            doc: { id: "20260925090000-projects" },
        });
    });
});
