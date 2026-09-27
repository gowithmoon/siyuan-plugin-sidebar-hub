import { describe, expect, it } from "vitest";

import {
    createFixedVirtualList,
    VIRTUAL_LIST_OVERSCAN,
    VIRTUAL_LIST_ROW_HEIGHT,
} from "./fixed-virtual-list";

const keys = (count: number, prefix = "item") => Array.from({ length: count }, (_, index) => `${prefix}-${index}`);

describe("固定行高虚拟列表", () => {
    it("空列表没有可挂载行或占位高度", () => {
        const list = createFixedVirtualList();

        list.setViewportHeight(310);
        const window = list.setItems([]);

        expect(window).toEqual({
            scrollTop: 0,
            totalHeight: 0,
            startIndex: 0,
            endIndex: 0,
            paddingTop: 0,
        });
    });

    it("在列表首部和尾部将窗口钳制到有效边界", () => {
        const list = createFixedVirtualList();
        list.setItems(keys(100));
        list.setViewportHeight(VIRTUAL_LIST_ROW_HEIGHT * 2);

        expect(list.window).toMatchObject({
            startIndex: 0,
            endIndex: 2 + VIRTUAL_LIST_OVERSCAN,
            paddingTop: 0,
        });

        const atEnd = list.setScrollTop(Number.POSITIVE_INFINITY);
        expect(atEnd).toMatchObject({
            scrollTop: VIRTUAL_LIST_ROW_HEIGHT * 98,
            startIndex: 98 - VIRTUAL_LIST_OVERSCAN,
            endIndex: 100,
        });
    });

    it("只挂载可见行及上下各八行 overscan", () => {
        const list = createFixedVirtualList();
        list.setItems(keys(100));
        list.setViewportHeight(VIRTUAL_LIST_ROW_HEIGHT * 3);

        const window = list.setScrollTop(VIRTUAL_LIST_ROW_HEIGHT * 20);

        expect(window).toMatchObject({
            startIndex: 20 - VIRTUAL_LIST_OVERSCAN,
            endIndex: 23 + VIRTUAL_LIST_OVERSCAN,
            paddingTop: VIRTUAL_LIST_ROW_HEIGHT * 12,
        });
        expect(window.endIndex - window.startIndex).toBe(3 + VIRTUAL_LIST_OVERSCAN * 2);
    });

    it("视口尺寸变化时重算窗口并钳制底部位置", () => {
        const list = createFixedVirtualList();
        list.setItems(keys(20));
        list.setViewportHeight(VIRTUAL_LIST_ROW_HEIGHT * 2);
        list.setScrollTop(Number.POSITIVE_INFINITY);

        const resized = list.setViewportHeight(VIRTUAL_LIST_ROW_HEIGHT * 5);

        expect(resized.scrollTop).toBe(VIRTUAL_LIST_ROW_HEIGHT * 15);
        expect(resized.endIndex).toBe(20);
    });

    it("查询或排序改变时可显式回到顶部", () => {
        const list = createFixedVirtualList();
        list.setItems(keys(100));
        list.setViewportHeight(VIRTUAL_LIST_ROW_HEIGHT * 4);
        list.setScrollTop(VIRTUAL_LIST_ROW_HEIGHT * 40 + 7);

        const reset = list.resetScroll();

        expect(reset).toMatchObject({ scrollTop: 0, startIndex: 0 });
    });

    it("数据更新后按首个可见条目的 key 和行内偏移恢复锚点", () => {
        const list = createFixedVirtualList();
        list.setItems(keys(30));
        list.setViewportHeight(VIRTUAL_LIST_ROW_HEIGHT * 4);
        list.setScrollTop(VIRTUAL_LIST_ROW_HEIGHT * 10 + 9);

        const restored = list.setItems(["inserted", ...keys(30)]);

        expect(restored.scrollTop).toBe(VIRTUAL_LIST_ROW_HEIGHT * 11 + 9);
    });

    it("锚点被删除时回退到原索引附近并保持有效滚动位置", () => {
        const list = createFixedVirtualList();
        list.setItems(keys(30));
        list.setViewportHeight(VIRTUAL_LIST_ROW_HEIGHT * 4);
        list.setScrollTop(VIRTUAL_LIST_ROW_HEIGHT * 10 + 9);

        const withoutAnchor = keys(30).filter((key) => key !== "item-10");
        const restored = list.setItems(withoutAnchor);

        expect(withoutAnchor[10]).toBe("item-11");
        expect(restored.scrollTop).toBe(VIRTUAL_LIST_ROW_HEIGHT * 10 + 9);

        const shortened = list.setItems(keys(2, "replacement"));
        expect(shortened.scrollTop).toBe(0);
        expect(shortened.endIndex).toBe(2);
    });
});
