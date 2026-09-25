<script lang="ts">
    import { onDestroy } from "svelte";
    import { Menu, showMessage, type App } from "siyuan";

    import { TAB_DEFINITIONS, type SidebarHubPreferences, type SidebarTabId } from "./preferences";
    import { buildCalendarMonth } from "./calendar";
    import {
        BOOKMARK_SORT_FIELDS,
        createBookmarkNavigator,
        type BookmarkSortField,
        type BookmarkViewGroup,
        type SortDirection,
    } from "./bookmarks";
    import { loadBookmarkGroups, openBookmark } from "./bookmark-siyuan";

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
    const bookmarkNavigator = createBookmarkNavigator({
        load: loadBookmarkGroups,
        open: (blockId) => openBookmark(app, blockId),
    });
    let preferences = $state<SidebarHubPreferences>();
    let visibleYear = $state(today.getFullYear());
    let visibleMonth = $state(today.getMonth());
    let selectedDate = $state("");
    let bookmarkQuery = $state("");
    let bookmarkSortField = $state<BookmarkSortField>("name");
    let bookmarkSortDirection = $state<SortDirection>("asc");
    let bookmarkGroups = $state<BookmarkViewGroup[]>([]);
    let bookmarkStatus = $state<"idle" | "loading" | "ready" | "error">("idle");
    let bookmarkError = $state("");
    let bookmarkRequestId = 0;
    let bookmarkSearchTimer: ReturnType<typeof setTimeout> | undefined;
    let calendar = $derived(buildCalendarMonth(visibleYear, visibleMonth, today));
    let visibleTabs = $derived(TAB_DEFINITIONS.filter((tab) => preferences.visibleTabs[tab.id]));

    initializePreferences();

    $effect(() => {
        if (preferences.activeTab === "bookmarks" && bookmarkStatus === "idle") {
            void updateBookmarks();
        }
    });

    onDestroy(() => clearTimeout(bookmarkSearchTimer));

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
            bookmarkNavigator.invalidate();
        }
        bookmarkStatus = "loading";
        bookmarkError = "";

        try {
            const groups = await bookmarkNavigator.query({
                query: bookmarkQuery,
                sort: {
                    field: bookmarkSortField,
                    direction: bookmarkSortDirection,
                },
            });
            if (requestId !== bookmarkRequestId) {
                return;
            }
            bookmarkGroups = groups;
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

    async function openBookmarkEntry(groupIndex: number, entryIndex: number) {
        try {
            await bookmarkNavigator.open(bookmarkGroups[groupIndex].entries[entryIndex]);
        } catch {
            showMessage(translations.bookmarks.openError, 6000, "error");
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

            {#if bookmarkStatus === "loading" && bookmarkGroups.length === 0}
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
            {:else if bookmarkStatus === "ready" && bookmarkGroups.length === 0}
                <div class="sidebar-hub__state">
                    <svg aria-hidden="true"><use href="#iconBookmark"></use></svg>
                    <p>{bookmarkQuery.trim() ? translations.bookmarks.noMatches : translations.bookmarks.empty}</p>
                </div>
            {:else}
                <div class="sidebar-hub__bookmark-list" aria-busy={bookmarkStatus === "loading"}>
                    {#each bookmarkGroups as group, groupIndex (group.name)}
                        <section class="sidebar-hub__bookmark-group" aria-label={`${translations.bookmarks.groupLabel}：${group.name}`}>
                            <h3>{group.name}</h3>
                            {#each group.entries as entry, entryIndex (entry.id)}
                                <button
                                    type="button"
                                    class="sidebar-hub__list-item"
                                    title={entry.label}
                                    onclick={() => openBookmarkEntry(groupIndex, entryIndex)}
                                >
                                    <svg aria-hidden="true"><use href={entry.id === entry.rootID ? "#iconFile" : "#iconBookmark"}></use></svg>
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
