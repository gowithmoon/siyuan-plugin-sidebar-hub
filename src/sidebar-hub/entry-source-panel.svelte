<script lang="ts">
    import { onDestroy } from "svelte";
    import { Menu, showMessage } from "siyuan";

    import type {
        EntrySource,
        EntrySourceSnapshot,
        SortDirection,
    } from "./entry-source";

    interface Translations {
        searchPlaceholder: string;
        sortLabel: string;
        sortAscending: string;
        sortDescending: string;
        refresh: string;
        retry: string;
        loading: string;
        empty: string;
        noMatches: string;
        loadError: string;
        openError: string;
        sortOptions: Record<string, string>;
    }

    interface Props {
        source: EntrySource<string>;
        translations: Translations;
        emptyIcon: string;
        sectionLabel?: string;
        showSectionLabels?: boolean;
        active: boolean;
    }

    let { source, translations, emptyIcon, sectionLabel, showSectionLabels = true, active }: Props = $props();
    let query = $state("");
    let sortField = $state("");
    let sortDirection = $state<SortDirection>("asc");
    let snapshot = $state<EntrySourceSnapshot>({ status: "idle", sections: [] });
    let searchTimer: ReturnType<typeof setTimeout> | undefined;

    initializeSourceState();

    $effect(() => {
        if (active && snapshot.status === "idle") {
            void update();
        }
    });

    onDestroy(() => clearTimeout(searchTimer));

    function initializeSourceState() {
        sortField = source.sortFields[0] ?? "";
        snapshot = source.snapshot;
    }

    async function update(options: { invalidate?: boolean } = {}) {
        if (options.invalidate) {
            source.invalidate();
        }
        snapshot = source.snapshot;
        const result = source.query({
            query,
            sort: { field: sortField, direction: sortDirection },
        });
        snapshot = source.snapshot;
        snapshot = await result;
    }

    function changeQuery(event: Event) {
        query = (event.currentTarget as HTMLInputElement).value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            if (snapshot.status !== "error") {
                void update();
            }
        }, 180);
    }

    function setSortField(field: string) {
        sortField = field;
        if (snapshot.status !== "error") {
            void update();
        }
    }

    function openSortMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        const button = event.currentTarget as HTMLButtonElement;
        const menu = new Menu(`sidebar-hub-sort-${emptyIcon}`);
        if (menu.isOpen) {
            return;
        }

        for (const field of source.sortFields) {
            menu.addItem({
                label: translations.sortOptions[field] ?? field,
                icon: field === sortField ? "iconSelect" : undefined,
                click: () => setSortField(field),
            });
        }

        const rect = button.getBoundingClientRect();
        menu.open({ x: rect.left, y: rect.bottom, h: rect.height, w: rect.width });
    }

    function toggleSortDirection() {
        sortDirection = sortDirection === "asc" ? "desc" : "asc";
        if (snapshot.status !== "error") {
            void update();
        }
    }

    async function openEntry(key: string) {
        try {
            await source.open(key);
        } catch {
            showMessage(translations.openError, 6000, "error");
        }
    }
</script>

<div class="sidebar-hub__tools">
    <label class="sidebar-hub__search">
        <svg aria-hidden="true"><use href="#iconSearch"></use></svg>
        <input
            type="search"
            class="b3-text-field"
            value={query}
            placeholder={translations.searchPlaceholder}
            aria-label={translations.searchPlaceholder}
            oninput={changeQuery}
        />
    </label>
    <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south"
        aria-label={`${translations.sortLabel}：${translations.sortOptions[sortField] ?? sortField}`}
        onclick={openSortMenu}>
        <svg aria-hidden="true"><use href="#iconSort"></use></svg>
    </button>
    <button type="button" class="block__icon block__icon--show ariaLabel sidebar-hub__sort-direction" data-position="south"
        aria-label={sortDirection === "asc" ? translations.sortAscending : translations.sortDescending}
        aria-pressed={sortDirection === "desc"} onclick={toggleSortDirection}>
        <svg aria-hidden="true"><use href={sortDirection === "asc" ? "#iconUp" : "#iconDown"}></use></svg>
    </button>
    <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south"
        aria-label={translations.refresh} onclick={() => update({ invalidate: true })}>
        <svg class:fn__rotate={snapshot.status === "loading"} aria-hidden="true"><use href="#iconRefresh"></use></svg>
    </button>
</div>

{#if snapshot.status === "loading" && snapshot.sections.length === 0}
    <div class="sidebar-hub__state" role="status">
        <svg class="fn__rotate" aria-hidden="true"><use href="#iconRefresh"></use></svg>
        <p>{translations.loading}</p>
    </div>
{:else if snapshot.status === "error"}
    <div class="sidebar-hub__state" role="alert">
        <svg aria-hidden="true"><use href="#iconInfo"></use></svg>
        <p>{translations.loadError}</p>
        {#if snapshot.error && snapshot.error !== translations.loadError}
            <small>{snapshot.error}</small>
        {/if}
        <button type="button" class="b3-button b3-button--outline" onclick={() => update()}>{translations.retry}</button>
    </div>
{:else if snapshot.status === "ready" && snapshot.sections.length === 0}
    <div class="sidebar-hub__state">
        <svg aria-hidden="true"><use href={`#${emptyIcon}`}></use></svg>
        <p>{query.trim() ? translations.noMatches : translations.empty}</p>
    </div>
{:else}
    <div class="sidebar-hub__entry-list" aria-busy={snapshot.status === "loading"}>
        {#each snapshot.sections as section (section.key)}
            <section class="sidebar-hub__entry-section" aria-label={sectionLabel ?? translations.searchPlaceholder}>
                {#if showSectionLabels && section.label}<h3>{section.label}</h3>{/if}
                {#each section.entries as entry (entry.key)}
                    <button type="button" class="sidebar-hub__list-item" title={entry.label} onclick={() => openEntry(entry.key)}>
                        <svg aria-hidden="true"><use href={`#${entry.icon}`}></use></svg>
                        <span>{entry.label}</span>
                    </button>
                {/each}
            </section>
        {/each}
    </div>
{/if}
