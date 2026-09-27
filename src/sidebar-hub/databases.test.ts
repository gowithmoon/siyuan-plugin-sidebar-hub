import { describe, expect, it, vi } from "vitest";

import {
    createDatabaseSource,
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

const datedResults: DatabaseSearchResult[] = [
    {
        avID: "20260925090000-newest",
        avName: "最近更新",
        blockID: "block-newest",
        hPath: "工作/最近更新",
        viewID: "",
        viewName: "",
        viewLayout: "",
    },
    {
        avID: "20260924090000-older",
        avName: "较早创建",
        blockID: "block-older",
        hPath: "工作/较早创建",
        viewID: "",
        viewName: "",
        viewLayout: "",
    },
];

describe("数据库导航", () => {
    it("异步加载每个数据库的主键总数，且最多四个请求并发", async () => {
        let active = 0;
        let peak = 0;
        const count = vi.fn(async (avID: string) => {
            active += 1;
            peak = Math.max(peak, active);
            await Promise.resolve();
            active -= 1;
            return avID === "av-projects" ? 0 : 12;
        });
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), count, open: vi.fn() });
        const updates: number[][] = [];
        const snapshot = await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections.flatMap((section) => section.entries.map((entry) => entry.count ?? -1)));
        });

        expect(snapshot.sections[0].entries.every((entry) => entry.count === undefined)).toBe(true);
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(2));
        expect(peak).toBeLessThanOrEqual(4);
        expect(updates[updates.length - 1]).toEqual([12, 0]);
    });

    it("停用来源时不启动计数，重新激活后才补齐", async () => {
        const count = vi.fn().mockResolvedValue(1);
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), count, open: vi.fn() });
        source.setCountEnabled(false);
        await source.query({ query: "", sort });
        await Promise.resolve();
        expect(count).not.toHaveBeenCalled();
        source.setCountEnabled(true);
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(2));
    });

    it("按数据库 ID 合并不同视图，只展示数据库名称", async () => {
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), open: vi.fn() });

        expect(source.sortFields).toEqual(["name", "created", "updated"]);
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

    it("按属性视图创建日期升降序排列", async () => {
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(datedResults), open: vi.fn() });

        await expect(source.query({ query: "", sort: { field: "created", direction: "asc" } })).resolves.toMatchObject({
            sections: [{ entries: [{ label: "较早创建" }, { label: "最近更新" }] }],
        });
        await expect(source.query({ query: "", sort: { field: "created", direction: "desc" } })).resolves.toMatchObject({
            sections: [{ entries: [{ label: "最近更新" }, { label: "较早创建" }] }],
        });
    });

    it("按数据库搜索结果的更新时间顺序升降序排列，并支持名称搜索", async () => {
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(datedResults), open: vi.fn() });

        await expect(source.query({ query: "", sort: { field: "updated", direction: "desc" } })).resolves.toMatchObject({
            sections: [{ entries: [{ label: "最近更新" }, { label: "较早创建" }] }],
        });
        await expect(source.query({ query: "较早", sort: { field: "updated", direction: "asc" } })).resolves.toMatchObject({
            sections: [{ entries: [{ label: "较早创建" }] }],
        });
    });

    it("创建日期无法从属性视图 ID 解析时回退到名称", async () => {
        const source = createDatabaseSource({
            load: vi.fn().mockResolvedValue([
                { ...datedResults[0], avID: "invalid-new", avName: "Alpha" },
                { ...datedResults[1], avID: "invalid-old", avName: "Beta" },
            ]),
            open: vi.fn(),
        });

        await expect(source.query({ query: "", sort: { field: "created", direction: "asc" } })).resolves.toMatchObject({
            sections: [{ entries: [{ label: "Alpha" }, { label: "Beta" }] }],
        });
    });

    it("创建日期排序对有效与无效属性视图 ID 使用确定顺序", async () => {
        const source = createDatabaseSource({
            load: vi.fn().mockResolvedValue([
                { ...datedResults[0], avID: "20260925090000-same", avName: "Zeta" },
                { ...datedResults[1], avID: "invalid", avName: "Beta" },
                { ...datedResults[0], avID: "20260925090000-other", avName: "Alpha" },
            ]),
            open: vi.fn(),
        });

        await expect(source.query({ query: "", sort: { field: "created", direction: "asc" } })).resolves.toMatchObject({
            sections: [{ entries: [{ label: "Beta" }, { label: "Alpha" }, { label: "Zeta" }] }],
        });
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
