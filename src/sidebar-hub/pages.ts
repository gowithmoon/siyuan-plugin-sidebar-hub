import type {
    EntrySource,
    EntrySourceQuery,
    EntrySourceSection,
    EntrySourceSnapshot,
} from "./entry-source";

export type PageSortField = "name" | "created" | "updated";

export const PAGE_SORT_FIELDS: readonly PageSortField[] = ["name", "created", "updated"];

export interface PageNotebook {
    id: string;
    name: string;
    closed: boolean;
}

export interface PageDocument {
    id: string;
    path: string;
    name: string;
    subFileCount: number;
    created: number;
    updated: number;
}

interface PageDependencies {
    listNotebooks: () => Promise<PageNotebook[]>;
    listDocuments: (notebookId: string, path: string) => Promise<PageDocument[]>;
    getBlockAttrs: (ids: string[]) => Promise<Record<string, Record<string, string>>>;
    getDocRefCounts?: (ids: string[]) => Promise<Record<string, number>>;
    open: (documentId: string) => Promise<void> | void;
}

interface PageRecord extends PageDocument {
    notebookName: string;
}

export function createPageSource(dependencies: PageDependencies): EntrySource<PageSortField> {
    let cached: PageRecord[] | undefined;
    let generation = 0;
    let queryVersion = 0;
    let snapshot: EntrySourceSnapshot = { status: "idle", sections: [] };
    let countCache = new Map<string, number>();
    let countGeneration = -1;
    let currentInput: EntrySourceQuery<PageSortField> | undefined;
    let currentUpdate: ((snapshot: EntrySourceSnapshot) => void) | undefined;
    let countEnabled = true;
    let hasSuccessfulSnapshot = false;

    return {
        sortFields: PAGE_SORT_FIELDS,
        get snapshot() {
            return snapshot;
        },
        async query(input, onUpdate) {
            const requestVersion = ++queryVersion;
            currentInput = input;
            currentUpdate = onUpdate;
            if (cached) {
                snapshot = { status: "ready", sections: buildPageSections(cached, input, countCache) };
                onUpdate?.(snapshot);
                startCounts(cached, generation);
                return snapshot;
            }

            const requestedGeneration = generation;
            const previousSections = snapshot.sections;
            const retainPreviousSections = hasSuccessfulSnapshot;
            const records: PageRecord[] = [];
            let scanned = 0;
            snapshot = { status: "loading", sections: previousSections, progress: { current: 0 } };
            onUpdate?.(snapshot);

            const publishProgress = () => {
                if (requestVersion !== queryVersion || requestedGeneration !== generation) {
                    return;
                }
                snapshot = {
                    status: "loading",
                    sections: retainPreviousSections ? previousSections : buildPageSections(records, input, countCache),
                    progress: { current: scanned },
                };
                onUpdate?.(snapshot);
            };

            try {
                const notebooks = (await dependencies.listNotebooks()).filter((notebook) => !notebook.closed);
                for (const notebook of notebooks) {
                    await scanPath(notebook, "/");
                }

                if (requestVersion !== queryVersion || requestedGeneration !== generation) {
                    return snapshot;
                }
                cached = records;
                snapshot = {
                    status: "ready",
                    sections: buildPageSections(records, input, countCache),
                    progress: { current: scanned },
                };
                hasSuccessfulSnapshot = true;
                onUpdate?.(snapshot);
                startCounts(records, requestedGeneration);
            } catch (error) {
                if (requestVersion === queryVersion && requestedGeneration === generation) {
                    snapshot = {
                        status: "error",
                        sections: retainPreviousSections ? previousSections : [],
                        error: error instanceof Error && error.message ? error.message : "Unable to load pages",
                    };
                    onUpdate?.(snapshot);
                }
            }
            return snapshot;

            async function scanPath(notebook: PageNotebook, path: string): Promise<boolean> {
                const documents = await dependencies.listDocuments(notebook.id, path);
                const attributes = documents.length > 0
                    ? await dependencies.getBlockAttrs(documents.map((document) => document.id))
                    : {};
                let pathContainsDailyNote = false;

                for (const document of documents) {
                    const descendantContainsDailyNote = document.subFileCount > 0
                        ? await scanPath(notebook, document.path)
                        : false;
                    const isDailyNote = Object.keys(attributes[document.id] ?? {})
                        .some((name) => name.startsWith("custom-dailynote-"));

                    scanned += 1;
                    if (isDailyNote || descendantContainsDailyNote) {
                        pathContainsDailyNote = true;
                    } else {
                        records.push({ ...document, notebookName: notebook.name });
                    }
                    publishProgress();
                }
                return pathContainsDailyNote;
            }
        },
        open(key) {
            return dependencies.open(key);
        },
        invalidate() {
            generation += 1;
            queryVersion += 1;
            cached = undefined;
            countCache = new Map();
            countGeneration = -1;
            snapshot = { status: "idle", sections: hasSuccessfulSnapshot ? snapshot.sections : [] };
        },
        setCountEnabled(enabled) {
            countEnabled = enabled;
            if (countEnabled && cached && currentInput && snapshot.status === "ready") {
                snapshot = {
                    ...snapshot,
                    sections: buildPageSections(cached, currentInput, countCache),
                };
                currentUpdate?.(snapshot);
            }
            if (countEnabled && cached) {
                startCounts(cached, generation);
            }
        },
    };

    function startCounts(records: PageRecord[], requestedGeneration: number) {
        if (!countEnabled || !dependencies.getDocRefCounts || countGeneration === requestedGeneration) {
            return;
        }
        countGeneration = requestedGeneration;
        void loadCounts(records, requestedGeneration);
    }

    async function loadCounts(records: PageRecord[], requestedGeneration: number) {
        if (!dependencies.getDocRefCounts) {
            return;
        }
        try {
            const counts = await dependencies.getDocRefCounts(records.map((record) => record.id));
            if (requestedGeneration !== generation) {
                return;
            }
            for (const [id, count] of Object.entries(counts)) {
                countCache.set(id, count);
            }
            if (countEnabled && cached && currentInput && snapshot.status === "ready") {
                snapshot = {
                    ...snapshot,
                    sections: buildPageSections(cached, currentInput, countCache),
                };
                currentUpdate?.(snapshot);
            }
        } catch {
            // 失败的页面计数保持未知状态，不影响页面列表。
        }
    }
}

function buildPageSections(
    records: PageRecord[],
    input: EntrySourceQuery<PageSortField>,
    counts: ReadonlyMap<string, number>,
): EntrySourceSection[] {
    const keywords = input.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const direction = input.sort.direction === "asc" ? 1 : -1;
    const entries = records
        .filter((record) => matchesKeywords(`${record.name} ${record.notebookName}`, keywords))
        .sort((left, right) => comparePages(left, right, input.sort.field) * direction)
        .map((record) => ({
            key: record.id,
            label: record.name || record.id,
            icon: "iconFile",
            count: counts.get(record.id),
            countable: true,
        }));

    return entries.length > 0 ? [{ key: "pages", entries }] : [];
}

function comparePages(left: PageRecord, right: PageRecord, field: PageSortField) {
    if (field === "name") {
        return compareText(left.name, right.name);
    }
    return left[field] - right[field] || compareText(left.name, right.name);
}

function matchesKeywords(value: string, keywords: string[]) {
    const normalized = value.toLocaleLowerCase();
    return keywords.every((keyword) => normalized.includes(keyword));
}

function compareText(left: string, right: string) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}
