<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { Menu, showMessage } from "siyuan";

    import { createEntrySourceRuntime, type EntrySourceRuntimeState } from "./entry-source-runtime";
    import type {
        EntrySource,
        EntrySourceSort,
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
        progress?: string;
        sortOptions: Record<string, string>;
    }

    interface Props {
        source: EntrySource<string>;
        translations: Translations;
        emptyIcon: string;
        sectionLabel?: string;
        showSectionLabels?: boolean;
        active: boolean;
        initialSort: EntrySourceSort<string>;
        onSortChange: (sort: EntrySourceSort<string>) => void;
    }

    let {
        source,
        translations,
        emptyIcon,
        sectionLabel,
        showSectionLabels = true,
        active,
        initialSort,
        onSortChange,
    }: Props = $props();
    let runtimeState = $state<EntrySourceRuntimeState<string>>();
    const initialRuntimeOptions = untrack(() => ({ source, initialSort, onSortChange }));
    const runtime = createEntrySourceRuntime({
        source: initialRuntimeOptions.source,
        initialSort: initialRuntimeOptions.initialSort,
        onChange: (state) => runtimeState = state,
        onSortChange: initialRuntimeOptions.onSortChange,
    });
    runtimeState = runtime.state;

    $effect(() => {
        void runtime.setActive(active);
    });

    onDestroy(() => runtime.dispose());

    export function invalidate() {
        return runtime.invalidate();
    }

    function changeQuery(event: Event) {
        runtime.setQuery((event.currentTarget as HTMLInputElement).value);
    }

    function setSortField(field: string) {
        void runtime.setSortField(field);
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
                icon: field === runtimeState.sort.field ? "iconSelect" : undefined,
                click: () => setSortField(field),
            });
        }

        const rect = button.getBoundingClientRect();
        menu.open({ x: rect.left, y: rect.bottom, h: rect.height, w: rect.width });
    }

    function toggleSortDirection() {
        void runtime.toggleSortDirection();
    }

    async function openEntry(key: string) {
        try {
            await source.open(key);
        } catch {
            showMessage(translations.openError, 6000, "error");
        }
    }

    function progressLabel() {
        return translations.progress?.replace("{current}", String(runtimeState.snapshot.progress?.current ?? 0));
    }
</script>

<div class="sidebar-hub__tools">
    <label class="sidebar-hub__search">
        <svg aria-hidden="true"><use href="#iconSearch"></use></svg>
        <input
            type="search"
            class="b3-text-field"
            value={runtimeState.query}
            placeholder={translations.searchPlaceholder}
            aria-label={translations.searchPlaceholder}
            oninput={changeQuery}
        />
    </label>
    <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south"
        aria-label={`${translations.sortLabel}：${translations.sortOptions[runtimeState.sort.field] ?? runtimeState.sort.field}`}
        aria-haspopup="menu"
        onclick={openSortMenu}>
        <svg aria-hidden="true"><use href="#iconSort"></use></svg>
    </button>
    <button type="button" class="block__icon block__icon--show ariaLabel sidebar-hub__sort-direction" data-position="south"
        aria-label={runtimeState.sort.direction === "asc" ? translations.sortAscending : translations.sortDescending}
        aria-pressed={runtimeState.sort.direction === "desc"} onclick={toggleSortDirection}>
        <svg aria-hidden="true"><use href={runtimeState.sort.direction === "asc" ? "#iconUp" : "#iconDown"}></use></svg>
    </button>
    <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south"
        aria-label={translations.refresh} onclick={() => runtime.refresh()}>
        <svg class:fn__rotate={runtimeState.snapshot.status === "loading"} aria-hidden="true"><use href="#iconRefresh"></use></svg>
    </button>
</div>

{#if runtimeState.snapshot.status === "loading" && runtimeState.snapshot.sections.length === 0}
    <div class="sidebar-hub__state" role="status" aria-live="polite">
        <svg class="fn__rotate" aria-hidden="true"><use href="#iconRefresh"></use></svg>
        <p>{translations.loading}</p>
    </div>
{:else if runtimeState.snapshot.status === "error"}
    <div class="sidebar-hub__state" role="alert" aria-live="assertive">
        <svg aria-hidden="true"><use href="#iconInfo"></use></svg>
        <p>{translations.loadError}</p>
        {#if runtimeState.snapshot.error && runtimeState.snapshot.error !== translations.loadError}
            <small>{runtimeState.snapshot.error}</small>
        {/if}
        <button type="button" class="b3-button b3-button--outline" onclick={() => runtime.refresh()}>{translations.retry}</button>
    </div>
{:else if runtimeState.snapshot.status === "ready" && runtimeState.snapshot.sections.length === 0}
    <div class="sidebar-hub__state" role="status" aria-live="polite">
        <svg aria-hidden="true"><use href={`#${emptyIcon}`}></use></svg>
        <p>{runtimeState.query.trim() ? translations.noMatches : translations.empty}</p>
    </div>
{:else}
    {#if runtimeState.snapshot.status === "loading" && runtimeState.snapshot.progress && translations.progress}
        <div class="sidebar-hub__progress" role="status" aria-live="polite">{progressLabel()}</div>
    {/if}
    <div class="sidebar-hub__entry-list" aria-busy={runtimeState.snapshot.status === "loading"}>
        {#each runtimeState.snapshot.sections as section (section.key)}
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
