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
    load: () => Promise<unknown>;
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
    rawGroups: unknown,
    input: EntrySourceQuery<BookmarkSortField>,
): EntrySourceSection[] {
    const groups = normalizeBookmarkGroups(rawGroups);
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

export function normalizeBookmarkGroups(value: unknown): BookmarkGroup[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const groups = new Map<string, BookmarkGroup>();
    for (const rawGroup of value) {
        if (!isRecord(rawGroup) || typeof rawGroup.name !== "string") {
            console.warn("Skipping malformed bookmark group", rawGroup);
            continue;
        }
        const name = rawGroup.name.trim();
        if (!name) {
            continue;
        }

        const blocks: BookmarkBlock[] = [];
        if (!Array.isArray(rawGroup.blocks)) {
            console.warn("Skipping malformed bookmark group blocks", rawGroup);
        } else {
            for (const rawBlock of rawGroup.blocks) {
                if (!isRecord(rawBlock) || typeof rawBlock.id !== "string" || !rawBlock.id) {
                    console.warn("Skipping malformed bookmark block", rawBlock);
                    continue;
                }
                blocks.push({
                    id: rawBlock.id,
                    rootID: typeof rawBlock.rootID === "string" ? rawBlock.rootID : rawBlock.id,
                    content: typeof rawBlock.content === "string" ? rawBlock.content : "",
                    name: typeof rawBlock.name === "string" ? rawBlock.name : undefined,
                    hPath: typeof rawBlock.hPath === "string" ? rawBlock.hPath : undefined,
                    created: typeof rawBlock.created === "string" ? rawBlock.created : "",
                    updated: typeof rawBlock.updated === "string" ? rawBlock.updated : "",
                    type: typeof rawBlock.type === "string" ? rawBlock.type : "",
                });
            }
        }

        const existing = groups.get(name);
        if (existing) {
            existing.blocks.push(...blocks);
        } else {
            groups.set(name, { name, blocks });
        }
    }

    return [...groups.values()].filter((group) => group.blocks.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
