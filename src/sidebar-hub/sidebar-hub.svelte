<script lang="ts">
    import { onDestroy } from "svelte";
    import { Menu, showMessage, type App } from "siyuan";

    import { TAB_DEFINITIONS, type SidebarHubPreferences, type SidebarTabId } from "./preferences";
    import { buildCalendarMonth } from "./calendar";
    import {
        BOOKMARK_SORT_FIELDS,
        createBookmarkSource,
        type BookmarkSortField,
    } from "./bookmarks";
    import { loadBookmarkGroups, openBookmark } from "./bookmark-siyuan";
    import { createTagSource, TAG_SORT_FIELDS, type TagSortField } from "./tags";
    import { loadTags, openTag } from "./tag-siyuan";
    import type { EntrySourceSection, SortDirection } from "./entry-source";

    interface Translations {
        title: string;
        today: string;
        previousMonth: string;
        nextMonth: string;
        minimize: string;
        contentPending: string;
        tabs: Record<SidebarTabId, string>;
        bookmarks: {
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
            groupLabel: string;
            sortOptions: Record<BookmarkSortField, string>;
        };
        tags: {
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
            sortOptions: Record<TagSortField, string>;
        };
    }

    interface Props {
        app: App;
        preferences: SidebarHubPreferences;
        translations: Translations;
        instanceId: string;
        onActiveTabChange: (tabId: SidebarTabId) => void;
    }

    let { app, preferences: initialPreferences, translations, instanceId, onActiveTabChange }: Props = $props();
    const today = new Date();
    const bookmarkSource = createBookmarkSource({
        load: loadBookmarkGroups,
        open: (blockId) => openBookmark(app, blockId),
    });
    const tagSource = createTagSource({
        load: loadTags,
        open: (label) => openTag(app, label),
    });
    let preferences = $state<SidebarHubPreferences>();
    let visibleYear = $state(today.getFullYear());
    let visibleMonth = $state(today.getMonth());
    let selectedDate = $state("");
    let bookmarkQuery = $state("");
    let bookmarkSortField = $state<BookmarkSortField>("name");
    let bookmarkSortDirection = $state<SortDirection>("asc");
    let bookmarkSections = $state<EntrySourceSection[]>([]);
    let bookmarkStatus = $state<"idle" | "loading" | "ready" | "error">("idle");
    let bookmarkError = $state("");
    let bookmarkRequestId = 0;
    let bookmarkSearchTimer: ReturnType<typeof setTimeout> | undefined;
    let tagQuery = $state("");
    let tagSortField = $state<TagSortField>("name");
    let tagSortDirection = $state<SortDirection>("asc");
    let tagSections = $state<EntrySourceSection[]>([]);
    let tagStatus = $state<"idle" | "loading" | "ready" | "error">("idle");
    let tagError = $state("");
    let tagRequestId = 0;
    let tagSearchTimer: ReturnType<typeof setTimeout> | undefined;
    let calendar = $derived(buildCalendarMonth(visibleYear, visibleMonth, today));
    let visibleTabs = $derived(TAB_DEFINITIONS.filter((tab) => preferences.visibleTabs[tab.id]));

    initializePreferences();

    $effect(() => {
        if (preferences.activeTab === "bookmarks" && bookmarkStatus === "idle") {
            void updateBookmarks();
        }
        if (preferences.activeTab === "tags" && tagStatus === "idle") {
            void updateTags();
        }
    });

    onDestroy(() => {
        clearTimeout(bookmarkSearchTimer);
        clearTimeout(tagSearchTimer);
    });

    function initializePreferences() {
        preferences = initialPreferences;
    }

    export function updatePreferences(nextPreferences: SidebarHubPreferences) {
        preferences = nextPreferences;
    }

    function moveMonth(offset: number) {
        const nextMonth = new Date(visibleYear, visibleMonth + offset, 1);
        visibleYear = nextMonth.getFullYear();
        visibleMonth = nextMonth.getMonth();
    }

    function returnToToday() {
        visibleYear = today.getFullYear();
        visibleMonth = today.getMonth();
        selectedDate = calendar.days.find((day) => day.isToday)?.date ?? "";
    }

    function selectDate(date: string) {
        selectedDate = date;
    }

    async function updateBookmarks(options: { invalidate?: boolean } = {}) {
        const requestId = ++bookmarkRequestId;
        if (options.invalidate) {
            bookmarkSource.invalidate();
        }
        bookmarkStatus = "loading";
        bookmarkError = "";

        try {
            const sections = await bookmarkSource.query({
                query: bookmarkQuery,
                sort: {
                    field: bookmarkSortField,
                    direction: bookmarkSortDirection,
                },
            });
            if (requestId !== bookmarkRequestId) {
                return;
            }
            bookmarkSections = sections;
            bookmarkStatus = "ready";
        } catch (error) {
            if (requestId !== bookmarkRequestId) {
                return;
            }
            bookmarkError = error instanceof Error && error.message
                ? error.message
                : translations.bookmarks.loadError;
            bookmarkStatus = "error";
        }
    }

    function changeBookmarkQuery(event: Event) {
        bookmarkQuery = (event.currentTarget as HTMLInputElement).value;
        clearTimeout(bookmarkSearchTimer);
        bookmarkSearchTimer = setTimeout(() => {
            if (bookmarkStatus !== "error") {
                void updateBookmarks();
            }
        }, 180);
    }

    function setBookmarkSortField(field: BookmarkSortField) {
        bookmarkSortField = field;
        if (bookmarkStatus !== "error") {
            void updateBookmarks();
        }
    }

    function openBookmarkSortMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        const button = event.currentTarget as HTMLButtonElement;
        const menu = new Menu("sidebar-hub-bookmark-sort");
        if (menu.isOpen) {
            return;
        }

        for (const field of BOOKMARK_SORT_FIELDS) {
            menu.addItem({
                label: translations.bookmarks.sortOptions[field],
                icon: field === bookmarkSortField ? "iconSelect" : undefined,
                click: () => setBookmarkSortField(field),
            });
        }

        const rect = button.getBoundingClientRect();
        menu.open({
            x: rect.left,
            y: rect.bottom,
            h: rect.height,
            w: rect.width,
        });
    }

    function toggleBookmarkSortDirection() {
        bookmarkSortDirection = bookmarkSortDirection === "asc" ? "desc" : "asc";
        if (bookmarkStatus !== "error") {
            void updateBookmarks();
        }
    }

    async function updateTags(options: { invalidate?: boolean } = {}) {
        const requestId = ++tagRequestId;
        if (options.invalidate) {
            tagSource.invalidate();
        }
        tagStatus = "loading";
        tagError = "";

        try {
            const sections = await tagSource.query({
                query: tagQuery,
                sort: {
                    field: tagSortField,
                    direction: tagSortDirection,
                },
            });
            if (requestId !== tagRequestId) {
                return;
            }
            tagSections = sections;
            tagStatus = "ready";
        } catch (error) {
            if (requestId !== tagRequestId) {
                return;
            }
            tagError = error instanceof Error && error.message
                ? error.message
                : translations.tags.loadError;
            tagStatus = "error";
        }
    }

    function changeTagQuery(event: Event) {
        tagQuery = (event.currentTarget as HTMLInputElement).value;
        clearTimeout(tagSearchTimer);
        tagSearchTimer = setTimeout(() => {
            if (tagStatus !== "error") {
                void updateTags();
            }
        }, 180);
    }

    function setTagSortField(field: TagSortField) {
        tagSortField = field;
        if (tagStatus !== "error") {
            void updateTags();
        }
    }

    function openTagSortMenu(event: MouseEvent) {
        event.preventDefault();
        event.stopPropagation();

        const button = event.currentTarget as HTMLButtonElement;
        const menu = new Menu("sidebar-hub-tag-sort");
        if (menu.isOpen) {
            return;
        }

        for (const field of TAG_SORT_FIELDS) {
            menu.addItem({
                label: translations.tags.sortOptions[field],
                icon: field === tagSortField ? "iconSelect" : undefined,
                click: () => setTagSortField(field),
            });
        }

        const rect = button.getBoundingClientRect();
        menu.open({
            x: rect.left,
            y: rect.bottom,
            h: rect.height,
            w: rect.width,
        });
    }

    function toggleTagSortDirection() {
        tagSortDirection = tagSortDirection === "asc" ? "desc" : "asc";
        if (tagStatus !== "error") {
            void updateTags();
        }
    }

    async function openBookmarkEntry(key: string) {
        try {
            await bookmarkSource.open(key);
        } catch {
            showMessage(translations.bookmarks.openError, 6000, "error");
        }
    }

    async function openTagEntry(key: string) {
        try {
            await tagSource.open(key);
        } catch {
            showMessage(translations.tags.openError, 6000, "error");
        }
    }
