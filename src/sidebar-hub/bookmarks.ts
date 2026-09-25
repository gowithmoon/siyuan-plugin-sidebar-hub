export type BookmarkSortField = "name" | "created" | "updated";
export type SortDirection = "asc" | "desc";

export const BOOKMARK_SORT_FIELDS: readonly BookmarkSortField[] = ["name", "created", "updated"];

export interface BookmarkSort {
    field: BookmarkSortField;
    direction: SortDirection;
}

export interface BookmarkBlock {
    id: string;
    rootID: string;
    content: string;
    name?: string;
    hPath?: string;
    created: string;
    updated: string;
    type: string;
}

export interface BookmarkGroup {
    name: string;
    blocks: BookmarkBlock[];
}

export interface BookmarkEntry {
    id: string;
    rootID: string;
    label: string;
    created: string;
    updated: string;
}

export interface BookmarkViewGroup {
    name: string;
    entries: BookmarkEntry[];
}

interface BookmarkNavigatorDependencies {
    load: () => Promise<BookmarkGroup[]>;
    open: (blockId: string) => Promise<void> | void;
}

interface BookmarkQuery {
    query: string;
    sort: BookmarkSort;
}

export function createBookmarkNavigator(dependencies: BookmarkNavigatorDependencies) {
    let cachedGroups: BookmarkGroup[] | undefined;
    let loadingGroups: Promise<BookmarkGroup[]> | undefined;
    let cacheVersion = 0;

    async function getGroups() {
        if (!cachedGroups) {
            const requestedVersion = cacheVersion;
            loadingGroups ??= dependencies.load();
            try {
                const loadedGroups = await loadingGroups;
                if (requestedVersion === cacheVersion) {
                    cachedGroups = loadedGroups;
                }
                return loadedGroups;
            } finally {
                if (requestedVersion === cacheVersion) {
                    loadingGroups = undefined;
                }
            }
        }
        return cachedGroups;
    }

    return {
        async query(input: BookmarkQuery): Promise<BookmarkViewGroup[]> {
            const groups = await getGroups();
            return filterAndSortBookmarks(groups, input);
        },
        async open(entry: BookmarkEntry) {
            await dependencies.open(entry.id);
        },
        invalidate() {
            cacheVersion += 1;
            cachedGroups = undefined;
            loadingGroups = undefined;
        },
    };
}

function filterAndSortBookmarks(groups: BookmarkGroup[], input: BookmarkQuery): BookmarkViewGroup[] {
    const keywords = input.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const direction = input.sort.direction === "asc" ? 1 : -1;

    return groups
        .map((group) => {
            const entries = (group.blocks ?? []).map(toBookmarkEntry);
            const groupMatches = matchesKeywords(group.name, keywords);
            const visibleEntries = groupMatches
                ? entries
                : entries.filter((entry) => matchesKeywords(entry.label, keywords));

            return {
                name: group.name,
                entries: visibleEntries.sort((left, right) =>
                    compareEntries(left, right, input.sort.field) * direction,
                ),
            };
        })
        .filter((group) => group.entries.length > 0)
        .sort((left, right) => compareText(left.name, right.name));
}

function toBookmarkEntry(block: BookmarkBlock): BookmarkEntry {
    return {
        id: block.id,
        rootID: block.rootID,
        label: plainText(block.content) || block.name || block.hPath || block.id,
        created: block.created,
        updated: block.updated,
    };
}

function matchesKeywords(value: string, keywords: string[]) {
    const normalized = value.toLocaleLowerCase();
    return keywords.every((keyword) => normalized.includes(keyword));
}

function compareEntries(left: BookmarkEntry, right: BookmarkEntry, field: BookmarkSortField) {
    if (field === "name") {
        return compareText(left.label, right.label);
    }

    const byTimestamp = left[field].localeCompare(right[field]);
    return byTimestamp || compareText(left.label, right.label);
}

function compareText(left: string, right: string) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function plainText(value: string) {
    if (!value) {
        return "";
    }

    if (typeof document !== "undefined") {
        const container = document.createElement("div");
        container.innerHTML = value;
        return container.textContent?.trim() ?? "";
    }

    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
