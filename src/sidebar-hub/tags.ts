import {
    createEntrySource,
    type EntrySource,
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

interface TagRecord {
    key: string;
    label: string;
    icon: string;
    count: number;
}

export function createTagSource(dependencies: TagDependencies): EntrySource<TagSortField> {
    return createEntrySource({
        sortFields: TAG_SORT_FIELDS,
        load: dependencies.load,
        build: buildTagSections,
        open: dependencies.open,
    });
}

function buildTagSections(tags: TagNode[], input: EntrySourceQuery<TagSortField>): EntrySourceSection[] {
    const keywords = input.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const direction = input.sort.direction === "asc" ? 1 : -1;
    const records = flattenTags(tags);
    const entries = records
        .filter((tag) => matchesKeywords(tag.label, keywords))
        .sort((left, right) => compareTags(left, right, input.sort.field) * direction)
        .map(({ key, label, icon }) => ({ key, label, icon }));

    return entries.length > 0 ? [{ key: "tags", entries }] : [];
}

function flattenTags(tags: TagNode[], parentPath = ""): TagRecord[] {
    return tags.flatMap((tag) => {
        const path = parentPath ? `${parentPath}/${tag.name}` : tag.name;
        return [
            { key: path, label: path, icon: "iconTag", count: tag.count },
            ...flattenTags(tag.children ?? [], path),
        ];
    });
}

function matchesKeywords(value: string, keywords: string[]) {
    const normalized = value.toLocaleLowerCase();
    return keywords.every((keyword) => normalized.includes(keyword));
}

function compareTags(left: TagRecord, right: TagRecord, field: TagSortField) {
    if (field === "count") {
        return left.count - right.count || compareText(left.label, right.label);
    }

    return compareText(left.label, right.label);
}

function compareText(left: string, right: string) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}
