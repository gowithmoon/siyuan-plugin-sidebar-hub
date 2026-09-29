import { confirm, openTab, type App } from "siyuan";

import { currentAppId, request } from "../api";
import type { DailyNoteNotebookConfig } from "./daily-notes";

interface NotebookConfigResponse {
    conf?: {
        dailyNoteSavePath?: string;
    } | null;
}

interface CreateDailyNoteResponse {
    id: string;
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
