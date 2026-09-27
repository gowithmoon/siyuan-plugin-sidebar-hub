import type { EntrySourceEntry } from "./entry-source";

export interface TagTreeRow {
    key: string;
    entry: EntrySourceEntry;
    depth: number;
}

export function flattenTagTree(
    entries: readonly EntrySourceEntry[],
    collapsedKeys: ReadonlySet<string>,
    ignoreCollapsed: boolean,
): TagTreeRow[] {
    const rows: TagTreeRow[] = [];
    visit(entries, 0);
    return rows;

    function visit(children: readonly EntrySourceEntry[], depth: number) {
        for (const entry of children) {
            rows.push({ key: entry.key, entry, depth });
            if (entry.children?.length && (ignoreCollapsed || !collapsedKeys.has(entry.key))) {
                visit(entry.children, depth + 1);
            }
        }
    }
}

export function tagTreeBranchKeys(entries: readonly EntrySourceEntry[]) {
    return flattenTagTree(entries, new Set(), true)
        .filter((row) => Boolean(row.entry.children?.length))
        .map((row) => row.key);
}
