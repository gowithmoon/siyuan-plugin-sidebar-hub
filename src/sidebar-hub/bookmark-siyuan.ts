import { openTab, type App } from "siyuan";

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
