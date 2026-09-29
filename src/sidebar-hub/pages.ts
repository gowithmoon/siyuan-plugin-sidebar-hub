import type {
    EntrySource,
    EntrySourceQuery,
    EntrySourceSection,
    EntrySourceSnapshot,
} from "./entry-source";
import {
    isDailyNote,
    scanOpenNotebookDocuments,
    type Notebook,
    type NotebookDocument,
    type NotebookDocumentAdapter,
    type ScannedNotebookDocument,
} from "./notebook-documents";

export type PageSortField = "name" | "created" | "updated";

export const PAGE_SORT_FIELDS: readonly PageSortField[] = ["name", "created", "updated"];

const PAGE_SCAN_PROGRESS_INTERVAL_MS = 100;
const PAGE_COUNT_BATCH_SIZE = 64;
const PAGE_COUNT_REFRESH_DEBOUNCE_MS = 500;

export type PageNotebook = Notebook;
export interface PageDocument extends NotebookDocument {
    created: number;
    updated: number;
}

export type PageSourceChange =
    | { kind: "saved"; id: string; updated?: number }
    | { kind: "rename"; id: string; title: string }
    | { kind: "remove"; ids: string[] }
    | {
        kind: "move";
        fromNotebook: string;
        fromPath: string;
        toNotebook: string;
        newPath: string;
    };

export interface PageSource extends EntrySource<PageSortField> {
    applyChange: (change: PageSourceChange) => boolean;
    setFilter: (filter: PageFilter) => void;
    dispose: () => void;
}

export interface PageFilter {
    excludeDailyNotes: boolean;
    notebookIds: readonly string[];
}

interface PageDependencies extends NotebookDocumentAdapter<PageDocument> {
    getDocRefCounts?: (ids: string[]) => Promise<Record<string, number>>;
    open: (documentId: string) => Promise<void> | void;
}

interface PageRecord extends PageDocument {
    notebookId: string;
    notebookName: string;
    hidden: boolean;
}

interface KnownDocument {
    id: string;
    path: string;
    notebookId: string;
    daily: boolean;
    hidden: boolean;
}

