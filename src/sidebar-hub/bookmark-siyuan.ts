import { confirm, Dialog, openAttributePanel, openTab, type App } from "siyuan";

import { request } from "../api";
import type { BookmarkGroup } from "./bookmarks";

export async function loadBookmarkGroups(): Promise<BookmarkGroup[]> {
    const response = await request<BookmarkGroup[]>("/api/bookmark/getBookmark", {});
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load bookmarks");
    }
    return response.data ?? [];
}

export async function openBookmark(app: App, blockId: string) {
    await openTab({
        app,
        doc: {
            id: blockId,
            action: ["cb-get-hl", "cb-get-context", "cb-get-rootscroll"],
        },
    });
}

export async function loadBookmarkBlockAttributes(blockId: string): Promise<Record<string, string>> {
    const response = await request<Record<string, string>>("/api/attr/getBlockAttrs", { id: blockId });
    if (!response.ok) {
        throw new Error(response.raw.msg);
    }
    return response.data ?? {};
}

export async function setBlockBookmarks(ids: string[], bookmark: string) {
    const response = await request<null>("/api/attr/batchSetBlockAttrs", {
        blockAttrs: ids.map((id) => ({ id, attrs: { bookmark } })),
    });
    if (!response.ok) {
        throw new Error(response.raw.msg);
    }
}

export async function renameBookmark(oldBookmark: string, newBookmark: string) {
    const response = await request<null>("/api/bookmark/renameBookmark", {
        oldBookmark,
        newBookmark,
    });
    if (!response.ok) {
        throw new Error(response.raw.msg);
    }
}

export async function removeBookmark(bookmark: string) {
    const response = await request<null>("/api/bookmark/removeBookmark", { bookmark });
    if (!response.ok) {
        throw new Error(response.raw.msg);
    }
}

export function requestBookmarkRename(initialName: string): Promise<string | null> {
    return new Promise((resolve) => {
        let settled = false;
        const settle = (value: string | null) => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(value);
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
        input.value = initialName;
        cancelButton.addEventListener("click", () => {
            settle(null);
            dialog.destroy();
        });
        confirmButton.addEventListener("click", () => {
            settle(input.value);
            dialog.destroy();
        });
        dialog.bindInput(input, () => {
            settle(input.value);
            dialog.destroy();
        });
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    });
}

export function openBookmarkBlockAttributes(attributes: Record<string, string>) {
    openAttributePanel({ data: attributes, focusName: "bookmark" });
}

export function confirmBookmarkRemoval(title: string): Promise<boolean> {
    const element = document.createElement("span");
    element.textContent = title;
    return new Promise((resolve) => {
        confirm(
            window.siyuan.languages.deleteOpConfirm,
            window.siyuan.languages.removeBookmark.replace("${x}", `<b>${element.innerHTML}</b>`),
            () => resolve(true),
            () => resolve(false),
        );
    });
}
