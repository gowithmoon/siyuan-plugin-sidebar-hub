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
        expandAll?: string;
        collapseAll?: string;
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
        collapsible?: boolean;
        collapsedKeys?: string[];
        onCollapsedKeysChange?: (keys: string[]) => void;
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
        collapsible = false,
        collapsedKeys: initialCollapsedKeys = [],
        onCollapsedKeysChange,
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
    let localCollapsedKeys = $state(new Set<string>());
    let lastExternalCollapsedKeys = "";
    let searchCollapsedBackup: Set<string> | undefined;
    let previousQuery = "";
    let lastCleanedSectionSignature: string | undefined;

    $effect(() => {
        const signature = initialCollapsedKeys.join("\u0000");
        if (signature !== lastExternalCollapsedKeys) {
            lastExternalCollapsedKeys = signature;
            localCollapsedKeys = new Set(initialCollapsedKeys);
        }
    });

    $effect(() => {
        void runtime.setActive(active);
    });

    $effect(() => {
        const query = runtimeState.query.trim();
        if (!collapsible) {
            previousQuery = query;
            return;
        }
        if (!previousQuery && query) {
            searchCollapsedBackup = new Set(localCollapsedKeys);
            localCollapsedKeys = new Set();
        } else if (previousQuery && !query && searchCollapsedBackup) {
            localCollapsedKeys = searchCollapsedBackup;
            searchCollapsedBackup = undefined;
        }
        previousQuery = query;
    });

    $effect(() => {
        if (!collapsible || runtimeState.loadedQuery !== "" || runtimeState.snapshot.status !== "ready") {
            return;
        }
        const sectionKeys = runtimeState.snapshot.sections.map((section) => section.key);
        const signature = sectionKeys.join("\u0000");
        if (signature === lastCleanedSectionSignature) {
            return;
        }
        lastCleanedSectionSignature = signature;
        const validKeys = new Set(sectionKeys);
        const next = new Set([...localCollapsedKeys].filter((key) => validKeys.has(key)));
        if (next.size !== localCollapsedKeys.size) {
            localCollapsedKeys = next;
            onCollapsedKeysChange?.([...next]);
        }
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

    function isSectionCollapsed(key: string) {
        return collapsible && !runtimeState.query.trim() && localCollapsedKeys.has(key);
    }

    function toggleSection(key: string) {
        if (!collapsible || runtimeState.query.trim()) {
            return;
        }
        const next = new Set(localCollapsedKeys);
        if (next.has(key)) {
            next.delete(key);
        } else {
            next.add(key);
        }
        localCollapsedKeys = next;
        onCollapsedKeysChange?.([...next]);
    }

    function allSectionsCollapsed() {
        const sections = runtimeState.snapshot.sections;
        return sections.length > 0 && sections.every((section) => localCollapsedKeys.has(section.key));
    }

    function toggleAllSections() {
        if (!collapsible || runtimeState.query.trim()) {
            return;
        }
        const next = allSectionsCollapsed()
            ? new Set<string>()
            : new Set(runtimeState.snapshot.sections.map((section) => section.key));
        localCollapsedKeys = next;
        onCollapsedKeysChange?.([...next]);
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

<div class:sidebar-hub__tools--collapsible={collapsible} class="sidebar-hub__tools">
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
    {#if collapsible}
        <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south"
            aria-label={allSectionsCollapsed() ? translations.expandAll : translations.collapseAll}
            onclick={toggleAllSections}>
            <svg aria-hidden="true"><use href={allSectionsCollapsed() ? "#iconExpand" : "#iconContract"}></use></svg>
        </button>
    {/if}
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
                {#if showSectionLabels && section.label}
                    {#if collapsible}
                        <button type="button" class="sidebar-hub__section-toggle" aria-expanded={!isSectionCollapsed(section.key)} onclick={() => toggleSection(section.key)}>
                            <svg aria-hidden="true"><use href={isSectionCollapsed(section.key) ? "#iconRight" : "#iconDown"}></use></svg>
                            <span>{section.label}</span>
                        </button>
                    {:else}
                        <h3>{section.label}</h3>
                    {/if}
                {/if}
                {#if !isSectionCollapsed(section.key)}
                    {#each section.entries as entry (entry.key)}
                        <button type="button" class="sidebar-hub__list-item" title={entry.label} onclick={() => openEntry(entry.key)}>
                            <svg aria-hidden="true"><use href={`#${entry.icon}`}></use></svg>
                            <span>{entry.label}</span>
                        </button>
                    {/each}
                {/if}
            </section>
        {/each}
    </div>
{/if}
