import {
    createEntrySource,
    type EntrySource,
    type EntrySourceEntry,
    type EntrySourceQuery,
    type EntrySourceSection,
} from "./entry-source";

export type TagSortField = "name" | "count";

export const TAG_SORT_FIELDS: readonly TagSortField[] = ["name", "count"];

export function tagSearchKeyword(label: string) {
    return `#${label}#`;
}

export interface TagNode {
    name: string;
    label: string;
    count: number;
    children: TagNode[] | null;
}

interface TagDependencies {
    load: () => Promise<TagNode[]>;
    open: (label: string) => Promise<void> | void;
}

export function createTagSource(dependencies: TagDependencies): EntrySource<TagSortField> {
    return createEntrySource({
        sortFields: TAG_SORT_FIELDS,
        load: dependencies.load,
        build: buildTagSections,
        getTotalCount: countNavigableTags,
        open: dependencies.open,
    });
}

function buildTagSections(tags: TagNode[], input: EntrySourceQuery<TagSortField>): EntrySourceSection[] {
    const keywords = input.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const direction = input.sort.direction === "asc" ? 1 : -1;
    const entries = buildTagEntries(tags, keywords, input.sort.field, direction);

    return entries.length > 0 ? [{ key: "tags", entries }] : [];
}

function buildTagEntries(
    tags: TagNode[],
    keywords: string[],
    field: TagSortField,
    direction: number,
): EntrySourceEntry[] {
    return tags
        .map((tag) => buildTagEntry(tag, keywords, field, direction))
        .filter((entry): entry is EntrySourceEntry => entry !== undefined)
        .sort((left, right) => compareEntries(left, right, field) * direction);
}

function buildTagEntry(
    tag: TagNode,
    keywords: string[],
    field: TagSortField,
    direction: number,
): EntrySourceEntry | undefined {
    const children = buildTagEntries(tag.children ?? [], keywords, field, direction);
    const matches = matchesKeywords(tag.label, keywords);
    if (keywords.length > 0 && !matches && children.length === 0) {
        return undefined;
    }

    const allChildren = keywords.length > 0 && matches
        ? buildTagEntries(tag.children ?? [], [], field, direction)
        : children;
    return {
        key: tag.label,
        label: tag.name,
        icon: "iconTag",
        count: tag.count,
        countable: tag.count > 0 || !(tag.children?.length),
        openable: tag.count > 0,
        children: allChildren.length > 0 ? allChildren : undefined,
    };
}

function matchesKeywords(value: string, keywords: string[]) {
    const normalized = value.toLocaleLowerCase();
    return keywords.every((keyword) => normalized.includes(keyword));
}

function compareEntries(left: EntrySourceEntry, right: EntrySourceEntry, field: TagSortField) {
    if (field === "count") {
        return countOf(left) - countOf(right) || compareText(left.label, right.label);
    }

    return compareText(left.label, right.label);
}

function countOf(entry: EntrySourceEntry) {
    return entry.count ?? 0;
}

function countNavigableTags(tags: TagNode[]) {
    return tags.reduce((total, tag) => total
        + (tag.count > 0 ? 1 : 0)
        + countNavigableTags(tag.children ?? []), 0);
}

function compareText(left: string, right: string) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}
