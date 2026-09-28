import { confirm, openAttributePanel, openTab, type App } from "siyuan";

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
