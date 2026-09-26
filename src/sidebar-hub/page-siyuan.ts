import { openTab, type App } from "siyuan";

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
