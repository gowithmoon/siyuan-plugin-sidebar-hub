import type {
    EntrySource,
    EntrySourceSnapshot,
    EntrySourceSort,
    SortDirection,
} from "./entry-source";

export interface EntrySourceRuntimeState<TField extends string> {
    query: string;
    loadedQuery?: string;
    sort: EntrySourceSort<TField>;
    snapshot: EntrySourceSnapshot;
}

interface EntrySourceRuntimeOptions<TField extends string> {
    source: EntrySource<TField>;
    initialSort: EntrySourceSort<TField>;
    debounceMs?: number;
    onChange?: (state: EntrySourceRuntimeState<TField>) => void;
    onSortChange?: (sort: EntrySourceSort<TField>) => void;
}

export interface EntrySourceRuntime<TField extends string> {
    readonly state: EntrySourceRuntimeState<TField>;
    setActive(active: boolean): Promise<void>;
    setQuery(query: string): void;
    setSortField(field: TField): Promise<void>;
    toggleSortDirection(): Promise<void>;
    refresh(): Promise<void>;
    invalidate(): Promise<void>;
    dispose(): void;
}

export function createEntrySourceRuntime<TField extends string>(
    options: EntrySourceRuntimeOptions<TField>,
): EntrySourceRuntime<TField> {
    const debounceMs = options.debounceMs ?? 180;
    let active = false;
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let state: EntrySourceRuntimeState<TField> = {
        query: "",
        loadedQuery: undefined,
        sort: normalizeSort(options.initialSort),
        snapshot: options.source.snapshot,
    };

    function publish(next: Partial<EntrySourceRuntimeState<TField>>) {
        state = { ...state, ...next };
        options.onChange?.(state);
    }

    async function load() {
        clearTimeout(searchTimer);
        searchTimer = undefined;
        const query = state.query;
        const sort = state.sort;
        const result = options.source.query(
            { query, sort },
            (snapshot) => publish({ snapshot }),
        );
        publish({ snapshot: options.source.snapshot, loadedQuery: undefined });
        const snapshot = await result;
        publish({
            snapshot,
            loadedQuery: state.query === query && state.sort.field === sort.field && state.sort.direction === sort.direction
                ? query
                : state.loadedQuery,
        });
    }

    async function changeSort(sort: EntrySourceSort<TField>) {
        publish({ sort, loadedQuery: undefined });
        options.onSortChange?.(sort);
        if (state.snapshot.status !== "error") {
            await load();
        }
    }

    function normalizeSort(sort: EntrySourceSort<TField>): EntrySourceSort<TField> {
        const field = options.source.sortFields.includes(sort.field)
            ? sort.field
            : options.source.sortFields[0];
        if (!field) {
            throw new Error("Entry source must support at least one sort field");
        }
        const direction: SortDirection = sort.direction === "desc" ? "desc" : "asc";
        return { field, direction };
    }

    return {
        get state() {
            return state;
        },
        async setActive(nextActive) {
            active = nextActive;
            options.source.setCountEnabled(active);
            if (active && state.snapshot.status === "idle") {
                await load();
            }
        },
        setQuery(query) {
            publish({ query, loadedQuery: undefined });
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                if (state.snapshot.status !== "error") {
                    void load();
                }
            }, debounceMs);
        },
        setSortField(field) {
            return changeSort(normalizeSort({ field, direction: state.sort.direction }));
        },
        toggleSortDirection() {
            return changeSort({
                field: state.sort.field,
                direction: state.sort.direction === "asc" ? "desc" : "asc",
            });
        },
        async refresh() {
            options.source.invalidate();
            publish({ snapshot: options.source.snapshot, loadedQuery: undefined });
            await load();
        },
        async invalidate() {
            if (state.snapshot.status === "error") {
                return;
            }
            options.source.invalidate();
            publish({ snapshot: options.source.snapshot, loadedQuery: undefined });
            if (active) {
                await load();
            }
        },
        dispose() {
            clearTimeout(searchTimer);
        },
    };
}
