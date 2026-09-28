import { describe, expect, it, vi } from "vitest";

import { routeEntryMenuEvent, routeSectionMenuEvent } from "./entry-menu-event";

describe("条目菜单事件", () => {
    it.each([
        ["contextmenu", 40, 60, { x: 40, y: 60 }],
        ["click", 0, 0, { x: 10, y: 50, w: 20, h: 30 }],
    ])("%s 阻止默认行为并路由到同一个菜单回调", (type, clientX, clientY, position) => {
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const open = vi.fn();
        const entry = { key: "doc-id", label: "文档", icon: "iconFile" };
        const event = {
            type,
            clientX,
            clientY,
            preventDefault,
            stopPropagation,
            currentTarget: {
                getBoundingClientRect: () => ({ left: 10, bottom: 50, width: 20, height: 30 }),
            },
        } as unknown as MouseEvent;

        routeEntryMenuEvent(event, entry, open);

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith(entry, position);
    });
});

describe("分组菜单事件", () => {
    it("右键分组时阻止默认行为并传递鼠标位置", () => {
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const open = vi.fn();
        const section = { key: "收藏", label: "收藏", entries: [] };
        const event = {
            type: "contextmenu",
            clientX: 40,
            clientY: 60,
            preventDefault,
            stopPropagation,
            currentTarget: {},
        } as unknown as MouseEvent;

        routeSectionMenuEvent(event, section, open);

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith(section, { x: 40, y: 60 });
    });
});
