import { confirm, Dialog, openAttributePanel, openTab, type App } from "siyuan";

import { request } from "../api";

interface ApiDocInfo {
    id: string;
    refCount: number;
}

interface ApiDocumentAttributes {
    ial?: Record<string, string> | null;
}

export async function loadPageDocRefCounts(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) {
        return {};
    }
    const response = await request<Array<ApiDocInfo | null>>("/api/block/getDocsInfo", {
        ids,
        refCount: true,
        av: false,
    });
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load page reference counts");
    }
    return Object.fromEntries((response.data ?? []).flatMap((info) => info ? [[info.id, info.refCount]] : []));
}

export async function openPage(app: App, documentId: string) {
    await openTab({ app, doc: { id: documentId } });
}

export async function renamePageDocument(documentId: string, title: string) {
    const response = await request<null>("/api/filetree/renameDocByID", { id: documentId, title });
    if (!response.ok) {
        throw new Error(response.raw.msg);
    }
}

export async function loadPageDocumentAttributes(documentId: string): Promise<Record<string, string>> {
    const response = await request<ApiDocumentAttributes>("/api/block/getDocInfo", { id: documentId });
    if (!response.ok) {
        throw new Error(response.raw.msg);
    }
    return response.data?.ial ?? {};
}

export function openPageDocumentAttributes(attributes: Record<string, string>) {
    openAttributePanel({ data: attributes, focusName: "bookmark" });
}

export async function removePageDocument(documentId: string) {
    const response = await request<null>("/api/filetree/removeDocByID", { id: documentId });
    if (!response.ok) {
        throw new Error(response.raw.msg);
    }
}

export function requestPageDocumentRename(initialTitle: string): Promise<string | null> {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (value: string | null) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
        };
        const finish = (value: string | null) => {
            settle(value);
            dialog.destroy();
        };
        const dialog = new Dialog({
            title: window.siyuan.languages.rename,
            content: `<div class="b3-dialog__content">
    <input class="b3-text-field fn__block" maxlength="512">
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" type="button">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" type="button">${window.siyuan.languages.confirm}</button>
            </div>`,
            width: "520px",
            destroyCallback: () => settle(null),
        });
        const input = dialog.element.querySelector<HTMLInputElement>("input")!;
        const [cancelButton, confirmButton] = dialog.element.querySelectorAll<HTMLButtonElement>("button");
        input.value = initialTitle;
        cancelButton.addEventListener("click", () => finish(null));
        confirmButton.addEventListener("click", () => finish(input.value));
        dialog.bindInput(input, () => finish(input.value));
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    });
}

export function confirmPageDocumentRemoval(title: string): Promise<boolean> {
    const escapedTitle = escapeHtml(title);
    const message = window.siyuan.languages.confirmDeleteTip
        .replace("${x}", escapedTitle);
    return new Promise((resolve) => {
        confirm(
            window.siyuan.languages.deleteOpConfirm,
            message,
            () => resolve(true),
            () => resolve(false),
        );
    });
}

function escapeHtml(value: string) {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
}
