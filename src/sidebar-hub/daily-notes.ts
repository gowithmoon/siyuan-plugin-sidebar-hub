export interface DailyNoteNotebook {
    id: string;
    name: string;
    closed: boolean;
}

export interface DailyNoteNotebookConfig {
    dailyNoteSavePath: string;
}

export interface DailyNotebookOption {
    id: string;
    name: string;
    dailyNoteSavePath: string;
}

export interface DailyNoteDocument {
    id: string;
    path: string;
    name: string;
    subFileCount: number;
}

export interface DailyNoteMonth {
    year: number;
    month: number;
    dates: Record<string, string>;
}

export type DailyNoteOpenResult = "opened" | "cancelled" | "created";
export type DailyNoteDirection = "previous" | "next";
export type DailyNoteErrorCode =
    | "notebook-unconfigured"
    | "notebook-closed"
    | "date-creation-unsupported"
    | "no-adjacent-note";

interface DailyNotebookDependencies {
    listNotebooks: () => Promise<DailyNoteNotebook[]>;
    getNotebookConfig: (notebookId: string) => Promise<DailyNoteNotebookConfig>;
}

interface DailyNoteDependencies extends DailyNotebookDependencies {
    selectedNotebookId: () => string;
    listDocuments: (notebookId: string, path: string) => Promise<DailyNoteDocument[]>;
    getBlockAttrs: (ids: string[]) => Promise<Record<string, Record<string, string>>>;
    confirmCreate: (date: string) => Promise<boolean>;
    createToday: (notebookId: string) => Promise<string>;
    open: (documentId: string) => Promise<void> | void;
    today: () => string;
}

export interface DailyNoteNavigator {
    loadMonth(year: number, month: number): Promise<DailyNoteMonth>;
    refreshMonth(year: number, month: number): Promise<DailyNoteMonth>;
    openDate(date: string): Promise<DailyNoteOpenResult>;
    openAdjacentDate(date: string, direction: DailyNoteDirection): Promise<string>;
    invalidate(): void;
}

export class DailyNoteNavigationError extends Error {
    constructor(readonly code: DailyNoteErrorCode) {
        super(code);
        this.name = "DailyNoteNavigationError";
    }
}

export async function loadDailyNotebookOptions(
    dependencies: DailyNotebookDependencies,
): Promise<DailyNotebookOption[]> {
    const notebooks = (await dependencies.listNotebooks()).filter((notebook) => !notebook.closed);
    const options: DailyNotebookOption[] = [];

    for (const notebook of notebooks) {
        const config = await dependencies.getNotebookConfig(notebook.id);
        if (config.dailyNoteSavePath) {
            options.push({ ...notebook, dailyNoteSavePath: config.dailyNoteSavePath });
        }
    }
    return options.map(({ id, name, dailyNoteSavePath }) => ({ id, name, dailyNoteSavePath }));
}

export function createDailyNoteNavigator(dependencies: DailyNoteDependencies): DailyNoteNavigator {
    let indexedNotebookId = "";
    let dateIndex: Record<string, string> | undefined;
    let indexGeneration = 0;

    const navigator: DailyNoteNavigator = {
        async loadMonth(year, month) {
            const notebookId = await requireAvailableNotebook();
            const index = await loadIndex(notebookId);
            const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
            return {
                year,
                month,
                dates: Object.fromEntries(Object.entries(index).filter(([date]) => date.startsWith(monthPrefix))),
            };
        },
        async refreshMonth(year, month) {
            navigator.invalidate();
            return navigator.loadMonth(year, month);
        },
        async openDate(date) {
            const notebookId = await requireAvailableNotebook();
            const index = await loadIndex(notebookId);
            const existing = index[date];
            if (existing) {
                await dependencies.open(existing);
                return "opened";
            }
            if (date !== dependencies.today()) {
                throw new DailyNoteNavigationError("date-creation-unsupported");
            }
            if (!await dependencies.confirmCreate(date)) {
                return "cancelled";
            }

            const documentId = await dependencies.createToday(notebookId);
            index[date] = documentId;
            await dependencies.open(documentId);
            return "created";
        },
        async openAdjacentDate(date, direction) {
            const notebookId = await requireAvailableNotebook();
            const index = await loadIndex(notebookId);
            const adjacent = Object.keys(index)
                .filter((candidate) => direction === "previous" ? candidate < date : candidate > date)
                .sort((left, right) => direction === "previous" ? right.localeCompare(left) : left.localeCompare(right))[0];
            if (!adjacent) {
                throw new DailyNoteNavigationError("no-adjacent-note");
            }
            await dependencies.open(index[adjacent]);
            return adjacent;
        },
        invalidate() {
            indexGeneration += 1;
            indexedNotebookId = "";
            dateIndex = undefined;
        },
    };
    return navigator;

    async function requireAvailableNotebook() {
        const selectedNotebookId = dependencies.selectedNotebookId();
        if (!selectedNotebookId) {
            throw new DailyNoteNavigationError("notebook-unconfigured");
        }
        const notebook = (await dependencies.listNotebooks()).find((candidate) => candidate.id === selectedNotebookId);
        if (!notebook || notebook.closed) {
            throw new DailyNoteNavigationError("notebook-closed");
        }
        const config = await dependencies.getNotebookConfig(selectedNotebookId);
        if (!config.dailyNoteSavePath) {
            throw new DailyNoteNavigationError("notebook-unconfigured");
        }
        return selectedNotebookId;
    }

    async function loadIndex(notebookId: string) {
        if (dateIndex && indexedNotebookId === notebookId) {
            return dateIndex;
        }

        const generation = indexGeneration;
        const nextIndex: Record<string, string> = {};
        await scanPath("/");
        if (generation !== indexGeneration) {
            return loadIndex(notebookId);
        }
        indexedNotebookId = notebookId;
        dateIndex = nextIndex;
        return nextIndex;

        async function scanPath(path: string): Promise<void> {
            const documents = await dependencies.listDocuments(notebookId, path);
            const attributes = documents.length > 0
                ? await dependencies.getBlockAttrs(documents.map((document) => document.id))
                : {};
            for (const document of documents) {
                for (const attribute of Object.keys(attributes[document.id] ?? {})) {
                    const match = /^custom-dailynote-(\d{4})(\d{2})(\d{2})$/.exec(attribute);
                    if (match) {
                        nextIndex[`${match[1]}-${match[2]}-${match[3]}`] ??= document.id;
                    }
                }
                if (document.subFileCount > 0) {
                    await scanPath(document.path);
                }
            }
        }
    }
}
