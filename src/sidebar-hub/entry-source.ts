export type SortDirection = "asc" | "desc";

export interface EntrySourceSort<TField extends string> {
    field: TField;
    direction: SortDirection;
}

export interface EntrySourceQuery<TField extends string> {
    query: string;
    sort: EntrySourceSort<TField>;
}

export interface EntrySourceEntry {
    key: string;
    label: string;
    icon: string;
}

export interface EntrySourceSection {
    key: string;
    label?: string;
    entries: EntrySourceEntry[];
}

export interface EntrySource<TField extends string> {
    readonly sortFields: readonly TField[];
    query(input: EntrySourceQuery<TField>): Promise<EntrySourceSection[]>;
    open(key: string): Promise<void> | void;
    invalidate(): void;
}

interface EntrySourceDependencies<TRaw, TField extends string> {
    sortFields: readonly TField[];
    load: () => Promise<TRaw>;
    build: (raw: TRaw, input: EntrySourceQuery<TField>) => EntrySourceSection[];
    open: (key: string) => Promise<void> | void;
}

export function createEntrySource<TRaw, TField extends string>(
    dependencies: EntrySourceDependencies<TRaw, TField>,
): EntrySource<TField> {
    let cached: TRaw | undefined;
    let pending: Promise<TRaw> | undefined;
    let generation = 0;

    async function load() {
        if (cached !== undefined) {
            return cached;
        }

        const requestedGeneration = generation;
        pending ??= dependencies.load();
        try {
            const result = await pending;
            if (requestedGeneration === generation) {
                cached = result;
            }
            return result;
        } finally {
            if (requestedGeneration === generation) {
                pending = undefined;
            }
        }
    }

    return {
        sortFields: dependencies.sortFields,
        async query(input) {
            return dependencies.build(await load(), input);
        },
        open(key) {
            return dependencies.open(key);
        },
        invalidate() {
            generation += 1;
            cached = undefined;
            pending = undefined;
        },
    };
}
