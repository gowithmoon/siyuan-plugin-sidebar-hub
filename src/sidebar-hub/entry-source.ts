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
    blockType?: "document" | "block";
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
    setCountTargets(keys: readonly string[]): void;
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
    loadCount?: (raw: TRaw, key: string) => Promise<number | undefined>;
    countConcurrency?: number;
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
    let countTargets = new Set<string>();
    let countAttempted = new Set<string>();
    let activeCountRequests = 0;
    let countPublishGeneration: number | undefined;

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
                startTargetCounts();
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
            countAttempted = new Set();
            countPublishGeneration = undefined;
            queryVersion += 1;
            currentSnapshot = { status: "idle", sections: currentSnapshot.sections };
        },
        setCountTargets(keys) {
            countTargets = new Set(keys);
            startTargetCounts();
        },
    };

    function startTargetCounts() {
        if (!dependencies.loadCount || cached === undefined) {
            return;
        }

        const concurrency = dependencies.countConcurrency ?? 1;
        while (activeCountRequests < concurrency) {
            const key = [...countTargets].find((candidate) =>
                !countCache.has(candidate) && !countAttempted.has(candidate));
            if (!key) {
                return;
            }
            startCount(key);
        }
    }

    function startCount(key: string) {
        if (!dependencies.loadCount || cached === undefined) {
            return;
        }
        const requestedGeneration = generation;
        const raw = cached;
        countAttempted.add(key);
        activeCountRequests += 1;
        void dependencies.loadCount(raw, key)
            .then((count) => {
                if (requestedGeneration !== generation || count === undefined) {
                    return;
                }
                countCache.set(key, count);
                scheduleCountPublish(raw, requestedGeneration);
            })
            .catch(() => {
                // 失败的计数在当前 generation 保持未知状态且不自动重试。
            })
            .finally(() => {
                activeCountRequests -= 1;
                startTargetCounts();
            });
    }

    function scheduleCountPublish(raw: TRaw, requestedGeneration: number) {
        if (countPublishGeneration === requestedGeneration) {
            return;
        }
        countPublishGeneration = requestedGeneration;
        requestFrame(() => {
            if (countPublishGeneration !== requestedGeneration || generation !== requestedGeneration) {
                return;
            }
            countPublishGeneration = undefined;
            if (!currentInput || currentSnapshot.status !== "ready") {
                return;
            }
            currentSnapshot = {
                ...currentSnapshot,
                sections: dependencies.build(raw, currentInput, countCache),
            };
            currentUpdate?.(currentSnapshot);
        });
    }
}

function requestFrame(callback: FrameRequestCallback) {
    if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(callback);
    }
    return setTimeout(() => callback(performance.now()), 0);
}
