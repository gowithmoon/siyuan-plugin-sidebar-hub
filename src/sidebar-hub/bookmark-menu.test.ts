import { describe, expect, it, vi } from "vitest";

import { createBookmarkMenuActions } from "./bookmark-menu";
import { createPageDocumentMenuActions } from "./page-document-menu";

function createActions(readOnly = false) {
    const documentActions = createPageDocumentMenuActions({
        isReadOnly: () => readOnly,
        labels: { rename: "重命名", attributes: "属性", remove: "删除" },
        requestRename: vi.fn(),
        renameDocument: vi.fn(),
        loadAttributes: vi.fn(),
        openAttributes: vi.fn(),
        confirmRemove: vi.fn(),
        removeDocument: vi.fn(),
        applyChange: vi.fn(),
        reportError: vi.fn(),
    });
    return createBookmarkMenuActions({
        isReadOnly: () => readOnly,
        documentActions,
        labels: { attributes: "属性", removeBookmark: "移除书签" },
        loadAttributes: vi.fn(),
        openAttributes: vi.fn(),
        confirmRemoveBookmark: vi.fn(),
        removeBookmark: vi.fn(),
        onChanged: vi.fn(),
        reportError: vi.fn(),
    });
}

describe("书签条目菜单", () => {
    it("文档提供重命名、属性、移除书签和删除文档", () => {
        const actions = createActions().forEntry({ key: "doc", label: "文档", icon: "iconFile", blockType: "document" });
        expect(actions.map(({ id, warning }) => ({ id, warning }))).toEqual([
            { id: "rename", warning: undefined },
            { id: "attributes", warning: undefined },
            { id: "removeBookmark", warning: true },
            { id: "deleteDocument", warning: true },
        ]);
    });

    it("普通块只提供属性和移除书签", () => {
        const actions = createActions().forEntry({ key: "block", label: "块", icon: "iconBookmark", blockType: "block" });
        expect(actions.map(({ id, warning }) => ({ id, warning }))).toEqual([
            { id: "attributes", warning: undefined },
            { id: "removeBookmark", warning: true },
        ]);
    });

    it("只读时文档和普通块都只提供属性", () => {
        const actions = createActions(true);
        expect(actions.forEntry({ key: "doc", label: "文档", icon: "iconFile", blockType: "document" }).map(({ id }) => id))
            .toEqual(["attributes"]);
        expect(actions.forEntry({ key: "block", label: "块", icon: "iconBookmark", blockType: "block" }).map(({ id }) => id))
            .toEqual(["attributes"]);
    });

    it("文档属性动作沿用页面文档属性动作", async () => {
        const loadAttributes = vi.fn().mockResolvedValue({ bookmark: "收藏" });
        const openAttributes = vi.fn();
        const documentActions = createPageDocumentMenuActions({
            isReadOnly: () => false,
            labels: { rename: "重命名", attributes: "属性", remove: "删除" },
            requestRename: vi.fn(),
            renameDocument: vi.fn(),
            loadAttributes,
            openAttributes,
            confirmRemove: vi.fn(),
            removeDocument: vi.fn(),
            applyChange: vi.fn(),
            reportError: vi.fn(),
        });
        const actions = createBookmarkMenuActions({
            isReadOnly: () => false,
            documentActions,
            labels: { attributes: "属性", removeBookmark: "移除书签" },
            loadAttributes: vi.fn(),
            openAttributes: vi.fn(),
            confirmRemoveBookmark: vi.fn(),
            removeBookmark: vi.fn(),
            onChanged: vi.fn(),
            reportError: vi.fn(),
        }).forEntry({ key: "doc", label: "文档", icon: "iconFile", blockType: "document" });

        await actions.find(({ id }) => id === "attributes")!.execute();

        expect(loadAttributes).toHaveBeenCalledWith("doc");
        expect(openAttributes).toHaveBeenCalledWith({ bookmark: "收藏" });
    });

    it("移除书签只在确认后写空书签值并刷新", async () => {
        const confirmRemoveBookmark = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const removeBookmark = vi.fn();
        const onChanged = vi.fn();
        const configured = createBookmarkMenuActions({
            isReadOnly: () => false,
            documentActions: createPageDocumentMenuActions({
                isReadOnly: () => false,
                labels: { rename: "重命名", attributes: "属性", remove: "删除" },
                requestRename: vi.fn(), renameDocument: vi.fn(), loadAttributes: vi.fn(), openAttributes: vi.fn(),
                confirmRemove: vi.fn(), removeDocument: vi.fn(), applyChange: vi.fn(), reportError: vi.fn(),
            }),
            labels: { attributes: "属性", removeBookmark: "移除书签" },
            loadAttributes: vi.fn(), openAttributes: vi.fn(), confirmRemoveBookmark, removeBookmark, onChanged,
            reportError: vi.fn(),
        }).forEntry({ key: "block", label: "块", icon: "iconBookmark", blockType: "block" });

        await configured.find(({ id }) => id === "removeBookmark")!.execute();
        await configured.find(({ id }) => id === "removeBookmark")!.execute();

        expect(removeBookmark).toHaveBeenCalledOnce();
        expect(removeBookmark).toHaveBeenCalledWith("block");
        expect(onChanged).toHaveBeenCalledOnce();
    });
});
