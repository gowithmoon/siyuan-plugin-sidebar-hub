import {
    createEntrySource,
    type EntrySource,
    type EntrySourceQuery,
    type EntrySourceSection,
} from "./entry-source";

export type BookmarkSortField = "name" | "created" | "updated";

export const BOOKMARK_SORT_FIELDS: readonly BookmarkSortField[] = ["name", "created", "updated"];

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

interface BookmarkDependencies {
    load: () => Promise<BookmarkGroup[]>;
    open: (blockId: string) => Promise<void> | void;
}

interface BookmarkRecord {
    key: string;
    label: string;
    icon: string;
    created: string;
    updated: string;
}

export function createBookmarkSource(dependencies: BookmarkDependencies): EntrySource<BookmarkSortField> {
    return createEntrySource({
        sortFields: BOOKMARK_SORT_FIELDS,
        load: dependencies.load,
        build: buildBookmarkSections,
        open: dependencies.open,
    });
}

function buildBookmarkSections(
    groups: BookmarkGroup[],
    input: EntrySourceQuery<BookmarkSortField>,
): EntrySourceSection[] {
    const keywords = input.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const direction = input.sort.direction === "asc" ? 1 : -1;

    return groups
        .map((group) => {
            const entries = (group.blocks ?? []).map(toBookmarkRecord);
            const visibleEntries = matchesKeywords(group.name, keywords)
                ? entries
                : entries.filter((entry) => matchesKeywords(entry.label, keywords));

            return {
                key: group.name,
                label: group.name,
                entries: visibleEntries
                    .sort((left, right) => compareRecords(left, right, input.sort.field) * direction)
                    .map(({ key, label, icon }) => ({ key, label, icon })),
            };
        })
        .filter((group) => group.entries.length > 0)
        .sort((left, right) => compareText(left.label ?? "", right.label ?? ""));
}

function toBookmarkRecord(block: BookmarkBlock): BookmarkRecord {
    return {
        key: block.id,
        label: plainText(block.content) || block.name || block.hPath || block.id,
        icon: block.id === block.rootID ? "iconFile" : "iconBookmark",
        created: block.created,
        updated: block.updated,
    };
}

function matchesKeywords(value: string, keywords: string[]) {
    const normalized = value.toLocaleLowerCase();
    return keywords.every((keyword) => normalized.includes(keyword));
}

function compareRecords(left: BookmarkRecord, right: BookmarkRecord, field: BookmarkSortField) {
    if (field === "name") {
        return compareText(left.label, right.label);
    }

    return left[field].localeCompare(right[field]) || compareText(left.label, right.label);
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
