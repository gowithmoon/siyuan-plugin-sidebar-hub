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
    count?: number;
    children?: EntrySourceEntry[];
    openable?: boolean;
}

export interface EntrySourceSection {
    key: string;
    label?: string;
    entries: EntrySourceEntry[];
}

export interface EntrySource<TField extends string> {
    readonly sortFields: readonly TField[];
    readonly snapshot: EntrySourceSnapshot;
    query(input: EntrySourceQuery<TField>, onUpdate?: (snapshot: EntrySourceSnapshot) => void): Promise<EntrySourceSnapshot>;
    open(key: string): Promise<void> | void;
    invalidate(): void;
}

export interface EntrySourceSnapshot {
    status: "idle" | "loading" | "ready" | "error";
    sections: EntrySourceSection[];
    error?: string;
    progress?: {
        current: number;
        total?: number;
    };
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
    let queryVersion = 0;
    let currentSnapshot: EntrySourceSnapshot = { status: "idle", sections: [] };

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
        get snapshot() {
            return currentSnapshot;
        },
        async query(input) {
            const requestVersion = ++queryVersion;
            currentSnapshot = { status: "loading", sections: currentSnapshot.sections };
            try {
                const sections = dependencies.build(await load(), input);
                if (requestVersion !== queryVersion) {
                    return currentSnapshot;
                }
                currentSnapshot = { status: "ready", sections };
            } catch (error) {
                if (requestVersion !== queryVersion) {
                    return currentSnapshot;
                }
                currentSnapshot = {
                    status: "error",
                    sections: [],
                    error: error instanceof Error && error.message ? error.message : "Unable to load entries",
                };
            }
            return currentSnapshot;
        },
        open(key) {
            return dependencies.open(key);
        },
        invalidate() {
            generation += 1;
            cached = undefined;
            pending = undefined;
            queryVersion += 1;
            currentSnapshot = { status: "idle", sections: [] };
        },
    };
}
