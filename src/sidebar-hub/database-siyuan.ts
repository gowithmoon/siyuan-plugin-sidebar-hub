import { openTab, type App } from "siyuan";

import { request } from "../api";
import { loadDatabaseBatches } from "./database-pagination";
import { openDatabaseWithFallback, type DatabaseSearchResult } from "./databases";

interface SearchAttributeViewResponse {
    results?: Array<ApiDatabaseSearchResult | null> | null;
}

interface PrimaryKeyValuesResponse {
    total?: number;
}

interface ApiDatabaseSearchResult {
    avID: string;
    avName: string;
    blockID: string;
    hPath: string;
    viewID: string;
    viewName: string;
    viewLayout: string;
    children?: Array<ApiDatabaseSearchResult | null> | null;
}

export async function loadDatabases(): Promise<DatabaseSearchResult[]> {
    return loadDatabaseBatches(async (excludes) => {
        const response = await request<SearchAttributeViewResponse>("/api/av/searchAttributeView", {
            keyword: "",
            excludes,
            includeViewMatches: true,
        });
        if (!response.ok) {
            throw new Error(response.raw.msg || "Unable to load databases");
        }

        return (response.data?.results ?? []).flatMap((result) => {
            const normalized = normalizeResult(result);
            return normalized ? [normalized] : [];
        });
    });
}

export async function loadDatabaseCount(avID: string): Promise<number> {
    const response = await request<PrimaryKeyValuesResponse>("/api/av/getAttributeViewPrimaryKeyValues", {
        id: avID,
        page: 1,
        pageSize: 1,
    });
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load database count");
    }
    return response.data?.total ?? 0;
}

export async function openDatabase(app: App, blockId: string) {
    await openDatabaseWithFallback(app, blockId, (options) => openTab(options as Parameters<typeof openTab>[0]));
}

function normalizeResult(result: ApiDatabaseSearchResult | null): DatabaseSearchResult | undefined {
    if (!result) {
        return undefined;
    }

    return {
        avID: result.avID,
        avName: result.avName,
        blockID: result.blockID,
        hPath: result.hPath,
        viewID: result.viewID,
        viewName: result.viewName,
        viewLayout: result.viewLayout,
        children: (result.children ?? []).flatMap((child) => {
            const normalized = normalizeResult(child);
            return normalized ? [normalized] : [];
        }),
    };
}
