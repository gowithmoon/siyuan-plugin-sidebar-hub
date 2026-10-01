import { afterEach, describe, expect, it, vi } from "vitest";

import { createEntrySource } from "./entry-source";
import { createEntrySourceRuntime, type EntrySourceRuntimeState } from "./entry-source-runtime";

afterEach(() => vi.useRealTimers());

function createFixture() {
    let loads = 0;
    const source = createEntrySource({
        sortFields: ["name", "updated"] as const,
        load: async () => [{ key: "doc", label: "文档", icon: "iconFile" }],
        build: (entries, input) => [{
            key: `${input.query}:${input.sort.field}:${input.sort.direction}`,
            entries,
        }],
        open: () => undefined,
    });
    const load = source.query.bind(source);
    source.query = async (...args) => {
        loads += 1;
        return load(...args);
    };
    return { source, loadCount: () => loads };
}

describe("条目来源运行期状态", () => {
    it("非活动标签页可以预加载，激活时复用结果", async () => {
        const fixture = createFixture();
        const runtime = createEntrySourceRuntime({
            source: fixture.source,
            initialSort: { field: "name", direction: "asc" },
        });

        await runtime.preload();
        expect(fixture.loadCount()).toBe(1);
        expect(runtime.state.snapshot.status).toBe("ready");

        await runtime.setActive(true);
        expect(fixture.loadCount()).toBe(1);
    });

    it("预加载进行中激活标签页时复用同一个请求", async () => {
        let loads = 0;
        let resolveLoad!: (entries: Array<{ key: string; label: string; icon: string }>) => void;
        const source = createEntrySource({
            sortFields: ["name"] as const,
            load: () => {
                loads += 1;
                return new Promise<Array<{ key: string; label: string; icon: string }>>((resolve) => {
                    resolveLoad = resolve;
                });
            },
            build: (entries) => [{ key: "docs", entries }],
            open: () => undefined,
        });
        const runtime = createEntrySourceRuntime({
            source,
            initialSort: { field: "name", direction: "asc" },
        });

        const preload = runtime.preload();
        await Promise.resolve();
        const activation = runtime.setActive(true);
        resolveLoad([{ key: "doc", label: "文档", icon: "iconFile" }]);
        await Promise.all([preload, activation]);

        expect(loads).toBe(1);
        expect(runtime.state.snapshot.status).toBe("ready");
    });

    it("失效期间完成的旧预加载不会标记查询已加载", async () => {
        let resolveLoad!: (entries: Array<{ key: string; label: string; icon: string }>) => void;
        const source = createEntrySource({
            sortFields: ["name"] as const,
            load: () => new Promise<Array<{ key: string; label: string; icon: string }>>((resolve) => {
                resolveLoad = resolve;
            }),
            build: (entries) => [{ key: "docs", entries }],
            open: () => undefined,
        });
        const runtime = createEntrySourceRuntime({
            source,
            initialSort: { field: "name", direction: "asc" },
        });

        const preload = runtime.preload();
        await Promise.resolve();
        await runtime.invalidate();
        resolveLoad([{ key: "doc", label: "旧文档", icon: "iconFile" }]);
        await preload;

        expect(runtime.state.snapshot.status).toBe("idle");
        expect(runtime.state.loadedQuery).toBeUndefined();
    });

    it("预加载失败后保持可重试状态", async () => {
        let attempts = 0;
        const source = createEntrySource({
            sortFields: ["name"] as const,
            load: async () => {
                attempts += 1;
                if (attempts === 1) {
                    throw new Error("暂时不可用");
                }
                return [{ key: "doc", label: "文档", icon: "iconFile" }];
            },
            build: (entries) => [{ key: "docs", entries }],
            open: () => undefined,
        });
        const runtime = createEntrySourceRuntime({
            source,
            initialSort: { field: "name", direction: "asc" },
        });

        await runtime.preload();
        expect(runtime.state.snapshot.status).toBe("idle");

        await runtime.setActive(true);
        expect(attempts).toBe(2);
        expect(runtime.state.snapshot.status).toBe("ready");
    });

    it("销毁后不发布预加载结果", async () => {
        let resolveLoad!: (entries: Array<{ key: string; label: string; icon: string }>) => void;
        const source = createEntrySource({
            sortFields: ["name"] as const,
            load: () => new Promise<Array<{ key: string; label: string; icon: string }>>((resolve) => {
                resolveLoad = resolve;
            }),
            build: (entries) => [{ key: "docs", entries }],
            open: () => undefined,
        });
        const updates: EntrySourceRuntimeState<"name">[] = [];
        const runtime = createEntrySourceRuntime({
            source,
            initialSort: { field: "name", direction: "asc" },
            onChange: (state) => updates.push(state),
        });

        const preload = runtime.preload();
        await Promise.resolve();
        updates.length = 0;
        runtime.dispose();
        resolveLoad([{ key: "doc", label: "文档", icon: "iconFile" }]);
        await preload;

        expect(updates).toHaveLength(0);
    });

    it("防抖查询并只使用最后一次输入", async () => {
        vi.useFakeTimers();
        const fixture = createFixture();
        const runtime = createEntrySourceRuntime({
            source: fixture.source,
            initialSort: { field: "name", direction: "asc" },
        });

        runtime.setQuery("项");
        runtime.setQuery("项目");
        runtime.setQuery("项目 A");
        await vi.advanceTimersByTimeAsync(179);
        expect(fixture.loadCount()).toBe(0);

        await vi.advanceTimersByTimeAsync(1);
        expect(fixture.loadCount()).toBe(1);
        expect(runtime.state.snapshot.sections[0].key).toBe("项目 A:name:asc");
    });

    it("当前页失效后立即刷新，后台页在再次激活时刷新", async () => {
        const fixture = createFixture();
        const runtime = createEntrySourceRuntime({
            source: fixture.source,
            initialSort: { field: "name", direction: "asc" },
        });

        await runtime.setActive(true);
        expect(fixture.loadCount()).toBe(1);

        await runtime.invalidate();
        expect(fixture.loadCount()).toBe(2);

        await runtime.setActive(false);
        await runtime.invalidate();
        expect(fixture.loadCount()).toBe(2);
        expect(runtime.state.snapshot.status).toBe("idle");

        await runtime.setActive(true);
        expect(fixture.loadCount()).toBe(3);
    });

    it("后台刷新完成前保留最近一次成功的列表", async () => {
        type FixtureEntry = { key: string; label: string; icon: string };
        let loadCount = 0;
        let resolveReload!: (entries: FixtureEntry[]) => void;
        const source = createEntrySource({
            sortFields: ["name"] as const,
            load: (): Promise<FixtureEntry[]> => {
                loadCount += 1;
                if (loadCount === 1) {
                    return Promise.resolve([{ key: "doc", label: "旧标题", icon: "iconFile" }]);
                }
                return new Promise<FixtureEntry[]>((resolve) => {
                    resolveReload = resolve;
                });
            },
            build: (entries) => [{ key: "pages", entries }],
            open: () => undefined,
        });
        const runtime = createEntrySourceRuntime({
            source,
            initialSort: { field: "name", direction: "asc" },
        });

        await runtime.setActive(true);
        const reload = runtime.invalidate();
        await Promise.resolve();

        expect(runtime.state.snapshot).toMatchObject({
            status: "loading",
            sections: [{ entries: [{ label: "旧标题" }] }],
        });

        resolveReload([{ key: "doc", label: "新标题", icon: "iconFile" }]);
        await reload;

        expect(runtime.state.snapshot).toMatchObject({
            status: "ready",
            sections: [{ entries: [{ label: "新标题" }] }],
        });
    });

    it("已有列表刷新失败时保留旧数据", async () => {
        let loadCount = 0;
        const source = createEntrySource({
            sortFields: ["name"] as const,
            load: async () => {
                loadCount += 1;
                if (loadCount === 1) {
                    return [{ key: "doc", label: "旧标题", icon: "iconFile" }];
                }
                throw new Error("刷新失败");
            },
            build: (entries) => [{ key: "pages", entries }],
            open: () => undefined,
        });
        const runtime = createEntrySourceRuntime({
            source,
            initialSort: { field: "name", direction: "asc" },
        });

        await runtime.setActive(true);
        await runtime.invalidate();

        expect(runtime.state.snapshot).toMatchObject({
            status: "error",
            sections: [{ entries: [{ label: "旧标题" }] }],
            error: "刷新失败",
        });
    });

    it("不同标签页分别保留查询、排序和错误状态", async () => {
        const first = createFixture();
        const second = createFixture();
        const bookmarks = createEntrySourceRuntime({
            source: first.source,
            initialSort: { field: "updated", direction: "desc" },
        });
        const pages = createEntrySourceRuntime({
            source: second.source,
            initialSort: { field: "name", direction: "asc" },
        });

        bookmarks.setQuery("收藏");
        pages.setQuery("页面");
        await bookmarks.refresh();
        await pages.refresh();

        expect(bookmarks.state).toMatchObject({
            query: "收藏",
            sort: { field: "updated", direction: "desc" },
        });
        expect(pages.state).toMatchObject({
            query: "页面",
            sort: { field: "name", direction: "asc" },
        });
    });

    it("加载失败后只在用户重试时再次请求", async () => {
        vi.useFakeTimers();
        let attempts = 0;
        const source = createEntrySource({
            sortFields: ["name"] as const,
            load: async () => {
                attempts += 1;
                if (attempts === 1) {
                    throw new Error("暂时不可用");
                }
                return [];
            },
            build: () => [],
            open: () => undefined,
        });
        const runtime = createEntrySourceRuntime({
            source,
            initialSort: { field: "name", direction: "asc" },
        });

        await runtime.setActive(true);
        expect(runtime.state.snapshot).toMatchObject({ status: "error", error: "暂时不可用" });
        await vi.advanceTimersByTimeAsync(1000);
        expect(attempts).toBe(1);

        await runtime.invalidate();
        expect(attempts).toBe(1);
        expect(runtime.state.snapshot).toMatchObject({ status: "error", error: "暂时不可用" });

        await runtime.refresh();
        expect(attempts).toBe(2);
        expect(runtime.state.snapshot.status).toBe("ready");
    });

    it("手动刷新会取消尚未执行的防抖查询", async () => {
        vi.useFakeTimers();
        const fixture = createFixture();
        const runtime = createEntrySourceRuntime({
            source: fixture.source,
            initialSort: { field: "name", direction: "asc" },
        });

        runtime.setQuery("待刷新");
        await runtime.refresh();
        await vi.advanceTimersByTimeAsync(180);

        expect(fixture.loadCount()).toBe(1);
    });
});
