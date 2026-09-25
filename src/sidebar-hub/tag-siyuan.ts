import { openTab, type App } from "siyuan";

import { currentAppId, request } from "../api";
import { tagSearchKeyword, type TagNode } from "./tags";

interface ApiTagNode {
    name: string;
    label: string;
    count: number;
    children: Array<ApiTagNode | null> | null;
}

export async function loadTags(): Promise<TagNode[]> {
    const sort = typeof window !== "undefined" ? window.siyuan?.config?.tag?.sort ?? 4 : 4;
    const response = await request<ApiTagNode[]>("/api/tag/getTag", {
        app: currentAppId(),
        ignoreMaxListHint: true,
        sort,
    });
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load tags");
    }

    return (response.data ?? []).flatMap((tag) => {
        const normalized = normalizeTag(tag);
        return normalized ? [normalized] : [];
    });
}

export async function openTag(app: App, label: string) {
    await openTab({
        app,
        search: buildTagSearch(label),
    });
}

function normalizeTag(tag: ApiTagNode | null): TagNode | undefined {
    if (!tag) {
        return undefined;
    }

    const name = tag.name || tag.label.split("/").pop() || tag.label;
    return {
        name,
        label: tag.label,
        count: tag.count ?? 0,
        children: (tag.children ?? []).flatMap((child) => {
            const normalized = normalizeTag(child);
            return normalized ? [normalized] : [];
        }),
    };
}

function buildTagSearch(label: string): NonNullable<Parameters<typeof openTab>[0]["search"]> {
    const stored = typeof window !== "undefined" ? window.siyuan?.storage?.["local-searchdata"] : undefined;
    const base = stored && typeof stored === "object"
        ? JSON.parse(JSON.stringify(stored)) as Record<string, unknown>
        : {};

    return {
        ...base,
        hasReplace: false,
        hPath: "",
        idPath: [],
        k: tagSearchKeyword(label),
        method: 0,
        page: 1,
        r: "",
    };
}
