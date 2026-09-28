import { describe, expect, it, vi } from "vitest";

import { createBookmarkGroupMenuActions } from "./bookmark-group-menu";

function createActions(overrides: Record<string, unknown> = {}) {
    return createBookmarkGroupMenuActions({
        isReadOnly: () => false,
        requestRename: vi.fn().mockResolvedValue("新名称"),
        renameBookmark: vi.fn(),
        confirmRemove: vi.fn().mockResolvedValue(true),
        removeBookmark: vi.fn(),
        onChanged: vi.fn(),
        reportError: vi.fn(),
        labels: { rename: "重命名", remove: "移除" },
        ...overrides,
    });
}

describe("书签分组菜单", () => {
    it("可写分组提供重命名和危险移除", () => {
        const actions = createActions().forGroup({ key: "收藏", label: "收藏", entries: [] });

        expect(actions.map(({ id, warning }) => ({ id, warning }))).toEqual([
            { id: "rename", warning: undefined },
            { id: "remove", warning: true },
        ]);
    });

    it("只读分组不提供修改动作", () => {
        const actions = createActions({ isReadOnly: () => true }).forGroup({ key: "收藏", label: "收藏", entries: [] });

        expect(actions).toEqual([]);
    });

    it("重命名会去除首尾空白并刷新，取消或同名不写入", async () => {
        const requestRename = vi.fn()
            .mockResolvedValueOnce(" 新收藏 ")
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce("收藏");
        const renameBookmark = vi.fn();
        const onChanged = vi.fn();
        const actions = createActions({ requestRename, renameBookmark, onChanged });
        const group = { key: "收藏", label: "收藏", entries: [] };

        await actions.forGroup(group)[0].execute();
        await actions.forGroup(group)[0].execute();
        await actions.forGroup(group)[0].execute();

        expect(renameBookmark).toHaveBeenCalledOnce();
        expect(renameBookmark).toHaveBeenCalledWith("收藏", "新收藏");
        expect(onChanged).toHaveBeenCalledOnce();
    });

    it("移除只有确认后才清理整个书签值并刷新", async () => {
        const confirmRemove = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const removeBookmark = vi.fn();
        const onChanged = vi.fn();
        const actions = createActions({ confirmRemove, removeBookmark, onChanged });
        const group = { key: "收藏", label: "收藏", entries: [] };

        await actions.forGroup(group)[1].execute();
        await actions.forGroup(group)[1].execute();

        expect(removeBookmark).toHaveBeenCalledOnce();
        expect(removeBookmark).toHaveBeenCalledWith("收藏");
        expect(onChanged).toHaveBeenCalledOnce();
    });

    it("原生操作失败时报告错误且不刷新", async () => {
        const error = new Error("操作失败");
        const reportError = vi.fn();
        const onChanged = vi.fn();
        const actions = createActions({
            renameBookmark: vi.fn().mockRejectedValue(error),
            reportError,
            onChanged,
        });

        await actions.forGroup({ key: "收藏", label: "收藏", entries: [] })[0].execute();

        expect(reportError).toHaveBeenCalledWith(error);
        expect(onChanged).not.toHaveBeenCalled();
    });
});
