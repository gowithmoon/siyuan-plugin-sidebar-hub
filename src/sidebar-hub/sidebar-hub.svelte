<script lang="ts">
    import { Menu, showMessage, type App } from "siyuan";

    import type { EntrySourceEntry, EntrySourceSection, EntrySourceSort } from "./entry-source";
    import type { EntryMenuPosition } from "./entry-menu-event";
    import {
        TAB_DEFINITIONS,
        type SidebarHubPreferences,
        type SidebarHubSortField,
        type SidebarTabId,
    } from "./preferences";
    import type { SourceInvalidation } from "./source-invalidation";
    import { buildCalendarMonth, toDateKey } from "./calendar";
    import { createBookmarkSource } from "./bookmarks";
    import {
        confirmBookmarkRemoval,
        loadBookmarkBlockAttributes,
        loadBookmarkGroups,
        openBookmark,
        openBookmarkBlockAttributes,
        removeBookmark,
        renameBookmark,
        requestBookmarkRename,
        setBlockBookmarks,
    } from "./bookmark-siyuan";
    import { createBookmarkMenuActions } from "./bookmark-menu";
    import { createBookmarkGroupMenuActions } from "./bookmark-group-menu";
    import { createBookmarkDropHandlers } from "./bookmark-drop";
    import { createTagSource } from "./tags";
    import { loadTags, openTag } from "./tag-siyuan";
    import { createDatabaseSource } from "./databases";
    import { loadDatabaseCount, loadDatabases, openDatabase } from "./database-siyuan";
    import { createPageSource, type PageSourceChange } from "./pages";
    import {
        confirmPageDocumentRemoval,
        loadPageBlockAttrs,
        loadPageDocRefCounts,
        loadPageDocumentAttributes,
        loadPageDocuments,
        loadPageNotebooks,
        openPage,
        openPageDocumentAttributes,
        removePageDocument,
        renamePageDocument,
        requestPageDocumentRename,
    } from "./page-siyuan";
    import { createPageDocumentMenuActions } from "./page-document-menu";
    import {
        createDailyNoteNavigator,
        DailyNoteNavigationError,
        type DailyNoteDirection,
    } from "./daily-notes";
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
        expandAll?: string;
        collapseAll?: string;
        expandNode?: string;
        collapseNode?: string;
    }

    interface Translations {
        title: string;
        calendar: string;
        weekdays: string[];
        today: string;
        year: string;
        month: string;
        yearUnit: string;
        monthUnit: string;
        previousYears: string;
        nextYears: string;
        previousDay: string;
        nextDay: string;
        noPreviousDailyNote: string;
        noNextDailyNote: string;
        dailyNoteExists: string;
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
        pages: PanelTranslations & { progress: string; actionError: string };
    }

    interface Props {
        app: App;
        preferences: SidebarHubPreferences;
        translations: Translations;
        instanceId: string;
        onActiveTabChange: (tabId: SidebarTabId) => void;
        onSortChange: (tabId: SidebarTabId, sort: EntrySourceSort<SidebarHubSortField>) => void;
        onBookmarkCollapsedChange: (keys: string[]) => void;
        onTagCollapsedChange: (keys: string[]) => void;
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
        onBookmarkCollapsedChange,
        onTagCollapsedChange,
    }: Props = $props();
    const today = new Date();
    const months = Array.from({ length: 12 }, (_, index) => index);
    const bookmarkSource = createBookmarkSource({
        load: loadBookmarkGroups,
        open: (blockId) => openBookmark(app, blockId),
    });
    const bookmarkDropHandlers = createBookmarkDropHandlers({
        isReadOnly: () => window.siyuan.config.readonly,
        workspaceDir: () => window.siyuan.config.system.workspaceDir,
        defaultBookmark: () => window.siyuan.languages.default,
        setBookmarks: setBlockBookmarks,
        onChanged: () => bookmarkPanel.invalidate(),
        reportError: (error) => showMessage(error instanceof Error && error.message ? error.message : translations.bookmarks.loadError, 6000, "error"),
    });
    const tagSource = createTagSource({
        load: loadTags,
        open: (label) => openTag(app, label),
    });
    const databaseSource = createDatabaseSource({
        load: loadDatabases,
        count: loadDatabaseCount,
        open: (blockId) => openDatabase(app, blockId),
    });
    const pageSource = createPageSource({
        listNotebooks: loadPageNotebooks,
        listDocuments: loadPageDocuments,
        getBlockAttrs: loadPageBlockAttrs,
        getDocRefCounts: loadPageDocRefCounts,
        open: (documentId) => openPage(app, documentId),
    });
    let preferences = $state<SidebarHubPreferences>();
    let visibleYear = $state(today.getFullYear());
    let visibleMonth = $state(today.getMonth());
    let openPicker = $state<"year" | "month" | null>(null);
    let yearPageEnd = $state(today.getFullYear());
    let selectedDate = $state("");
    let focusedDate = $state(toDateKey(today));
    let dailyNoteDates = $state<Record<string, string>>({});
    let openingDate = $state(false);
    let bookmarkPanel: EntrySourcePanelHandle;
    let tagPanel: EntrySourcePanelHandle;
    let databasePanel: EntrySourcePanelHandle;
    let pagePanel: EntrySourcePanelHandle;
    const pageDocumentMenuActions = createPageDocumentMenuActions({
        isReadOnly: () => window.siyuan.config.readonly,
        labels: {
            rename: window.siyuan.languages.rename,
            attributes: window.siyuan.languages.attr,
            remove: window.siyuan.languages.delete,
        },
        requestRename: ({ title }) => requestPageDocumentRename(title),
        renameDocument: renamePageDocument,
        loadAttributes: loadPageDocumentAttributes,
        openAttributes: openPageDocumentAttributes,
        confirmRemove: ({ title }) => confirmPageDocumentRemoval(title),
        removeDocument: removePageDocument,
        applyChange: applyPageChange,
        reportError: (error) => {
            const message = error instanceof Error && error.message
                ? error.message
                : translations.pages.actionError;
            showMessage(message, 6000, "error");
        },
    });
    const bookmarkMenuActions = createBookmarkMenuActions({
        isReadOnly: () => window.siyuan.config.readonly,
        documentActions: pageDocumentMenuActions,
        labels: {
            attributes: window.siyuan.languages.attr,
            removeBookmark: window.siyuan.languages.remove,
        },
        loadAttributes: loadBookmarkBlockAttributes,
        openAttributes: openBookmarkBlockAttributes,
        confirmRemoveBookmark: ({ title }) => confirmBookmarkRemoval(title),
        removeBookmark: async (id) => setBlockBookmarks([id], ""),
        onChanged: () => bookmarkPanel.invalidate(),
        reportError: (error) => showMessage(error instanceof Error && error.message ? error.message : translations.bookmarks.loadError, 6000, "error"),
    });
    const bookmarkGroupMenuActions = createBookmarkGroupMenuActions({
        isReadOnly: () => window.siyuan.config.readonly,
        labels: {
            rename: window.siyuan.languages.rename,
            remove: window.siyuan.languages.remove,
        },
        requestRename: requestBookmarkRename,
        renameBookmark,
        confirmRemove: confirmBookmarkRemoval,
        removeBookmark,
        onChanged: () => bookmarkPanel.invalidate(),
        reportError: (error) => showMessage(error instanceof Error && error.message ? error.message : translations.bookmarks.loadError, 6000, "error"),
    });
    let monthRequest = 0;
    let calendar = $derived(buildCalendarMonth(visibleYear, visibleMonth, today));
    let pickerYears = $derived(Array.from({ length: 16 }, (_, index) => yearPageEnd - 15 + index));
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
        const refreshes = invalidation.tabs.map((tabId) => {
            if (tabId === "pages" && invalidation.pageChange) {
                return applyPageChange(invalidation.pageChange);
            }
            return panels[tabId]?.invalidate();
        });
        if (invalidation.dailyNotes) {
            const removedIds = invalidation.pageChange?.kind === "remove"
                ? invalidation.pageChange.ids
                : [];
            if (removedIds.length > 0) {
                const removedDates = new Set(dailyNoteNavigator.removeDocuments(removedIds));
                if (removedDates.size > 0) {
                    dailyNoteDates = Object.fromEntries(
                        Object.entries(dailyNoteDates).filter(([date]) => !removedDates.has(date)),
                    );
                }
            } else {
                refreshes.push(loadCalendarMonth(visibleYear, visibleMonth, preferences.dailyNotebookId, true));
            }
        }
        await Promise.all(refreshes);
    }

    async function applyPageChange(change: PageSourceChange) {
        if (!pageSource.applyChange(change)) {
            await pagePanel.invalidate();
        }
        if (change.kind === "rename" || change.kind === "remove") {
            await bookmarkPanel.invalidate();
        }
    }

    function openBookmarkMenu(entry: EntrySourceEntry, position: EntryMenuPosition) {
        const menu = new Menu(`sidebar-hub-bookmark-${entry.key}`);
        if (menu.isOpen) {
            return;
        }
        for (const action of bookmarkMenuActions.forEntry(entry)) {
            menu.addItem({
                id: action.id,
                label: action.label,
                icon: action.icon,
                warning: action.warning,
                click: () => void action.execute(),
            });
        }
        menu.open(position);
    }

    function openBookmarkGroupMenu(section: EntrySourceSection, position: EntryMenuPosition) {
        const menu = new Menu(`sidebar-hub-bookmark-group-${section.key}`);
        if (menu.isOpen) {
            return;
        }
        for (const action of bookmarkGroupMenuActions.forGroup(section)) {
            menu.addItem({
                id: action.id,
                label: action.label,
                icon: action.icon,
                warning: action.warning,
                click: () => void action.execute(),
            });
        }
        menu.open(position);
    }

    function persistSort(tabId: SidebarTabId, sort: EntrySourceSort<string>) {
        onSortChange(tabId, sort as EntrySourceSort<SidebarHubSortField>);
    }

    function openPageDocumentMenu(entry: EntrySourceEntry, position: EntryMenuPosition) {
        const menu = new Menu(`sidebar-hub-page-document-${entry.key}`);
        if (menu.isOpen) {
            return;
        }
        for (const action of pageDocumentMenuActions.forDocument({ id: entry.key, title: entry.label })) {
            menu.addItem({
                id: action.id,
                label: action.label,
                icon: action.icon,
                warning: action.warning,
                click: () => {
                    void action.execute();
                },
            });
        }
        menu.open(position);
    }

    function selectVisibleDate(year: number, month: number, picker: "year" | "month") {
        visibleYear = year;
        visibleMonth = month;
        focusedDate = toDateKey(new Date(year, month, 1));
        openPicker = null;
        requestAnimationFrame(() => {
            document.querySelector<HTMLButtonElement>(
                `[data-sidebar-hub-instance="${instanceId}"] [data-period-trigger="${picker}"]`,
            )?.focus();
        });
    }

    function togglePicker(picker: "year" | "month") {
        if (openPicker === picker) {
            openPicker = null;
            return;
        }
        if (picker === "year") {
            yearPageEnd = visibleYear;
        }
        openPicker = picker;
        requestAnimationFrame(() => {
            document.querySelector<HTMLButtonElement>(
                `[data-sidebar-hub-instance="${instanceId}"] [data-${picker}-option="${picker === "year" ? visibleYear : visibleMonth}"]`,
            )?.focus();
        });
    }

    function closePickerOnWindowClick(event: MouseEvent) {
        if (event.target instanceof Element
            && event.target.closest(`[data-sidebar-hub-instance="${instanceId}"] .sidebar-hub__calendar-period`)) {
            return;
        }
        openPicker = null;
    }

    function handleWindowKeydown(event: KeyboardEvent) {
        if (event.key === "Escape" && openPicker) {
            const picker = openPicker;
            openPicker = null;
            event.preventDefault();
            requestAnimationFrame(() => {
                document.querySelector<HTMLButtonElement>(
                    `[data-sidebar-hub-instance="${instanceId}"] [data-period-trigger="${picker}"]`,
                )?.focus();
            });
        }
    }

    function moveYearPage(offset: number) {
        yearPageEnd += offset * 16;
    }

    function returnToToday() {
        visibleYear = today.getFullYear();
        visibleMonth = today.getMonth();
        focusedDate = toDateKey(today);
        void openCalendarDate(toDateKey(today));
    }

    function selectDate(date: string) {
        focusedDate = date;
        void openCalendarDate(date);
    }

    async function openAdjacentDailyNote(direction: DailyNoteDirection) {
        if (openingDate) {
            return;
        }
        openingDate = true;
        try {
            const date = await dailyNoteNavigator.openAdjacentDate(selectedDate || toDateKey(today), direction);
            selectedDate = date;
            focusCalendarDate(date);
        } catch (error) {
            showMessage(dailyNoteErrorMessage(error, direction), 6000, "error");
        } finally {
            openingDate = false;
        }
    }

    function handleCalendarKeydown(event: KeyboardEvent, date: string) {
        const offsets: Partial<Record<string, number>> = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -7,
            ArrowDown: 7,
        };
        const offset = offsets[event.key];
        if (offset === undefined) {
            return;
        }

        event.preventDefault();
        const target = dateFromKey(date);
        target.setDate(target.getDate() + offset);
        focusCalendarDate(toDateKey(target));
    }

    function focusCalendarDate(date: string) {
        const target = dateFromKey(date);
        focusedDate = date;
        visibleYear = target.getFullYear();
        visibleMonth = target.getMonth();
        requestAnimationFrame(() => {
            document.querySelector<HTMLButtonElement>(
                `[data-sidebar-hub-instance="${instanceId}"] [data-calendar-date="${date}"]`,
            )?.focus();
        });
    }

    function dateFromKey(date: string) {
        const [year, month, day] = date.split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    function calendarDateLabel(date: string, hasDailyNote: boolean) {
        return hasDailyNote ? `${date}: ${translations.dailyNoteExists}` : date;
    }

    function selectTab(tabId: SidebarTabId, focus: boolean) {
        onActiveTabChange(tabId);
        if (focus) {
            requestAnimationFrame(() => document.getElementById(`${instanceId}-tab-${tabId}`)?.focus());
        }
    }

    function handleTabKeydown(event: KeyboardEvent, tabId: SidebarTabId) {
        const currentIndex = visibleTabs.findIndex((tab) => tab.id === tabId);
        let nextIndex = currentIndex;
        if (event.key === "ArrowLeft") {
            nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
        } else if (event.key === "ArrowRight") {
            nextIndex = (currentIndex + 1) % visibleTabs.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = visibleTabs.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        selectTab(visibleTabs[nextIndex].id, true);
    }

    async function loadCalendarMonth(year: number, month: number, notebookId: string, refresh = false) {
        const requestId = ++monthRequest;
        if (!notebookId) {
            dailyNoteDates = {};
            return;
        }
        try {
            const result = refresh
                ? await dailyNoteNavigator.refreshMonth(year, month)
                : await dailyNoteNavigator.loadMonth(year, month);
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

    function dailyNoteErrorMessage(error: unknown, direction?: DailyNoteDirection) {
        if (error instanceof DailyNoteNavigationError) {
            if (error.code === "notebook-unconfigured") {
                return translations.dailyNotebookRequired;
            }
            if (error.code === "notebook-closed") {
                return translations.dailyNotebookClosed;
            }
            if (error.code === "no-adjacent-note") {
                return direction === "previous"
                    ? translations.noPreviousDailyNote
                    : translations.noNextDailyNote;
            }
            return translations.dateCreationUnsupported;
        }
        return translations.dailyNoteOpenError;
    }
</script>

<svelte:window onclick={closePickerOnWindowClick} onkeydown={handleWindowKeydown} />

<div class="sidebar-hub fn__flex-column" data-sidebar-hub-instance={instanceId}>
    <section class="sidebar-hub__calendar" aria-label={translations.calendar}>
        <div class="sidebar-hub__calendar-header">
            <div class="sidebar-hub__calendar-period">
                <button
                    type="button"
                    class="sidebar-hub__period-trigger"
                    data-period-trigger="year"
                    aria-label={`${translations.year}: ${visibleYear}`}
                    aria-haspopup="dialog"
                    aria-expanded={openPicker === "year"}
                    onclick={() => togglePicker("year")}
                >
                    {visibleYear}
                </button>
                <span>{translations.yearUnit}</span>
                <button
                    type="button"
                    class="sidebar-hub__period-trigger"
                    data-period-trigger="month"
                    aria-label={`${translations.month}: ${visibleMonth + 1}`}
                    aria-haspopup="dialog"
                    aria-expanded={openPicker === "month"}
                    onclick={() => togglePicker("month")}
                >
                    {visibleMonth + 1}
                </button>
                <span>{translations.monthUnit}</span>

                {#if openPicker === "year"}
                    <div class="sidebar-hub__period-picker sidebar-hub__year-picker" role="dialog" aria-label={translations.year} tabindex="-1">
                        <div class="sidebar-hub__year-picker-header">
                            <button type="button" class="block__icon block__icon--show" aria-label={translations.previousYears} onclick={() => moveYearPage(-1)}>
                                <svg aria-hidden="true"><use href="#iconLeft"></use></svg>
                            </button>
                            <span>{pickerYears[0]}–{pickerYears[pickerYears.length - 1]}</span>
                            <button type="button" class="block__icon block__icon--show" aria-label={translations.nextYears} onclick={() => moveYearPage(1)}>
                                <svg aria-hidden="true"><use href="#iconRight"></use></svg>
                            </button>
                        </div>
                        <div class="sidebar-hub__period-grid sidebar-hub__period-grid--years">
                            {#each pickerYears as year}
                                <button
                                    type="button"
                                    class:sidebar-hub__period-option--selected={year === visibleYear}
                                    class:sidebar-hub__period-option--today={year === today.getFullYear()}
                                    class="sidebar-hub__period-option"
                                    data-year-option={year}
                                    aria-pressed={year === visibleYear}
                                    onclick={() => selectVisibleDate(year, visibleMonth, "year")}
                                >{year}</button>
                            {/each}
                        </div>
                    </div>
                {:else if openPicker === "month"}
                    <div class="sidebar-hub__period-picker" role="dialog" aria-label={translations.month} tabindex="-1">
                        <div class="sidebar-hub__period-grid sidebar-hub__period-grid--months">
                            {#each months as month}
                                <button
                                    type="button"
                                    class:sidebar-hub__period-option--selected={month === visibleMonth}
                                    class="sidebar-hub__period-option"
                                    data-month-option={month}
                                    aria-pressed={month === visibleMonth}
                                    onclick={() => selectVisibleDate(visibleYear, month, "month")}
                                >{month + 1}{translations.monthUnit}</button>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
            <div class="sidebar-hub__calendar-navigation">
                <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south" aria-label={translations.previousDay} onclick={() => openAdjacentDailyNote("previous")}>
                    <svg aria-hidden="true"><use href="#iconLeft"></use></svg>
                </button>
                <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south" aria-label={translations.today} onclick={returnToToday}>
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3 3 10v11h7v-7h4v7h7V10L12 3Z"></path>
                    </svg>
                </button>
                <button type="button" class="block__icon block__icon--show ariaLabel" data-position="south" aria-label={translations.nextDay} onclick={() => openAdjacentDailyNote("next")}>
                    <svg aria-hidden="true"><use href="#iconRight"></use></svg>
                </button>
            </div>
        </div>

        <div class="sidebar-hub__weekdays" aria-hidden="true">
            {#each translations.weekdays as weekday}
                <span>{weekday}</span>
            {/each}
        </div>
        <div class="sidebar-hub__days" aria-busy={openingDate}>
            {#each calendar.days as day (day.date)}
                <button
                    type="button"
                    class:sidebar-hub__day--outside={!day.isCurrentMonth}
                    class:sidebar-hub__day--today={day.isToday}
                    class:sidebar-hub__day--selected={selectedDate === day.date}
                    class:sidebar-hub__day--has-note={Boolean(dailyNoteDates[day.date])}
                    class="sidebar-hub__day"
                    data-calendar-date={day.date}
                    aria-label={calendarDateLabel(day.date, Boolean(dailyNoteDates[day.date]))}
                    aria-current={day.isToday ? "date" : undefined}
                    aria-pressed={selectedDate === day.date}
                    tabindex={focusedDate === day.date ? 0 : -1}
                    disabled={openingDate}
                    onclick={() => selectDate(day.date)}
                    onkeydown={(event) => handleCalendarKeydown(event, day.date)}
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
                aria-controls={`${instanceId}-panel-${tab.id}`}
                tabindex={preferences.activeTab === tab.id ? 0 : -1}
                onclick={() => selectTab(tab.id, false)}
                onkeydown={(event) => handleTabKeydown(event, tab.id)}
            >
                {translations.tabs[tab.id]}
            </button>
        {/each}
    </div>

    <div class="sidebar-hub__content fn__flex-1">
        <div
            id={`${instanceId}-panel-bookmarks`}
            class="sidebar-hub__source-panel"
            role="tabpanel"
            aria-labelledby={`${instanceId}-tab-bookmarks`}
            hidden={preferences.activeTab !== "bookmarks"}
        >
            <EntrySourcePanel
                bind:this={bookmarkPanel}
                source={bookmarkSource}
                translations={translations.bookmarks}
                emptyIcon="iconBookmark"
                sectionLabel={translations.bookmarks.groupLabel}
                collapsible={true}
                collapsedKeys={preferences.collapsedBookmarkGroups}
                onCollapsedKeysChange={onBookmarkCollapsedChange}
                active={preferences.activeTab === "bookmarks"}
                initialSort={preferences.sorts.bookmarks}
                onSortChange={(sort) => persistSort("bookmarks", sort)}
                entryMenuLabel={window.siyuan.languages.more}
                onEntryMenu={openBookmarkMenu}
                sectionMenuLabel={window.siyuan.languages.more}
                onSectionMenu={openBookmarkGroupMenu}
                dropHandlers={bookmarkDropHandlers}
            />
        </div>
        <div
            id={`${instanceId}-panel-tags`}
            class="sidebar-hub__source-panel"
            role="tabpanel"
            aria-labelledby={`${instanceId}-tab-tags`}
            hidden={preferences.activeTab !== "tags"}
        >
            <EntrySourcePanel
                bind:this={tagPanel}
                source={tagSource}
                translations={translations.tags}
                emptyIcon="iconTag"
                sectionLabel={translations.tabs.tags}
                showSectionLabels={false}
                collapsible={true}
                nested={true}
                virtualized={true}
                collapsedKeys={preferences.collapsedTagPaths}
                onCollapsedKeysChange={onTagCollapsedChange}
                active={preferences.activeTab === "tags"}
                initialSort={preferences.sorts.tags}
                onSortChange={(sort) => persistSort("tags", sort)}
            />
        </div>
        <div
            id={`${instanceId}-panel-databases`}
            class="sidebar-hub__source-panel"
            role="tabpanel"
            aria-labelledby={`${instanceId}-tab-databases`}
            hidden={preferences.activeTab !== "databases"}
        >
            <EntrySourcePanel
                bind:this={databasePanel}
                source={databaseSource}
                translations={translations.databases}
                emptyIcon="iconDatabase"
                sectionLabel={translations.tabs.databases}
                showSectionLabels={false}
                virtualized={true}
                active={preferences.activeTab === "databases"}
                initialSort={preferences.sorts.databases}
                onSortChange={(sort) => persistSort("databases", sort)}
            />
        </div>
        <div
            id={`${instanceId}-panel-pages`}
            class="sidebar-hub__source-panel"
            role="tabpanel"
            aria-labelledby={`${instanceId}-tab-pages`}
            hidden={preferences.activeTab !== "pages"}
        >
            <EntrySourcePanel
                bind:this={pagePanel}
                source={pageSource}
                translations={translations.pages}
                emptyIcon="iconFile"
                sectionLabel={translations.tabs.pages}
                showSectionLabels={false}
                virtualized={true}
                active={preferences.activeTab === "pages"}
                initialSort={preferences.sorts.pages}
                onSortChange={(sort) => persistSort("pages", sort)}
                entryMenuLabel={window.siyuan.languages.more}
                onEntryMenu={openPageDocumentMenu}
            />
        </div>
    </div>
</div>
