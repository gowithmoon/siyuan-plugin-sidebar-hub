<script lang="ts">
    import { onDestroy, tick, untrack } from "svelte";
    import { Menu, showMessage } from "siyuan";

    import { createEntrySourceRuntime, type EntrySourceRuntimeState } from "./entry-source-runtime";
    import type {
        EntrySource,
        EntrySourceEntry,
        EntrySourceSort,
    } from "./entry-source";
    import { routeEntryMenuEvent, type OpenEntryMenu } from "./entry-menu-event";
    import {
        createFixedVirtualList,
        type FixedVirtualListWindow,
    } from "./fixed-virtual-list";
    import { flattenTagTree, tagTreeBranchKeys, type TagTreeRow } from "./tag-tree";
    import { entryDropTarget, type EntryDropHandlers } from "./entry-drop-target";

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
        expandNode?: string;
        collapseNode?: string;
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
        nested?: boolean;
        collapsedKeys?: string[];
        onCollapsedKeysChange?: (keys: string[]) => void;
        entryMenuLabel?: string;
        onEntryMenu?: OpenEntryMenu;
        virtualized?: boolean;
        dropHandlers?: EntryDropHandlers;
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
        nested = false,
        collapsedKeys: initialCollapsedKeys = [],
        onCollapsedKeysChange,
        entryMenuLabel,
        onEntryMenu,
        virtualized = false,
        dropHandlers,
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
    const virtualList = createFixedVirtualList();
    let virtualWindow = $state<FixedVirtualListWindow>(virtualList.window);
    let virtualScrollContainer = $state<HTMLDivElement>();
    let resetVirtualPosition = false;
    let virtualEntries = $derived(runtimeState.snapshot.sections.flatMap((section) => section.entries));
    let virtualTreeRows = $derived(nested
        ? flattenTagTree(virtualEntries, localCollapsedKeys, Boolean(runtimeState.query.trim()))
        : []);
    let visibleVirtualEntries = $derived(virtualEntries.slice(virtualWindow.startIndex, virtualWindow.endIndex));
    let visibleVirtualTreeRows = $derived(virtualTreeRows.slice(virtualWindow.startIndex, virtualWindow.endIndex));

    $effect(() => {
        const signature = initialCollapsedKeys.join("\u0000");
        if (signature !== lastExternalCollapsedKeys) {
            lastExternalCollapsedKeys = signature;
            localCollapsedKeys = new Set(initialCollapsedKeys);
            if (runtimeState.query.trim()) {
                searchCollapsedBackup = new Set(initialCollapsedKeys);
            }
        }
    });

    $effect(() => {
        void runtime.setActive(active);
    });

    $effect(() => {
        if (!virtualized || !active) {
            return;
        }
        const frame = requestAnimationFrame(() => measureVirtualViewport());
        return () => cancelAnimationFrame(frame);
    });

    $effect(() => {
        if (!virtualized || !virtualScrollContainer) {
            return;
        }
        const container = virtualScrollContainer;
        const observer = new ResizeObserver(() => measureVirtualViewport());
        observer.observe(container);
        measureVirtualViewport();
        return () => observer.disconnect();
    });

    $effect(() => {
        if (!virtualized) {
            return;
        }
        const keys = nested
            ? virtualTreeRows.map((row) => row.key)
            : virtualEntries.map((entry) => entry.key);
        virtualWindow = virtualList.setItems(keys);
        if (resetVirtualPosition) {
            virtualWindow = virtualList.resetScroll();
        }
        void syncVirtualScrollTop();
    });

    $effect(() => {
        const keys = active
            ? (virtualized
                ? (nested
                    ? visibleVirtualTreeRows.map((row) => row.key)
                    : visibleVirtualEntries.map((entry) => entry.key))
                : runtimeState.snapshot.sections.flatMap((section) => section.entries.map((entry) => entry.key)))
            : [];
        source.setCountTargets(keys);
    });

    $effect(() => {
        if (runtimeState.loadedQuery !== undefined) {
            resetVirtualPosition = false;
        }
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
        const sectionKeys = nested ? nestedEntryKeys() : runtimeState.snapshot.sections.map((section) => section.key);
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
        resetVirtualScroll();
        runtime.setQuery((event.currentTarget as HTMLInputElement).value);
    }

    function setSortField(field: string) {
        resetVirtualScroll();
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
        resetVirtualScroll();
        void runtime.toggleSortDirection();
    }

    function resetVirtualScroll() {
        if (!virtualized) {
            return;
        }
        resetVirtualPosition = true;
        virtualWindow = virtualList.resetScroll();
        if (virtualScrollContainer) {
            virtualScrollContainer.scrollTop = 0;
        }
    }

    function measureVirtualViewport() {
        if (!virtualScrollContainer) {
            return;
        }
        const nextWindow = virtualList.setViewportHeight(virtualScrollContainer.clientHeight);
        virtualWindow = nextWindow;
        // 这里必须读取局部结果；读取 virtualWindow 会让初始化 effect 订阅并触发自身。
        if (virtualScrollContainer.scrollTop !== nextWindow.scrollTop) {
            virtualScrollContainer.scrollTop = nextWindow.scrollTop;
        }
    }

    function scrollVirtualList(event: Event) {
        virtualWindow = virtualList.setScrollTop((event.currentTarget as HTMLDivElement).scrollTop);
    }

    async function syncVirtualScrollTop() {
        await tick();
        if (virtualScrollContainer && virtualScrollContainer.scrollTop !== virtualWindow.scrollTop) {
            virtualScrollContainer.scrollTop = virtualWindow.scrollTop;
        }
    }

    function isSectionCollapsed(key: string) {
        return collapsible && !nested && !runtimeState.query.trim() && localCollapsedKeys.has(key);
    }

    function isEntryCollapsed(key: string) {
        return collapsible && nested && !runtimeState.query.trim() && localCollapsedKeys.has(key);
    }

    function toggleSection(key: string) {
        if (!collapsible || nested || runtimeState.query.trim()) {
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
        if (nested) {
            const keys = nestedCollapsibleKeys();
            return keys.length > 0 && keys.every((key) => localCollapsedKeys.has(key));
        }
        const sections = runtimeState.snapshot.sections;
        return sections.length > 0 && sections.every((section) => localCollapsedKeys.has(section.key));
    }

    function toggleAllSections() {
        if (!collapsible || runtimeState.query.trim()) {
            return;
        }
        const keys = nested ? nestedCollapsibleKeys() : runtimeState.snapshot.sections.map((section) => section.key);
        const next = allSectionsCollapsed()
            ? new Set<string>()
            : new Set(keys);
        localCollapsedKeys = next;
        onCollapsedKeysChange?.([...next]);
    }

    function nestedCollapsibleKeys() {
        return runtimeState.snapshot.sections.flatMap((section) => tagTreeBranchKeys(section.entries));
    }

    function nestedEntryKeys() {
        return runtimeState.snapshot.sections.flatMap((section) =>
            flattenTagTree(section.entries, new Set(), true).map((row) => row.key));
    }

    function toggleEntry(key: string) {
        if (!collapsible || !nested || runtimeState.query.trim()) {
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

    function openEntryFromEvent(event: MouseEvent, key: string) {
        event.stopPropagation();
        void openEntry(key);
    }

    function openEntryMenuFromEvent(event: MouseEvent, entry: EntrySourceEntry) {
        if (onEntryMenu) {
            routeEntryMenuEvent(event, entry, onEntryMenu);
        }
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

{#snippet renderEntryButton(entry: EntrySourceEntry)}
    <button type="button" class="sidebar-hub__list-item" title={entry.label} onclick={() => openEntry(entry.key)}>
        <svg aria-hidden="true"><use href={`#${entry.icon}`}></use></svg>
        <span class="sidebar-hub__entry-label">{entry.label}</span>
        {#if entry.countable}<span class="sidebar-hub__entry-count">{entry.count ?? "…"}</span>{/if}
    </button>
{/snippet}

{#snippet renderFlatEntry(entry: EntrySourceEntry)}
    {#if onEntryMenu}
        <div class="sidebar-hub__entry-row" role="group" aria-label={entry.label} oncontextmenu={(event) => openEntryMenuFromEvent(event, entry)}>
            {@render renderEntryButton(entry)}
            <button
                type="button"
                class="block__icon ariaLabel sidebar-hub__entry-menu"
                data-position="west"
                aria-label={`${entryMenuLabel ?? ""}：${entry.label}`}
                aria-haspopup="menu"
                onclick={(event) => openEntryMenuFromEvent(event, entry)}
            >
                <svg aria-hidden="true"><use href="#iconMore"></use></svg>
            </button>
        </div>
    {:else}
        {@render renderEntryButton(entry)}
    {/if}
{/snippet}

{#snippet renderTreeRow(row: TagTreeRow)}
    <div class="sidebar-hub__tree-item" style={`padding-left: ${row.depth * 18 + 4}px`}>
        {#if row.entry.children?.length}
            <button type="button" class="sidebar-hub__tree-toggle" aria-label={isEntryCollapsed(row.key) ? translations.expandNode : translations.collapseNode} aria-expanded={!isEntryCollapsed(row.key)} onclick={() => toggleEntry(row.key)}>
                <svg aria-hidden="true"><use href={isEntryCollapsed(row.key) ? "#iconRight" : "#iconDown"}></use></svg>
            </button>
        {:else}
            <span class="sidebar-hub__tree-toggle-spacer" aria-hidden="true"></span>
        {/if}
        {#if row.entry.openable === false}
            <span class="sidebar-hub__tree-label" title={row.entry.label}>
                <svg aria-hidden="true"><use href={`#${row.entry.icon}`}></use></svg>
                <span class="sidebar-hub__entry-label">{row.entry.label}</span>
                {#if row.entry.countable}<span class="sidebar-hub__entry-count">{row.entry.count ?? "…"}</span>{/if}
            </span>
        {:else}
            <button type="button" class="sidebar-hub__list-item sidebar-hub__tree-label" title={row.entry.label} onclick={(event) => openEntryFromEvent(event, row.key)}>
                <svg aria-hidden="true"><use href={`#${row.entry.icon}`}></use></svg>
                <span class="sidebar-hub__entry-label">{row.entry.label}</span>
                {#if row.entry.countable}<span class="sidebar-hub__entry-count">{row.entry.count ?? "…"}</span>{/if}
            </button>
        {/if}
    </div>
{/snippet}

{#if runtimeState.snapshot.status === "loading" && runtimeState.snapshot.sections.length === 0}
    <div class="sidebar-hub__state" role="status" aria-live="polite">
        <svg class="fn__rotate" aria-hidden="true"><use href="#iconRefresh"></use></svg>
        <p>{translations.loading}</p>
    </div>
{:else if runtimeState.snapshot.status === "error" && runtimeState.snapshot.sections.length === 0}
    <div class="sidebar-hub__state" role="alert" aria-live="assertive">
        <svg aria-hidden="true"><use href="#iconInfo"></use></svg>
        <p>{translations.loadError}</p>
        {#if runtimeState.snapshot.error && runtimeState.snapshot.error !== translations.loadError}
            <small>{runtimeState.snapshot.error}</small>
        {/if}
        <button type="button" class="b3-button b3-button--outline" onclick={() => runtime.refresh()}>{translations.retry}</button>
    </div>
{:else if runtimeState.snapshot.status === "ready" && runtimeState.snapshot.sections.length === 0}
    <div
        class="sidebar-hub__state"
        role="status"
        aria-live="polite"
        use:entryDropTarget={dropHandlers && !runtimeState.query.trim() ? { handlers: dropHandlers, sectionKey: null, enabled: active } : undefined}
    >
        <svg aria-hidden="true"><use href={`#${emptyIcon}`}></use></svg>
        <p>{runtimeState.query.trim() ? translations.noMatches : translations.empty}</p>
    </div>
{:else}
    {#if runtimeState.snapshot.status === "error"}
        <div class="sidebar-hub__refresh-error" role="alert" aria-live="polite">
            <span>{translations.loadError}</span>
            <button type="button" class="b3-button b3-button--outline" onclick={() => runtime.refresh()}>{translations.retry}</button>
        </div>
    {/if}
    {#if runtimeState.snapshot.status === "loading" && runtimeState.snapshot.progress && translations.progress}
        <div class="sidebar-hub__progress" role="status" aria-live="polite">{progressLabel()}</div>
    {/if}
    <div
        bind:this={virtualScrollContainer}
        class:sidebar-hub__entry-list--virtual={virtualized}
        class="sidebar-hub__entry-list"
        aria-busy={runtimeState.snapshot.status === "loading"}
        onscroll={virtualized ? scrollVirtualList : undefined}
    >
        {#if virtualized}
            <div class="sidebar-hub__virtual-content" style={`height: ${virtualWindow.totalHeight}px`}>
                <section
                    class="sidebar-hub__entry-section sidebar-hub__virtual-window"
                    style={`transform: translateY(${virtualWindow.paddingTop}px)`}
                    aria-label={sectionLabel ?? translations.searchPlaceholder}
                >
                    {#if nested}
                        {#each visibleVirtualTreeRows as row (row.key)}
                            {@render renderTreeRow(row)}
                        {/each}
                    {:else}
                        {#each visibleVirtualEntries as entry (entry.key)}
                            {@render renderFlatEntry(entry)}
                        {/each}
                    {/if}
                </section>
            </div>
        {:else}
            {#each runtimeState.snapshot.sections as section (section.key)}
                <section
                    class="sidebar-hub__entry-section"
                    aria-label={sectionLabel ?? translations.searchPlaceholder}
                    use:entryDropTarget={dropHandlers ? { handlers: dropHandlers, sectionKey: section.key, enabled: active && !runtimeState.query.trim() } : undefined}
                >
                    {#if showSectionLabels && section.label}
                        {#if collapsible}
                            <button type="button" class="sidebar-hub__section-toggle" aria-expanded={!isSectionCollapsed(section.key)} onclick={() => toggleSection(section.key)}>
                                <svg aria-hidden="true"><use href={isSectionCollapsed(section.key) ? "#iconRight" : "#iconDown"}></use></svg>
                                <span class="sidebar-hub__entry-label">{section.label}</span>
                                {#if section.countable}<span class="sidebar-hub__entry-count">{section.count ?? "…"}</span>{/if}
                            </button>
                        {:else}
                            <h3><span class="sidebar-hub__entry-label">{section.label}</span>{#if section.countable}<span class="sidebar-hub__entry-count">{section.count ?? "…"}</span>{/if}</h3>
                        {/if}
                    {/if}
                    {#if !isSectionCollapsed(section.key)}
                        {#if nested}
                            {#snippet renderEntries(entries: EntrySourceEntry[], depth = 0)}
                                {#each entries as entry (entry.key)}
                                    {@render renderTreeRow({ key: entry.key, entry, depth })}
                                    {#if entry.children?.length && !isEntryCollapsed(entry.key)}
                                        {@render renderEntries(entry.children, depth + 1)}
                                    {/if}
                                {/each}
                            {/snippet}
                            {@render renderEntries(section.entries)}
                        {:else}
                            {#each section.entries as entry (entry.key)}
                                {@render renderFlatEntry(entry)}
                            {/each}
                        {/if}
                    {/if}
                </section>
            {/each}
        {/if}
    </div>
{/if}
