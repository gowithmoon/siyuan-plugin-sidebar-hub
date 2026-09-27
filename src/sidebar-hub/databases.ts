import {
    createEntrySource,
    type EntrySource,
    type EntrySourceQuery,
    type EntrySourceSection,
} from "./entry-source";

export type DatabaseSortField = "name" | "created" | "updated";

export const DATABASE_SORT_FIELDS: readonly DatabaseSortField[] = ["name", "created", "updated"];

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
    created?: string;
    updatedRank: number;
}

export function createDatabaseSource(dependencies: DatabaseDependencies): EntrySource<DatabaseSortField> {
    return createEntrySource({
        sortFields: DATABASE_SORT_FIELDS,
        load: dependencies.load,
        build: buildDatabaseSections,
        loadCount: dependencies.count
            ? (results, key) => loadDatabaseCount(results, key, dependencies.count!)
            : undefined,
        countConcurrency: 4,
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
        .sort((left, right) => compareDatabases(left, right, input.sort.field) * direction)
        .map(({ key, label, icon }) => ({ key, label, icon, count: counts.get(key), countable: true }));

    return entries.length > 0 ? [{ key: "databases", entries }] : [];
}

function aggregateDatabases(results: DatabaseSearchResult[]): DatabaseRecord[] {
    const records = new Map<string, DatabaseRecord>();
    for (const [updatedRank, result] of flattenResults(results).entries()) {
        if (!result.avID || records.has(result.avID)) {
            continue;
        }

        records.set(result.avID, {
            key: result.blockID,
            label: result.avName || result.avID,
            icon: "iconDatabase",
            avID: result.avID,
            created: databaseCreatedKey(result.avID),
            updatedRank,
        });
    }
    return [...records.values()];
}

function compareDatabases(left: DatabaseRecord, right: DatabaseRecord, field: DatabaseSortField) {
    if (field === "created") {
        if (left.created === undefined || right.created === undefined) {
            if (left.created === right.created) {
                return compareText(left.label, right.label);
            }
            return left.created === undefined ? -1 : 1;
        }
        return compareText(left.created, right.created) || compareText(left.label, right.label);
    }
    if (field === "updated") {
        return right.updatedRank - left.updatedRank || compareText(left.label, right.label);
    }
    return compareText(left.label, right.label);
}

function databaseCreatedKey(avID: string) {
    return /^(\d{14})/.exec(avID)?.[1];
}

async function loadDatabaseCount(
    results: DatabaseSearchResult[],
    key: string,
    count: (avID: string) => Promise<number>,
) {
    const record = aggregateDatabases(results).find((candidate) => candidate.key === key);
    return record ? count(record.avID) : undefined;
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
