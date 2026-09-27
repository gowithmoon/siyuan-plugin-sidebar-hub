import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => vi.unstubAllGlobals());

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
    it("只为显式声明的稳定条目 key 加载计数", async () => {
        const count = vi.fn().mockResolvedValue(7);
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), count, open: vi.fn() });

        const snapshot = await source.query({ query: "", sort });
        source.setCountTargets(["20260924090000-reading"]);

        expect(snapshot.sections[0].entries.every((entry) => entry.count === undefined)).toBe(true);
        await vi.waitFor(() => expect(count).toHaveBeenCalledOnce());
        expect(count).toHaveBeenCalledWith("av-reading");
    });

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
        source.setCountTargets(snapshot.sections[0].entries.map((entry) => entry.key));

        expect(snapshot.sections[0].entries.every((entry) => entry.count === undefined)).toBe(true);
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(2));
        expect(peak).toBeLessThanOrEqual(4);
        await vi.waitFor(() => expect(updates[updates.length - 1]).toEqual([12, 0]));
    });

    it("同时处理至多四个目标计数", async () => {
        const manyResults = Array.from({ length: 6 }, (_, index): DatabaseSearchResult => ({
            ...results[0],
            avID: `av-${index}`,
            avName: `数据库 ${index}`,
            blockID: `block-${index}`,
            children: [],
        }));
        let active = 0;
        let peak = 0;
        const resolvers: Array<() => void> = [];
        const count = vi.fn((_avID: string) => new Promise<number>((resolve) => {
            active += 1;
            peak = Math.max(peak, active);
            resolvers.push(() => {
                active -= 1;
                resolve(1);
            });
        }));
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(manyResults), count, open: vi.fn() });
        const snapshot = await source.query({ query: "", sort });

        source.setCountTargets(snapshot.sections[0].entries.map((entry) => entry.key));

        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(4));
        expect(peak).toBe(4);
        resolvers.splice(0).forEach((resolve) => resolve());
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(6));
        resolvers.splice(0).forEach((resolve) => resolve());
    });

    it("同一动画帧完成的多个计数合并为一次快照发布", async () => {
        const frames: FrameRequestCallback[] = [];
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            frames.push(callback);
            return frames.length;
        });
        const source = createDatabaseSource({
            load: vi.fn().mockResolvedValue(results),
            count: vi.fn().mockResolvedValue(2),
            open: vi.fn(),
        });
        const updates: number[][] = [];
        const snapshot = await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections[0]?.entries.map((entry) => entry.count ?? -1) ?? []);
        });

        source.setCountTargets(snapshot.sections[0].entries.map((entry) => entry.key));
        await vi.waitFor(() => expect(frames).toHaveLength(1));
        expect(updates).toHaveLength(1);
        frames[0](0);

        expect(updates).toHaveLength(2);
        expect(updates[1]).toEqual([2, 2]);
    });

    it("目标快速替换后不再启动已经离开目标集合的排队项", async () => {
        const manyResults = Array.from({ length: 6 }, (_, index): DatabaseSearchResult => ({
            ...results[0],
            avID: `av-${index}`,
            avName: `数据库 ${index}`,
            blockID: `block-${index}`,
            children: [],
        }));
        const resolvers: Array<() => void> = [];
        const count = vi.fn((_avID: string) => new Promise<number>((resolve) => {
            resolvers.push(() => resolve(1));
        }));
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(manyResults), count, open: vi.fn() });
        const snapshot = await source.query({ query: "", sort });

        source.setCountTargets(snapshot.sections[0].entries.map((entry) => entry.key));
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(4));
        source.setCountTargets(["block-5"]);
        resolvers.splice(0).forEach((resolve) => resolve());

        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(5));
        expect(count.mock.calls.map(([avID]) => avID)).not.toContain("av-4");
        resolvers.splice(0).forEach((resolve) => resolve());
    });

    it("滚动离开再返回时复用已缓存计数", async () => {
        const count = vi.fn().mockResolvedValue(5);
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), count, open: vi.fn() });
        await source.query({ query: "", sort });

        source.setCountTargets(["20260924090000-reading"]);
        await vi.waitFor(() => expect(count).toHaveBeenCalledOnce());
        source.setCountTargets([]);
        source.setCountTargets(["20260924090000-reading"]);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(count).toHaveBeenCalledOnce();
    });

    it("失败计数同一 generation 不重试，失效后才重试", async () => {
        const count = vi.fn()
            .mockRejectedValueOnce(new Error("暂时失败"))
            .mockResolvedValueOnce(6);
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), count, open: vi.fn() });
        await source.query({ query: "", sort });

        source.setCountTargets(["20260924090000-reading"]);
        await vi.waitFor(() => expect(count).toHaveBeenCalledOnce());
        source.setCountTargets([]);
        source.setCountTargets(["20260924090000-reading"]);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(count).toHaveBeenCalledOnce();

        source.invalidate();
        await source.query({ query: "", sort });
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(2));
    });

    it("旧 generation 的在途结果不能写回新快照", async () => {
        const resolvers: Array<(value: number) => void> = [];
        const count = vi.fn(() => new Promise<number>((resolve) => {
            resolvers.push(resolve);
        }));
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), count, open: vi.fn() });
        const updates: number[][] = [];
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections[0]?.entries.map((entry) => entry.count ?? -1) ?? []);
        });
        source.setCountTargets(["20260924090000-reading"]);
        await vi.waitFor(() => expect(count).toHaveBeenCalledOnce());

        source.invalidate();
        await source.query({ query: "", sort }, (next) => {
            updates.push(next.sections[0]?.entries.map((entry) => entry.count ?? -1) ?? []);
        });
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(2));
        resolvers[1](9);
        await vi.waitFor(() => expect(updates[updates.length - 1]).toEqual([9, -1]));
        resolvers[0](1);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(updates[updates.length - 1]).toEqual([9, -1]);
    });

    it("失效前后的在途请求合计仍不超过四个", async () => {
        const manyResults = Array.from({ length: 6 }, (_, index): DatabaseSearchResult => ({
            ...results[0],
            avID: `av-${index}`,
            avName: `数据库 ${index}`,
            blockID: `block-${index}`,
            children: [],
        }));
        let active = 0;
        let peak = 0;
        const resolvers: Array<() => void> = [];
        const count = vi.fn((_avID: string) => new Promise<number>((resolve) => {
            active += 1;
            peak = Math.max(peak, active);
            resolvers.push(() => {
                active -= 1;
                resolve(1);
            });
        }));
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(manyResults), count, open: vi.fn() });
        const first = await source.query({ query: "", sort });
        source.setCountTargets(first.sections[0].entries.map((entry) => entry.key));
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(4));

        source.invalidate();
        await source.query({ query: "", sort });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(count).toHaveBeenCalledTimes(4);

        resolvers.shift()!();
        await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(5));
        expect(peak).toBe(4);
    });

    it("空目标不启动计数，重新声明目标后才补齐", async () => {
        const count = vi.fn().mockResolvedValue(1);
        const source = createDatabaseSource({ load: vi.fn().mockResolvedValue(results), count, open: vi.fn() });
        source.setCountTargets([]);
        await source.query({ query: "", sort });
        await Promise.resolve();
        expect(count).not.toHaveBeenCalled();
        source.setCountTargets(results.map((result) => result.blockID));
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
