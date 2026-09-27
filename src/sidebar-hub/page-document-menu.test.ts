import { describe, expect, it, vi } from "vitest";

import { createPageDocumentMenuActions } from "./page-document-menu";

describe("页面文档菜单动作", () => {
    it("可写工作区显示重命名、属性和警告删除，只读工作区只显示属性", () => {
        let readOnly = false;
        const actions = createPageDocumentMenuActions({
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

        expect(actions.forDocument({ id: "doc-id", title: "文档" }).map(({ id, warning }) => ({ id, warning })))
            .toEqual([
                { id: "rename", warning: undefined },
                { id: "attributes", warning: undefined },
                { id: "remove", warning: true },
            ]);

        readOnly = true;
        expect(actions.forDocument({ id: "doc-id", title: "文档" }).map(({ id }) => id))
            .toEqual(["attributes"]);
    });

    it("重命名成功后应用局部变更，取消、空白或未变化名称不发请求", async () => {
        const requestRename = vi.fn()
            .mockResolvedValueOnce(" 新名称 ")
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce("   ")
            .mockResolvedValueOnce("文档");
        const renameDocument = vi.fn();
        const applyChange = vi.fn();
        const actions = createActions({ requestRename, renameDocument, applyChange });
        const document = { id: "doc-id", title: "文档" };

        for (let attempt = 0; attempt < 4; attempt += 1) {
            await action(actions, "rename", document).execute();
        }

        expect(requestRename).toHaveBeenCalledTimes(4);
        expect(renameDocument).toHaveBeenCalledOnce();
        expect(renameDocument).toHaveBeenCalledWith("doc-id", "新名称");
        expect(applyChange).toHaveBeenCalledWith({ kind: "rename", id: "doc-id", title: "新名称" });
    });

    it("提交包含路径分隔符或控制字符的名称时保留原名称", async () => {
        const renameDocument = vi.fn();
        const reportError = vi.fn();
        const actions = createActions({
            requestRename: vi.fn().mockResolvedValue("含/斜杠\n名称"),
            renameDocument,
            reportError,
        });

        await action(actions, "rename").execute();

        expect(renameDocument).not.toHaveBeenCalled();
        expect(reportError).toHaveBeenCalledWith(expect.any(Error));
    });

    it("属性动作加载文档属性并交给思源原生属性面板", async () => {
        const attributes = { title: "文档", custom: "值" };
        const loadAttributes = vi.fn().mockResolvedValue(attributes);
        const openAttributes = vi.fn();
        const actions = createActions({ loadAttributes, openAttributes });

        await action(actions, "attributes").execute();

        expect(loadAttributes).toHaveBeenCalledWith("doc-id");
        expect(openAttributes).toHaveBeenCalledWith(attributes);
    });

    it("删除仅在确认后按文档 ID 请求，并在成功后应用局部变更", async () => {
        const confirmRemove = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const removeDocument = vi.fn();
        const applyChange = vi.fn();
        const actions = createActions({ confirmRemove, removeDocument, applyChange });
        const document = { id: "doc-id", title: "文档" };

        await action(actions, "remove", document).execute();
        expect(removeDocument).not.toHaveBeenCalled();

        await action(actions, "remove", document).execute();
        expect(confirmRemove).toHaveBeenCalledWith(document);
        expect(removeDocument).toHaveBeenCalledWith("doc-id");
        expect(applyChange).toHaveBeenCalledWith({ kind: "remove", ids: ["doc-id"] });
    });

    it.each([
        ["rename", { requestRename: vi.fn().mockResolvedValue("新名称"), renameDocument: failing() }],
        ["attributes", { loadAttributes: failing() }],
        ["remove", { confirmRemove: vi.fn().mockResolvedValue(true), removeDocument: failing() }],
    ] as const)("%s 失败时提示错误且不应用变更", async (id, overrides) => {
        const reportError = vi.fn();
        const applyChange = vi.fn();
        const actions = createActions({ ...overrides, reportError, applyChange });

        await expect(action(actions, id).execute()).resolves.toBeUndefined();

        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "操作失败" }));
        expect(applyChange).not.toHaveBeenCalled();
    });
});

function failing() {
    return vi.fn().mockRejectedValue(new Error("操作失败"));
}

function createActions(overrides: Record<string, unknown> = {}) {
    return createPageDocumentMenuActions({
        isReadOnly: () => false,
        labels: { rename: "重命名", attributes: "属性", remove: "删除" },
        requestRename: vi.fn(),
        renameDocument: vi.fn(),
        loadAttributes: vi.fn(),
        openAttributes: vi.fn(),
        confirmRemove: vi.fn(),
        removeDocument: vi.fn(),
        applyChange: vi.fn(),
        reportError: vi.fn(),
        ...overrides,
    });
}

function action(
    actions: ReturnType<typeof createPageDocumentMenuActions>,
    id: "rename" | "attributes" | "remove",
    document = { id: "doc-id", title: "文档" },
) {
    return actions.forDocument(document).find((item) => item.id === id)!;
}
