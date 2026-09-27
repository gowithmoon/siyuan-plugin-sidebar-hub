import { confirm, Dialog, openAttributePanel, openTab, type App } from "siyuan";

import { currentAppId, request } from "../api";
import type { PageDocument, PageNotebook } from "./pages";

interface ListNotebooksResponse {
    notebooks?: Array<ApiNotebook | null> | null;
}

interface ApiNotebook {
    id: string;
    name: string;
    closed: boolean;
}

interface ListDocumentsResponse {
    files?: Array<ApiDocument | null> | null;
}

interface ApiDocument {
    id: string;
    path: string;
    name: string;
    subFileCount: number;
    ctime: number;
    mtime: number;
}

interface ApiDocInfo {
    id: string;
    refCount: number;
}

interface ApiDocumentAttributes {
    ial?: Record<string, string> | null;
}

export async function loadPageNotebooks(): Promise<PageNotebook[]> {
    const response = await request<ListNotebooksResponse>("/api/notebook/lsNotebooks", {});
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load notebooks");
    }
    return (response.data?.notebooks ?? []).flatMap((notebook) => notebook
        ? [{ id: notebook.id, name: notebook.name, closed: notebook.closed }]
        : []);
}

export async function loadPageDocuments(notebookId: string, path: string): Promise<PageDocument[]> {
    const response = await request<ListDocumentsResponse>("/api/filetree/listDocsByPath", {
        notebook: notebookId,
        path,
        app: currentAppId(),
        maxListCount: 0,
        ignoreMaxListHint: true,
    });
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load documents");
    }
    return (response.data?.files ?? []).flatMap((document) => document
        ? [{
            id: document.id,
            path: document.path,
            name: document.name,
            subFileCount: document.subFileCount,
            created: document.ctime,
            updated: document.mtime,
        }]
        : []);
}

export async function loadPageBlockAttrs(ids: string[]): Promise<Record<string, Record<string, string>>> {
    const response = await request<Record<string, Record<string, string> | null>>(
        "/api/attr/batchGetBlockAttrs",
        { ids },
    );
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load document attributes");
    }
    return Object.fromEntries(
        Object.entries(response.data ?? {}).map(([id, attrs]) => [id, attrs ?? {}]),
    );
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