export function createPageSource(dependencies: PageDependencies): PageSource {
    let cached: PageRecord[] | undefined;
    let knownDocuments = new Map<string, KnownDocument>();
    let dailyPaths = new Set<string>();
    let removedDocumentIds = new Set<string>();
    let generation = 0;
    let queryVersion = 0;
    let snapshot: EntrySourceSnapshot = { status: "idle", sections: [] };
    let countCache = new Map<string, number>();
    let countTargets = new Set<string>();
    let countAttempted = new Set<string>();
    let countRequestActive = false;
    let countGeneration = 0;
    let countRefreshTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let currentInput: EntrySourceQuery<PageSortField> | undefined;
    let currentUpdate: ((snapshot: EntrySourceSnapshot) => void) | undefined;
    let hasSuccessfulSnapshot = false;
    let filter: PageFilter = { excludeDailyNotes: true, notebookIds: [] };

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
                snapshot = {
                    status: "ready",
                    sections: buildPageSections(cached, input, countCache, filter),
                    totalCount: countPages(cached, filter),
                };
                onUpdate?.(snapshot);
                startTargetCounts();
                return snapshot;
            }

            const requestedGeneration = generation;
            const previousSections = snapshot.sections;
            const retainPreviousSections = hasSuccessfulSnapshot;
            const records: PageRecord[] = [];
            const nextKnownDocuments = new Map<string, KnownDocument>();
            const nextDailyPaths = new Set<string>();
            let scanned = 0;
            let lastProgressAt = Date.now();
            snapshot = { status: "loading", sections: previousSections, progress: { current: 0 } };
            onUpdate?.(snapshot);

            const publishProgress = () => {
                if (requestVersion !== queryVersion || requestedGeneration !== generation) {
                    return;
                }
                const now = Date.now();
                if (now - lastProgressAt < PAGE_SCAN_PROGRESS_INTERVAL_MS) {
                    return;
                }
                lastProgressAt = now;
                snapshot = {
                    status: "loading",
                    sections: previousSections,
                    progress: { current: scanned },
                };
                onUpdate?.(snapshot);
            };

            try {
                const notebooks = await scanOpenNotebookDocuments(dependencies, (current) => {
                    scanned = current;
                    publishProgress();
                });
                for (const { notebook, documents } of notebooks) {
                    appendPageRecords(
                        documents,
                        notebook,
                        records,
                        nextKnownDocuments,
                        nextDailyPaths,
                    );
                }

                if (requestVersion !== queryVersion || requestedGeneration !== generation) {
                    return snapshot;
                }
                cached = records;
                knownDocuments = nextKnownDocuments;
                dailyPaths = nextDailyPaths;
                removedDocumentIds = new Set();
                snapshot = {
                    status: "ready",
                    sections: buildPageSections(records, input, countCache, filter),
                    totalCount: countPages(records, filter),
                    progress: { current: scanned },
                };
                hasSuccessfulSnapshot = true;
                onUpdate?.(snapshot);
                startTargetCounts();
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
        },
        open(key) {
            return dependencies.open(key);
        },
        setFilter(nextFilter) {
            filter = {
                excludeDailyNotes: nextFilter.excludeDailyNotes,
                notebookIds: [...new Set(nextFilter.notebookIds.filter(Boolean))],
            };
            publishCachedSnapshot();
        },
        applyChange(change) {
            if (disposed) {
                return true;
            }
            if (change.kind === "saved") {
                const record = cached?.find((candidate) => candidate.id === change.id);
                if (record && change.updated !== undefined && record.updated !== change.updated) {
                    record.updated = change.updated;
                    if (currentInput?.sort.field === "updated") {
                        const nextSections = buildPageSections(cached!, currentInput, countCache, filter);
                        if (!sameEntryOrder(snapshot.sections, nextSections)) {
                            publishCachedSnapshot(nextSections);
                        }
                    }
                }
                scheduleCountRefresh();
                return true;
            }

            if (!cached) {
                return true;
            }

            if (change.kind === "rename") {
                const record = cached.find((candidate) => candidate.id === change.id);
                if (!record) {
                    return true;
                }
                record.name = change.title;
                publishCachedSnapshot();
                return true;
            }

            if (change.kind === "remove") {
                const ids = [...new Set(change.ids.filter(Boolean))];
                if (ids.length === 0) {
                    return false;
                }
                if (ids.every((id) => removedDocumentIds.has(id))) {
                    return true;
                }
                const documents = ids.map((id) => knownDocuments.get(id));
                if (documents.some((document, index) => !document && !removedDocumentIds.has(ids[index]))) {
                    return false;
                }
                if (documents.some((document) => document?.daily)) {
                    return false;
                }
                const rootDocuments = documents.filter((document): document is KnownDocument => Boolean(document));
                const removed = new Set(ids);
                for (const [id, document] of knownDocuments) {
                    if (rootDocuments.some((root) => root.notebookId === document.notebookId
                        && isDescendantPath(document.path, root.path))) {
                        if (document.daily) {
                            return false;
                        }
                        removed.add(id);
                    }
                }
                cached = cached.filter((record) => !removed.has(record.id));
                for (const id of removed) {
                    knownDocuments.delete(id);
                    removedDocumentIds.add(id);
                    countCache.delete(id);
                }
                publishCachedSnapshot();
                return true;
            }

            if (change.fromNotebook !== change.toNotebook) {
                return false;
            }
            const id = documentIdFromPath(change.fromPath);
            if (!id || id !== documentIdFromPath(change.newPath)) {
                return false;
            }
            const known = knownDocuments.get(id);
            const record = cached.find((candidate) => candidate.id === id);
            if (known?.path === change.newPath && record?.path === change.newPath) {
                return true;
            }
            if (!known || !record || known.hidden || record.notebookId !== change.fromNotebook
                || record.path !== change.fromPath || isDailyRelatedPath(change.newPath)) {
                return false;
            }
            record.path = change.newPath;
            known.path = change.newPath;
            publishCachedSnapshot();
            return true;
        },
        invalidate() {
            generation += 1;
            countGeneration += 1;
            clearTimeout(countRefreshTimer);
            countRefreshTimer = undefined;
            queryVersion += 1;
            cached = undefined;
            knownDocuments = new Map();
            dailyPaths = new Set();
            removedDocumentIds = new Set();
            countCache = new Map();
            countAttempted = new Set();
            snapshot = {
                status: "idle",
                sections: hasSuccessfulSnapshot ? snapshot.sections : [],
                totalCount: hasSuccessfulSnapshot ? snapshot.totalCount : undefined,
            };
        },
        dispose() {
            disposed = true;
            generation += 1;
            countGeneration += 1;
            clearTimeout(countRefreshTimer);
            countRefreshTimer = undefined;
        },
        setCountTargets(keys) {
            countTargets = new Set(keys);
            startTargetCounts();
        },
    };

    function publishCachedSnapshot(nextSections?: EntrySourceSection[]) {
        if (!cached || !currentInput) {
            return;
        }
        snapshot = {
            ...snapshot,
            status: "ready",
            sections: nextSections ?? buildPageSections(cached, currentInput, countCache, filter),
            totalCount: countPages(cached, filter),
            progress: undefined,
            error: undefined,
        };
        currentUpdate?.(snapshot);
    }

    function isDailyRelatedPath(path: string) {
        return [...dailyPaths].some((dailyPath) =>
            path === dailyPath || isDescendantPath(path, dailyPath) || isDescendantPath(dailyPath, path));
    }

    function startTargetCounts() {
        if (disposed || countRefreshTimer !== undefined || !dependencies.getDocRefCounts || !cached || countRequestActive) {
            return;
        }

        const availableIds = new Set(cached.map((record) => record.id));
        const batch: string[] = [];
        for (const key of countTargets) {
            if (availableIds.has(key) && !countCache.has(key) && !countAttempted.has(key)) {
                countAttempted.add(key);
                batch.push(key);
                if (batch.length === PAGE_COUNT_BATCH_SIZE) {
                    break;
                }
            }
        }
        if (batch.length === 0) {
            return;
        }

        countRequestActive = true;
        void loadCountBatch(batch, generation, countGeneration);
    }

    async function loadCountBatch(ids: string[], requestedGeneration: number, requestedCountGeneration: number) {
        if (disposed || !dependencies.getDocRefCounts) {
            return;
        }
        try {
            const counts = await dependencies.getDocRefCounts(ids);
            if (disposed || requestedGeneration !== generation || requestedCountGeneration !== countGeneration) {
                return;
            }
            for (const id of ids) {
                if (Object.prototype.hasOwnProperty.call(counts, id)) {
                    countCache.set(id, counts[id]);
                }
            }
            if (cached && currentInput && snapshot.status === "ready") {
                snapshot = {
                    ...snapshot,
                    sections: buildPageSections(cached, currentInput, countCache, filter),
                    totalCount: countPages(cached, filter),
                };
                currentUpdate?.(snapshot);
            }
        } catch {
            // 失败的页面计数在当前 generation 保持未知状态且不自动重试。
        } finally {
            countRequestActive = false;
            startTargetCounts();
        }
    }

    function scheduleCountRefresh() {
        if (disposed || !dependencies.getDocRefCounts || !cached) {
            return;
        }
        clearTimeout(countRefreshTimer);
        countRefreshTimer = setTimeout(() => {
            countRefreshTimer = undefined;
            countGeneration += 1;
            countCache = new Map();
            countAttempted = new Set();
            if (cached && currentInput && snapshot.status === "ready" && countTargets.size > 0) {
                publishCachedSnapshot();
            }
            startTargetCounts();
        }, PAGE_COUNT_REFRESH_DEBOUNCE_MS);
    }
}

