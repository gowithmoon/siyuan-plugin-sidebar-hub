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
    countable?: boolean;
    children?: EntrySourceEntry[];
    openable?: boolean;
}

export interface EntrySourceSection {
    key: string;
    label?: string;
    count?: number;
    countable?: boolean;
    entries: EntrySourceEntry[];
}

export interface EntrySource<TField extends string> {
    readonly sortFields: readonly TField[];
    readonly snapshot: EntrySourceSnapshot;
    query(input: EntrySourceQuery<TField>, onUpdate?: (snapshot: EntrySourceSnapshot) => void): Promise<EntrySourceSnapshot>;
    open(key: string): Promise<void> | void;
    invalidate(): void;
    setCountEnabled(enabled: boolean): void;
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
    build: (raw: TRaw, input: EntrySourceQuery<TField>, counts: ReadonlyMap<string, number>) => EntrySourceSection[];
    loadCounts?: (raw: TRaw, onCount: (key: string, count: number) => void) => Promise<void>;
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
    let currentInput: EntrySourceQuery<TField> | undefined;
    let currentUpdate: ((snapshot: EntrySourceSnapshot) => void) | undefined;
    let countCache = new Map<string, number>();
    let countGeneration = -1;
    let countEnabled = true;

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
        async query(input, onUpdate) {
            const requestVersion = ++queryVersion;
            currentInput = input;
            currentUpdate = onUpdate;
            currentSnapshot = { status: "loading", sections: currentSnapshot.sections };
            try {
                const raw = await load();
                const sections = dependencies.build(raw, input, countCache);
                if (requestVersion !== queryVersion) {
                    return currentSnapshot;
                }
                currentSnapshot = { status: "ready", sections };
                currentUpdate?.(currentSnapshot);
                if (dependencies.loadCounts && countEnabled && countGeneration !== generation) {
                    countGeneration = generation;
                    void loadCounts(raw, generation);
                }
            } catch (error) {
                if (requestVersion !== queryVersion) {
                    return currentSnapshot;
                }
                currentSnapshot = {
                    status: "error",
                    sections: currentSnapshot.sections,
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
            countCache = new Map();
            countGeneration = -1;
            queryVersion += 1;
            currentSnapshot = { status: "idle", sections: currentSnapshot.sections };
        },
        setCountEnabled(enabled) {
            countEnabled = enabled;
            if (!countEnabled || cached === undefined || !dependencies.loadCounts) {
                return;
            }
            if (currentInput && currentSnapshot.status === "ready") {
                currentSnapshot = {
                    ...currentSnapshot,
                    sections: dependencies.build(cached, currentInput, countCache),
                };
                currentUpdate?.(currentSnapshot);
            }
            if (countGeneration !== generation) {
                countGeneration = generation;
                void loadCounts(cached, generation);
            }
        },
    };

    async function loadCounts(raw: TRaw, requestedGeneration: number) {
        if (!dependencies.loadCounts) {
            return;
        }
        try {
            await dependencies.loadCounts(raw, (key, count) => {
                if (requestedGeneration !== generation) {
                    return;
                }
                countCache.set(key, count);
                if (!countEnabled || !currentInput || currentSnapshot.status !== "ready") {
                    return;
                }
                currentSnapshot = {
                    ...currentSnapshot,
                    sections: dependencies.build(raw, currentInput, countCache),
                };
                currentUpdate?.(currentSnapshot);
            });
        } catch {
            // Individual count failures are intentionally left as unknown (…).
        }
    }
}