</script>

<div class="sidebar-hub fn__flex-column">
    <div class="block__icons">
        <div class="block__logo">
            <svg class="block__logoicon" aria-hidden="true"><use href="#iconCalendar"></use></svg>
            {translations.title}
        </div>
        <span class="fn__flex-1 fn__space"></span>
        <button type="button" data-type="min" class="block__icon ariaLabel" data-position="north" aria-label={translations.minimize}>
            <svg aria-hidden="true"><use href="#iconMin"></use></svg>
        </button>
    </div>

    <section class="sidebar-hub__calendar" aria-label={translations.title}>
        <div class="sidebar-hub__calendar-header">
            <strong>{calendar.year} / {String(calendar.month + 1).padStart(2, "0")}</strong>
            <div class="sidebar-hub__calendar-navigation">
                <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south" aria-label={translations.previousMonth} onclick={() => moveMonth(-1)}>
                    <svg aria-hidden="true"><use href="#iconLeft"></use></svg>
                </button>
                <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south" aria-label={translations.today} onclick={returnToToday}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3 3 10v11h7v-7h4v7h7V10L12 3Z"></path>
                    </svg>
                </button>
                <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south" aria-label={translations.nextMonth} onclick={() => moveMonth(1)}>
                    <svg aria-hidden="true"><use href="#iconRight"></use></svg>
                </button>
            </div>
        </div>

        <div class="sidebar-hub__weekdays" aria-hidden="true">
            {#each ["一", "二", "三", "四", "五", "六", "日"] as weekday}
                <span>{weekday}</span>
            {/each}
        </div>
        <div class="sidebar-hub__days">
            {#each calendar.days as day (day.date)}
                <button
                    type="button"
                    class:sidebar-hub__day--outside={!day.isCurrentMonth}
                    class:sidebar-hub__day--today={day.isToday}
                    class:sidebar-hub__day--selected={selectedDate === day.date}
                    class="sidebar-hub__day"
                    aria-label={day.date}
                    aria-pressed={selectedDate === day.date}
                    tabindex={day.isCurrentMonth ? 0 : -1}
                    onclick={() => selectDate(day.date)}
                >
                    {day.day}
                </button>
            {/each}
        </div>
    </section>

    <div class="sidebar-hub__tabs" role="tablist" aria-label={translations.title}>
        {#each visibleTabs as tab (tab.id)}
            <button
                type="button"
                id={`${instanceId}-tab-${tab.id}`}
                class:sidebar-hub__tab--active={preferences.activeTab === tab.id}
                class="sidebar-hub__tab"
                role="tab"
                aria-selected={preferences.activeTab === tab.id}
                aria-controls={`${instanceId}-panel`}
                tabindex={preferences.activeTab === tab.id ? 0 : -1}
                onclick={() => onActiveTabChange(tab.id)}
            >
                {translations.tabs[tab.id]}
            </button>
        {/each}
    </div>

    <div id={`${instanceId}-panel`} class="sidebar-hub__content fn__flex-1" role="tabpanel" aria-labelledby={`${instanceId}-tab-${preferences.activeTab}`}>
        {#if preferences.activeTab === "bookmarks"}
            <div class="sidebar-hub__tools">
                <label class="sidebar-hub__search">
                    <svg aria-hidden="true"><use href="#iconSearch"></use></svg>
                    <input
                        type="search"
                        class="b3-text-field"
                        value={bookmarkQuery}
                        placeholder={translations.bookmarks.searchPlaceholder}
                        aria-label={translations.bookmarks.searchPlaceholder}
                        oninput={changeBookmarkQuery}
                    />
                </label>
                <button
                    type="button"
                    class="block__icon block__icon--show ariaLabel"
                    data-position="south"
                    aria-label={`${translations.bookmarks.sortLabel}：${translations.bookmarks.sortOptions[bookmarkSortField]}`}
                    onclick={openBookmarkSortMenu}
                >
                    <svg aria-hidden="true"><use href="#iconSort"></use></svg>
                </button>
                <button
                    type="button"
                    class="block__icon block__icon--show ariaLabel sidebar-hub__sort-direction"
                    data-position="south"
                    aria-label={bookmarkSortDirection === "asc" ? translations.bookmarks.sortAscending : translations.bookmarks.sortDescending}
                    aria-pressed={bookmarkSortDirection === "desc"}
                    onclick={toggleBookmarkSortDirection}
                >
                    <svg aria-hidden="true"><use href={bookmarkSortDirection === "asc" ? "#iconUp" : "#iconDown"}></use></svg>
                </button>
                <button
                    type="button"
                    class="block__icon block__icon--show ariaLabel"
                    data-position="south"
                    aria-label={translations.bookmarks.refresh}
                    onclick={() => updateBookmarks({ invalidate: true })}
                >
                    <svg class:fn__rotate={bookmarkStatus === "loading"} aria-hidden="true"><use href="#iconRefresh"></use></svg>
                </button>
            </div>

            {#if bookmarkStatus === "loading" && bookmarkSections.length === 0}
                <div class="sidebar-hub__state" role="status">
                    <svg class="fn__rotate" aria-hidden="true"><use href="#iconRefresh"></use></svg>
                    <p>{translations.bookmarks.loading}</p>
                </div>
            {:else if bookmarkStatus === "error"}
                <div class="sidebar-hub__state" role="alert">
                    <svg aria-hidden="true"><use href="#iconInfo"></use></svg>
                    <p>{translations.bookmarks.loadError}</p>
                    {#if bookmarkError && bookmarkError !== translations.bookmarks.loadError}
                        <small>{bookmarkError}</small>
                    {/if}
                    <button type="button" class="b3-button b3-button--outline" onclick={() => updateBookmarks()}>
                        {translations.bookmarks.retry}
                    </button>
                </div>
            {:else if bookmarkStatus === "ready" && bookmarkSections.length === 0}
                <div class="sidebar-hub__state">
                    <svg aria-hidden="true"><use href="#iconBookmark"></use></svg>
                    <p>{bookmarkQuery.trim() ? translations.bookmarks.noMatches : translations.bookmarks.empty}</p>
                </div>
            {:else}
                <div class="sidebar-hub__entry-list" aria-busy={bookmarkStatus === "loading"}>
                    {#each bookmarkSections as group (group.key)}
                        <section class="sidebar-hub__entry-section" aria-label={`${translations.bookmarks.groupLabel}：${group.label}`}>
                            {#if group.label}<h3>{group.label}</h3>{/if}
                            {#each group.entries as entry (entry.key)}
                                <button
                                    type="button"
                                    class="sidebar-hub__list-item"
                                    title={entry.label}
                                    onclick={() => openBookmarkEntry(entry.key)}
                                >
                                    <svg aria-hidden="true"><use href={`#${entry.icon}`}></use></svg>
                                    <span>{entry.label}</span>
                                </button>
                            {/each}
                        </section>
                    {/each}
                </div>
            {/if}
        {:else if preferences.activeTab === "tags"}
            <div class="sidebar-hub__tools">
                <label class="sidebar-hub__search">
                    <svg aria-hidden="true"><use href="#iconSearch"></use></svg>
                    <input
                        type="search"
                        class="b3-text-field"
                        value={tagQuery}
                        placeholder={translations.tags.searchPlaceholder}
                        aria-label={translations.tags.searchPlaceholder}
                        oninput={changeTagQuery}
                    />
                </label>
                <button
                    type="button"
                    class="block__icon block__icon--show ariaLabel"
                    data-position="south"
                    aria-label={`${translations.tags.sortLabel}：${translations.tags.sortOptions[tagSortField]}`}
                    onclick={openTagSortMenu}
                >
                    <svg aria-hidden="true"><use href="#iconSort"></use></svg>
                </button>
                <button
                    type="button"
                    class="block__icon block__icon--show ariaLabel sidebar-hub__sort-direction"
                    data-position="south"
                    aria-label={tagSortDirection === "asc" ? translations.tags.sortAscending : translations.tags.sortDescending}
                    aria-pressed={tagSortDirection === "desc"}
                    onclick={toggleTagSortDirection}
                >
                    <svg aria-hidden="true"><use href={tagSortDirection === "asc" ? "#iconUp" : "#iconDown"}></use></svg>
                </button>
                <button
                    type="button"
                    class="block__icon block__icon--show ariaLabel"
                    data-position="south"
                    aria-label={translations.tags.refresh}
                    onclick={() => updateTags({ invalidate: true })}
                >
                    <svg class:fn__rotate={tagStatus === "loading"} aria-hidden="true"><use href="#iconRefresh"></use></svg>
                </button>
            </div>

            {#if tagStatus === "loading" && tagSections.length === 0}
                <div class="sidebar-hub__state" role="status">
                    <svg class="fn__rotate" aria-hidden="true"><use href="#iconRefresh"></use></svg>
                    <p>{translations.tags.loading}</p>
                </div>
            {:else if tagStatus === "error"}
                <div class="sidebar-hub__state" role="alert">
                    <svg aria-hidden="true"><use href="#iconInfo"></use></svg>
                    <p>{translations.tags.loadError}</p>
                    {#if tagError && tagError !== translations.tags.loadError}
                        <small>{tagError}</small>
                    {/if}
                    <button type="button" class="b3-button b3-button--outline" onclick={() => updateTags()}>
                        {translations.tags.retry}
                    </button>
                </div>
            {:else if tagStatus === "ready" && tagSections.length === 0}
                <div class="sidebar-hub__state">
                    <svg aria-hidden="true"><use href="#iconTag"></use></svg>
                    <p>{tagQuery.trim() ? translations.tags.noMatches : translations.tags.empty}</p>
                </div>
            {:else}
                <div class="sidebar-hub__entry-list" aria-busy={tagStatus === "loading"}>
                    {#each tagSections as section (section.key)}
                        <section class="sidebar-hub__entry-section" aria-label={translations.tabs.tags}>
                            {#if section.label}<h3>{section.label}</h3>{/if}
                            {#each section.entries as entry (entry.key)}
                                <button
                                    type="button"
                                    class="sidebar-hub__list-item"
                                    title={entry.label}
                                    onclick={() => openTagEntry(entry.key)}
                                >
                                    <svg aria-hidden="true"><use href={`#${entry.icon}`}></use></svg>
                                    <span>{entry.label}</span>
                                </button>
                            {/each}
                        </section>
                    {/each}
                </div>
            {/if}
        {:else}
            <div class="sidebar-hub__state">
                <svg aria-hidden="true"><use href={`#${TAB_DEFINITIONS.find((tab) => tab.id === preferences.activeTab)!.icon}`}></use></svg>
                <p>{translations.contentPending}</p>
            </div>
        {/if}
    </div>
</div>