function appendPageRecords(
    documents: ScannedNotebookDocument<PageDocument>[],
    notebook: PageNotebook,
    records: PageRecord[],
    knownDocuments: Map<string, KnownDocument>,
    dailyPaths: Set<string>,
): boolean {
    let pathContainsDailyNote = false;
    for (const scanned of documents) {
        const descendantContainsDailyNote = appendPageRecords(
            scanned.children,
            notebook,
            records,
            knownDocuments,
            dailyPaths,
        );
        const daily = isDailyNote(scanned.attributes);
        const hidden = daily || descendantContainsDailyNote;
        const document = scanned.document;
        knownDocuments.set(document.id, {
            id: document.id,
            path: document.path,
            notebookId: notebook.id,
            daily,
            hidden,
        });
        if (daily) {
            dailyPaths.add(document.path);
        }
        if (hidden) {
            pathContainsDailyNote = true;
        }
        records.push({
            ...document,
            notebookId: notebook.id,
            notebookName: notebook.name,
            hidden,
        });
    }
    return pathContainsDailyNote;
}

function sameEntryOrder(left: EntrySourceSection[], right: EntrySourceSection[]) {
    const leftKeys = left.flatMap((section) => section.entries.map((entry) => entry.key));
    const rightKeys = right.flatMap((section) => section.entries.map((entry) => entry.key));
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index]);
}

function documentIdFromPath(path: string) {
    const match = /\/([^/]+)\.sy$/.exec(path);
    return match?.[1];
}

function isDescendantPath(path: string, ancestor: string) {
    return path.startsWith(`${ancestor}/`);
}

function buildPageSections(
    records: PageRecord[],
    input: EntrySourceQuery<PageSortField>,
    counts: ReadonlyMap<string, number>,
    filter: PageFilter,
): EntrySourceSection[] {
    const keywords = input.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const direction = input.sort.direction === "asc" ? 1 : -1;
    const entries = filterPageRecords(records, filter)
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

function countPages(records: PageRecord[], filter: PageFilter) {
    return filterPageRecords(records, filter).length;
}

function filterPageRecords(records: PageRecord[], filter: PageFilter) {
    return records
        .filter((record) => !filter.excludeDailyNotes || !record.hidden)
        .filter((record) => filter.notebookIds.length === 0 || filter.notebookIds.includes(record.notebookId));
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
