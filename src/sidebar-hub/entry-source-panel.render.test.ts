import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

import EntrySourcePanel from "./entry-source-panel.svelte";
import type { EntrySource } from "./entry-source";

const translations = {
    searchPlaceholder: "搜索",
    sortLabel: "排序",
    sortAscending: "升序",
    sortDescending: "降序",
    refresh: "刷新",
    retry: "重试",
    loading: "加载中",
    empty: "暂无内容",
    noMatches: "无匹配项",
    loadError: "加载失败",
    openError: "打开失败",
    sortOptions: { name: "名称" },
};

function createSource(): EntrySource<string> {
    const snapshot = {
        status: "ready" as const,
        sections: [{
            key: "group",
            label: "长名称分组",
            countable: true,
            count: 0,
            entries: [{
                key: "entry",
                label: "很长的条目名称",
                icon: "iconFile",
                countable: true,
            }],
        }],
    };

    return {
        sortFields: ["name"],
        snapshot,
        query: vi.fn().mockResolvedValue(snapshot),
        open: vi.fn(),
        invalidate: vi.fn(),
        setCountTargets: vi.fn(),
    };
}

describe("条目来源面板", () => {
    it("为配置了拖拽类型的条目标记可拖拽语义", () => {
        const { body } = render(EntrySourcePanel, {
            props: {
                source: createSource(),
                translations,
                emptyIcon: "iconFile",
                active: false,
                initialSort: { field: "name", direction: "asc" },
                onSortChange: vi.fn(),
                dragKind: "block",
            },
        });

        expect(body).toMatch(/<button[^>]*draggable="true"[^>]*>/);
    });

    it("保留更多按钮的菜单语义但不显示视觉 tooltip", () => {
        const { body } = render(EntrySourcePanel, {
            props: {
                source: createSource(),
                translations,
                emptyIcon: "iconFile",
                active: false,
                initialSort: { field: "name", direction: "asc" },
                onSortChange: vi.fn(),
                entryMenuLabel: "更多",
                onEntryMenu: vi.fn(),
                sectionMenuLabel: "更多",
                onSectionMenu: vi.fn(),
            },
        });

        const menuButtons = [...body.matchAll(/<button[^>]*class="([^"]*sidebar-hub__entry-menu[^"]*)"[^>]*>/g)];
        expect(menuButtons).toHaveLength(2);
        for (const [button, classes] of menuButtons) {
            expect(button).toContain("aria-haspopup=\"menu\"");
            expect(button).toContain("aria-label=\"更多：");
            expect(classes.split(/\s+/)).not.toContain("ariaLabel");
            expect(button).not.toContain("data-position=");
        }
        expect(body).toMatch(/class="[^"]*ariaLabel[^"]*"[^>]*aria-label="刷新"/);
    });

    it("将更多按钮放在条目和分组计数的左侧", () => {
        const { body } = render(EntrySourcePanel, {
            props: {
                source: createSource(),
                translations,
                emptyIcon: "iconFile",
                active: false,
                initialSort: { field: "name", direction: "asc" },
                onSortChange: vi.fn(),
                entryMenuLabel: "更多",
                onEntryMenu: vi.fn(),
                sectionMenuLabel: "更多",
                onSectionMenu: vi.fn(),
            },
        });

        const sectionRow = body.match(/<div[^>]*class="sidebar-hub__section-row"[^>]*>([\s\S]*?)<\/div>/)?.[1];
        const entryRow = body.match(/<div[^>]*class="sidebar-hub__entry-row"[^>]*>([\s\S]*?)<\/div>/)?.[1];
        expect(sectionRow).toBeDefined();
        expect(entryRow).toBeDefined();

        for (const row of [sectionRow!, entryRow!]) {
            expect(row.indexOf("sidebar-hub__entry-menu"))
                .toBeLessThan(row.indexOf("sidebar-hub__entry-count"));
        }
        expect(sectionRow).toContain('sidebar-hub__entry-count">0</span>');
        expect(entryRow).toContain('sidebar-hub__entry-count">…</span>');
    });
});
