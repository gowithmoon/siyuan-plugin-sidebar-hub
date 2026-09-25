import { confirm, openTab, type App } from "siyuan";

import { currentAppId, request } from "../api";
import type {
    DailyNoteDocument,
    DailyNoteNotebook,
    DailyNoteNotebookConfig,
} from "./daily-notes";

interface ListNotebooksResponse {
    notebooks?: Array<ApiNotebook | null> | null;
}

interface ApiNotebook {
    id: string;
    name: string;
    closed: boolean;
}

interface NotebookConfigResponse {
    conf?: {
        dailyNoteSavePath?: string;
    } | null;
}

interface ListDocumentsResponse {
    files?: Array<ApiDocument | null> | null;
}

interface ApiDocument {
    id: string;
    path: string;
    name: string;
    subFileCount: number;
}

interface CreateDailyNoteResponse {
    id: string;
}

export async function loadDailyNotebooks(): Promise<DailyNoteNotebook[]> {
    const response = await request<ListNotebooksResponse>("/api/notebook/lsNotebooks", {});
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load notebooks");
    }
    return (response.data?.notebooks ?? []).flatMap((notebook) => notebook
        ? [{ id: notebook.id, name: notebook.name, closed: notebook.closed }]
        : []);
}

export async function loadDailyNotebookConfig(notebookId: string): Promise<DailyNoteNotebookConfig> {
    const response = await request<NotebookConfigResponse>("/api/notebook/getNotebookConf", {
        notebook: notebookId,
    });
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load notebook configuration");
    }
    return { dailyNoteSavePath: response.data?.conf?.dailyNoteSavePath ?? "" };
}

export async function loadDailyNoteDocuments(
    notebookId: string,
    path: string,
): Promise<DailyNoteDocument[]> {
    const response = await request<ListDocumentsResponse>("/api/filetree/listDocsByPath", {
        notebook: notebookId,
        path,
        app: currentAppId(),
        maxListCount: 0,
        ignoreMaxListHint: true,
    });
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load daily notes");
    }
    return (response.data?.files ?? []).flatMap((document) => document
        ? [{
            id: document.id,
            path: document.path,
            name: document.name,
            subFileCount: document.subFileCount,
        }]
        : []);
}

export async function loadDailyNoteBlockAttrs(ids: string[]): Promise<Record<string, Record<string, string>>> {
    const response = await request<Record<string, Record<string, string> | null>>(
        "/api/attr/batchGetBlockAttrs",
        { ids },
    );
    if (!response.ok) {
        throw new Error(response.raw.msg || "Unable to load daily note attributes");
    }
    return Object.fromEntries(
        Object.entries(response.data ?? {}).map(([id, attrs]) => [id, attrs ?? {}]),
    );
}

export function confirmDailyNoteCreation(title: string, message: string): Promise<boolean> {
    return new Promise((resolve) => {
        confirm(title, message, () => resolve(true), () => resolve(false));
    });
}

export async function createTodayDailyNote(notebookId: string): Promise<string> {
    const response = await request<CreateDailyNoteResponse>("/api/filetree/createDailyNote", {
        notebook: notebookId,
        app: currentAppId(),
    });
    if (!response.ok || !response.data?.id) {
        throw new Error(response.raw.msg || "Unable to create daily note");
    }
    return response.data.id;
}

export async function openDailyNote(app: App, documentId: string) {
    await openTab({ app, doc: { id: documentId } });
}
