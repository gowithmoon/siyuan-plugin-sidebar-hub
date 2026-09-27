import { describe, expect, it, vi } from "vitest";

import { routeEntryMenuEvent } from "./entry-menu-event";

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
