import {
    createEntrySource,
    type EntrySource,
    type EntrySourceQuery,
    type EntrySourceSection,
} from "./entry-source";

export type DatabaseSortField = "name";

export const DATABASE_SORT_FIELDS: readonly DatabaseSortField[] = ["name"];

export interface DatabaseSearchResult {
    avID: string;
    avName: string;
    blockID: string;
    hPath: string;
    viewID: string;
    viewName: string;
    viewLayout: string;
    children?: Array<DatabaseSearchResult | null> | null;
}

interface DatabaseOpenOptions {
    app: unknown;
    doc: {
        id: string;
        action?: string[];
    };
}

interface DatabaseDependencies {
    load: () => Promise<DatabaseSearchResult[]>;
    count?: (avID: string) => Promise<number>;
    open: (blockId: string) => Promise<void> | void;
}

interface DatabaseRecord {
    key: string;
    label: string;
    icon: string;
    avID: string;
}

export function createDatabaseSource(dependencies: DatabaseDependencies): EntrySource<DatabaseSortField> {
    return createEntrySource({
        sortFields: DATABASE_SORT_FIELDS,
        load: dependencies.load,
        build: buildDatabaseSections,
        loadCounts: dependencies.count
            ? (results, onCount) => loadDatabaseCounts(results, dependencies.count!, onCount)
            : undefined,
        open: dependencies.open,
    });
}

export async function openDatabaseWithFallback(
    app: unknown,
    blockId: string,
    open: (options: DatabaseOpenOptions) => Promise<unknown>,
) {
    try {
        await open({
            app,
            doc: {
                id: blockId,
                action: ["cb-get-context", "cb-get-rootscroll", "cb-get-av-no-create"],
            },
        });
    } catch {
        await open({ app, doc: { id: blockId } });
    }
}

function buildDatabaseSections(
    results: DatabaseSearchResult[],
    input: EntrySourceQuery<DatabaseSortField>,
    counts: ReadonlyMap<string, number>,
): EntrySourceSection[] {
    const keywords = input.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const direction = input.sort.direction === "asc" ? 1 : -1;
    const entries = aggregateDatabases(results)
        .filter((database) => matchesKeywords(database.label, keywords))
        .sort((left, right) => compareText(left.label, right.label) * direction)
        .map(({ key, label, icon }) => ({ key, label, icon, count: counts.get(key), countable: true }));

    return entries.length > 0 ? [{ key: "databases", entries }] : [];
}

function aggregateDatabases(results: DatabaseSearchResult[]): DatabaseRecord[] {
    const records = new Map<string, DatabaseRecord>();
    for (const result of flattenResults(results)) {
        if (!result.avID || records.has(result.avID)) {
            continue;
        }

        records.set(result.avID, {
            key: result.blockID,
            label: result.avName || result.avID,
            icon: "iconDatabase",
            avID: result.avID,
        });
    }
    return [...records.values()];
}

async function loadDatabaseCounts(
    results: DatabaseSearchResult[],
    count: (avID: string) => Promise<number>,
    onCount: (key: string, count: number) => void,
) {
    const queue = [...aggregateDatabases(results)];
    const worker = async () => {
        while (queue.length > 0) {
            const record = queue.shift();
            if (!record) {
                return;
            }
            try {
                onCount(record.key, await count(record.avID));
            } catch {
                // 单个数据库计数失败时保留未知状态，并继续处理其他数据库。
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
}

function flattenResults(results: DatabaseSearchResult[]): DatabaseSearchResult[] {
    return results.flatMap((result) => [result, ...flattenResults(result.children?.filter(isResult) ?? [])]);
}

function isResult(value: DatabaseSearchResult | null): value is DatabaseSearchResult {
    return value !== null;
}

function matchesKeywords(value: string, keywords: string[]) {
    const normalized = value.toLocaleLowerCase();
    return keywords.every((keyword) => normalized.includes(keyword));
}

function compareText(left: string, right: string) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}
