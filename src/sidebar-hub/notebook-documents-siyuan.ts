import { currentAppId, request } from "../api";
import type {
    Notebook,
    NotebookDocument,
    NotebookDocumentAdapter,
} from "./notebook-documents";

interface SiyuanNotebookDocument extends NotebookDocument {
    created: number;
    updated: number;
}

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

export const notebookDocumentAdapter: NotebookDocumentAdapter<SiyuanNotebookDocument> = {
    listNotebooks,
    listDocuments,
    getBlockAttrs,
};

async function listNotebooks(): Promise<Notebook[]> {
    const response = await request<ListNotebooksResponse>("/api/notebook/lsNotebooks", {});
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load notebooks");
    }
    return (response.data?.notebooks ?? []).flatMap((notebook) => notebook
        ? [{ id: notebook.id, name: notebook.name, closed: notebook.closed }]
        : []);
}

async function listDocuments(notebookId: string, path: string): Promise<SiyuanNotebookDocument[]> {
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

async function getBlockAttrs(ids: string[]): Promise<Record<string, Record<string, string>>> {
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
