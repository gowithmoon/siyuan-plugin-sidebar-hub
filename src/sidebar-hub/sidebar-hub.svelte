<script lang="ts">
    import { showMessage, type App } from "siyuan";

    import type { EntrySourceSort } from "./entry-source";
    import {
        TAB_DEFINITIONS,
        type SidebarHubPreferences,
        type SidebarHubSortField,
        type SidebarTabId,
    } from "./preferences";
    import type { SourceInvalidation } from "./source-invalidation";
    import { buildCalendarMonth, toDateKey } from "./calendar";
    import { createBookmarkSource } from "./bookmarks";
    import { loadBookmarkGroups, openBookmark } from "./bookmark-siyuan";
    import { createTagSource } from "./tags";
    import { loadTags, openTag } from "./tag-siyuan";
    import { createDatabaseSource } from "./databases";
    import { loadDatabases, openDatabase } from "./database-siyuan";
    import { createPageSource } from "./pages";
    import { loadPageBlockAttrs, loadPageDocuments, loadPageNotebooks, openPage } from "./page-siyuan";
    import { createDailyNoteNavigator, DailyNoteNavigationError } from "./daily-notes";
    import {
        confirmDailyNoteCreation,
        createTodayDailyNote,
        loadDailyNoteBlockAttrs,
        loadDailyNoteDocuments,
        loadDailyNotebookConfig,
        loadDailyNotebooks,
        openDailyNote,
    } from "./daily-note-siyuan";
    import EntrySourcePanel from "./entry-source-panel.svelte";

    interface PanelTranslations {
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

    interface Translations {
        title: string;
        today: string;
        previousMonth: string;
        nextMonth: string;
        minimize: string;
        createDailyNoteTitle: string;
        createDailyNoteMessage: string;
        dailyNotebookRequired: string;
        dailyNotebookClosed: string;
        dateCreationUnsupported: string;
        dailyNoteLoadError: string;
        dailyNoteOpenError: string;
        tabs: Record<SidebarTabId, string>;
        bookmarks: PanelTranslations & { groupLabel: string };
        tags: PanelTranslations;
        databases: PanelTranslations;
        pages: PanelTranslations & { progress: string };
    }

    interface Props {
        app: App;
        preferences: SidebarHubPreferences;
        translations: Translations;
        instanceId: string;
        onActiveTabChange: (tabId: SidebarTabId) => void;
        onSortChange: (tabId: SidebarTabId, sort: EntrySourceSort<SidebarHubSortField>) => void;
    }

    interface EntrySourcePanelHandle {
        invalidate: () => Promise<void>;
    }

    let {
        app,
        preferences: initialPreferences,
        translations,
        instanceId,
        onActiveTabChange,
        onSortChange,
    }: Props = $props();
    const today = new Date();
    const bookmarkSource = createBookmarkSource({
        load: loadBookmarkGroups,
        open: (blockId) => openBookmark(app, blockId),
    });
    const tagSource = createTagSource({
        load: loadTags,
        open: (label) => openTag(app, label),
    });
    const databaseSource = createDatabaseSource({
        load: loadDatabases,
        open: (blockId) => openDatabase(app, blockId),
    });
    const pageSource = createPageSource({
        listNotebooks: loadPageNotebooks,
        listDocuments: loadPageDocuments,
        getBlockAttrs: loadPageBlockAttrs,
        open: (documentId) => openPage(app, documentId),
    });
    let preferences = $state<SidebarHubPreferences>();
    let visibleYear = $state(today.getFullYear());
    let visibleMonth = $state(today.getMonth());
    let selectedDate = $state("");
    let dailyNoteDates = $state<Record<string, string>>({});
    let openingDate = $state(false);
    let bookmarkPanel: EntrySourcePanelHandle;
    let tagPanel: EntrySourcePanelHandle;
    let databasePanel: EntrySourcePanelHandle;
    let pagePanel: EntrySourcePanelHandle;
    let monthRequest = 0;
    let calendar = $derived(buildCalendarMonth(visibleYear, visibleMonth, today));
    let visibleTabs = $derived(TAB_DEFINITIONS.filter((tab) => preferences.visibleTabs[tab.id]));
    const dailyNoteNavigator = createDailyNoteNavigator({
        selectedNotebookId: () => preferences.dailyNotebookId,
        listNotebooks: loadDailyNotebooks,
        getNotebookConfig: loadDailyNotebookConfig,
        listDocuments: loadDailyNoteDocuments,
        getBlockAttrs: loadDailyNoteBlockAttrs,
        confirmCreate: (date) => confirmDailyNoteCreation(
            translations.createDailyNoteTitle,
            translations.createDailyNoteMessage.replace("{date}", date),
        ),
        createToday: createTodayDailyNote,
        open: (documentId) => openDailyNote(app, documentId),
        today: () => toDateKey(today),
    });

    initializePreferences();

    $effect(() => {
        const year = visibleYear;
        const month = visibleMonth;
        const notebookId = preferences.dailyNotebookId;
        void loadCalendarMonth(year, month, notebookId);
    });

    function initializePreferences() {
        preferences = initialPreferences;
    }

    export function updatePreferences(nextPreferences: SidebarHubPreferences) {
        if (preferences.dailyNotebookId !== nextPreferences.dailyNotebookId) {
            dailyNoteNavigator.invalidate();
        }
        preferences = nextPreferences;
    }

    export async function invalidateSources(invalidation: SourceInvalidation) {
        const panels: Record<SidebarTabId, EntrySourcePanelHandle> = {
            bookmarks: bookmarkPanel,
            tags: tagPanel,
            databases: databasePanel,
            pages: pagePanel,
        };
        await Promise.all(invalidation.tabs.map((tabId) => panels[tabId]?.invalidate()));
    }

    function persistSort(tabId: SidebarTabId, sort: EntrySourceSort<string>) {
        onSortChange(tabId, sort as EntrySourceSort<SidebarHubSortField>);
    }

    function moveMonth(offset: number) {
        const nextMonth = new Date(visibleYear, visibleMonth + offset, 1);
        visibleYear = nextMonth.getFullYear();
        visibleMonth = nextMonth.getMonth();
    }

    function returnToToday() {
        visibleYear = today.getFullYear();
        visibleMonth = today.getMonth();
        void openCalendarDate(toDateKey(today));
    }

    function selectDate(date: string) {
        void openCalendarDate(date);
    }

    async function loadCalendarMonth(year: number, month: number, notebookId: string) {
        const requestId = ++monthRequest;
        if (!notebookId) {
            dailyNoteDates = {};
            return;
        }
        try {
            const result = await dailyNoteNavigator.loadMonth(year, month);
            if (requestId === monthRequest) {
                dailyNoteDates = result.dates;
            }
        } catch (error) {
            if (requestId === monthRequest) {
                dailyNoteDates = {};
                if (!(error instanceof DailyNoteNavigationError)) {
                    showMessage(translations.dailyNoteLoadError, 6000, "error");
                }
            }
        }
    }

    async function openCalendarDate(date: string) {
        if (openingDate) {
            return;
        }
        selectedDate = date;
        openingDate = true;
        try {
            const result = await dailyNoteNavigator.openDate(date);
            if (result === "created") {
                dailyNoteDates = { ...dailyNoteDates, [date]: "created" };
            }
        } catch (error) {
            showMessage(dailyNoteErrorMessage(error), 6000, "error");
        } finally {
            openingDate = false;
        }
    }

    function dailyNoteErrorMessage(error: unknown) {
        if (error instanceof DailyNoteNavigationError) {
            if (error.code === "notebook-unconfigured") {
                return translations.dailyNotebookRequired;
            }
            if (error.code === "notebook-closed") {
                return translations.dailyNotebookClosed;
            }
            return translations.dateCreationUnsupported;
        }
        return translations.dailyNoteOpenError;
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
                    class:sidebar-hub__day--has-note={Boolean(dailyNoteDates[day.date])}
                    class="sidebar-hub__day"
                    aria-label={day.date}
                    aria-pressed={selectedDate === day.date}
                    tabindex={day.isCurrentMonth ? 0 : -1}
                    disabled={openingDate}
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
        <div class:fn__none={preferences.activeTab !== "bookmarks"} class="sidebar-hub__source-panel">
            <EntrySourcePanel
                bind:this={bookmarkPanel}
                source={bookmarkSource}
                translations={translations.bookmarks}
                emptyIcon="iconBookmark"
                sectionLabel={translations.bookmarks.groupLabel}
                active={preferences.activeTab === "bookmarks"}
                initialSort={preferences.sorts.bookmarks}
                onSortChange={(sort) => persistSort("bookmarks", sort)}
            />
        </div>
        <div class:fn__none={preferences.activeTab !== "tags"} class="sidebar-hub__source-panel">
            <EntrySourcePanel
                bind:this={tagPanel}
                source={tagSource}
                translations={translations.tags}
                emptyIcon="iconTag"
                sectionLabel={translations.tabs.tags}
                showSectionLabels={false}
                active={preferences.activeTab === "tags"}
                initialSort={preferences.sorts.tags}
                onSortChange={(sort) => persistSort("tags", sort)}
            />
        </div>
        <div class:fn__none={preferences.activeTab !== "databases"} class="sidebar-hub__source-panel">
            <EntrySourcePanel
                bind:this={databasePanel}
                source={databaseSource}
                translations={translations.databases}
                emptyIcon="iconDatabase"
                sectionLabel={translations.tabs.databases}
                showSectionLabels={false}
                active={preferences.activeTab === "databases"}
                initialSort={preferences.sorts.databases}
                onSortChange={(sort) => persistSort("databases", sort)}
            />
        </div>
        <div class:fn__none={preferences.activeTab !== "pages"} class="sidebar-hub__source-panel">
            <EntrySourcePanel
                bind:this={pagePanel}
                source={pageSource}
                translations={translations.pages}
                emptyIcon="iconFile"
                sectionLabel={translations.tabs.pages}
                showSectionLabels={false}
                active={preferences.activeTab === "pages"}
                initialSort={preferences.sorts.pages}
                onSortChange={(sort) => persistSort("pages", sort)}
            />
        </div>
    </div>
</div>
