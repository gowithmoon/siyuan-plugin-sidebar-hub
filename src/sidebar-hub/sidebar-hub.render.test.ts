import { render } from "svelte/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import SidebarHub from "./sidebar-hub.svelte";
import { DEFAULT_PREFERENCES } from "./preferences";

const panelTranslations = {
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
    sortOptions: { name: "名称", count: "计数", updated: "更新时间", created: "创建时间" },
};

const translations = {
    title: "侧边栏中枢",
    calendar: "日历",
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    today: "今天",
    year: "年份",
    month: "月份",
    yearUnit: "年",
    monthUnit: "月",
    previousYears: "上一组年份",
    nextYears: "下一组年份",
    previousDay: "上一天",
    nextDay: "下一天",
    noPreviousDailyNote: "没有更早的日记",
    noNextDailyNote: "没有更晚的日记",
    dailyNoteExists: "已有日记",
    createDailyNoteTitle: "创建日记",
    createDailyNoteMessage: "创建 {date} 的日记？",
    dailyNotebookRequired: "请选择日记笔记本",
    dailyNotebookClosed: "日记笔记本已关闭",
    dateCreationUnsupported: "只能创建今天的日记",
    dailyNoteLoadError: "日记加载失败",
    dailyNoteOpenError: "日记打开失败",
    tabs: {
        bookmarks: "书签",
        tags: "标签",
        databases: "数据库",
        pages: "页面",
    },
    bookmarks: { ...panelTranslations, groupLabel: "书签分组" },
    tags: {
        ...panelTranslations,
        expandAll: "全部展开",
        collapseAll: "全部折叠",
        expandNode: "展开",
        collapseNode: "折叠",
    },
    databases: panelTranslations,
    pages: { ...panelTranslations, progress: "加载进度", actionError: "操作失败" },
};

describe("日历面板导航", () => {
    beforeAll(() => {
        vi.stubGlobal("window", {
            siyuan: {
                config: { readonly: false, system: { workspaceDir: "/workspace" } },
                languages: {
                    attr: "属性",
                    default: "默认",
                    delete: "删除",
                    remove: "移除",
                    rename: "重命名",
                },
            },
        });
    });

    afterAll(() => vi.unstubAllGlobals());

    it("保留三个日期导航按钮并移除独立最小化按钮", () => {
        const { body } = render(SidebarHub, {
            props: {
                app: {} as never,
                preferences: DEFAULT_PREFERENCES,
                translations,
                instanceId: "test-instance",
                onActiveTabChange: vi.fn(),
                onSortChange: vi.fn(),
                onBookmarkCollapsedChange: vi.fn(),
                onTagCollapsedChange: vi.fn(),
            },
        });

        const previousIndex = body.indexOf('aria-label="上一天"');
        const todayIndex = body.indexOf('aria-label="今天"');
        const nextIndex = body.indexOf('aria-label="下一天"');
        expect(previousIndex).toBeGreaterThan(-1);
        expect(previousIndex).toBeLessThan(todayIndex);
        expect(todayIndex).toBeLessThan(nextIndex);
        for (const label of ["上一天", "今天", "下一天"]) {
            expect(body).toMatch(new RegExp(`class="[^"]*ariaLabel[^"]*"[^>]*data-position="south"[^>]*aria-label="${label}"`));
        }
        expect(body).not.toContain('data-type="min"');
        expect(body).not.toContain('aria-label="最小化"');
    });
});
