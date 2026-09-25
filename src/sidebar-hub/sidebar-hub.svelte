<script lang="ts">
    import { type App } from "siyuan";

    import { TAB_DEFINITIONS, type SidebarHubPreferences, type SidebarTabId } from "./preferences";
    import { buildCalendarMonth } from "./calendar";
    import { createBookmarkSource } from "./bookmarks";
    import { loadBookmarkGroups, openBookmark } from "./bookmark-siyuan";
    import { createTagSource } from "./tags";
    import { loadTags, openTag } from "./tag-siyuan";
    import { createDatabaseSource } from "./databases";
    import { loadDatabases, openDatabase } from "./database-siyuan";
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
        sortOptions: Record<string, string>;
    }

    interface Translations {
        title: string;
        today: string;
        previousMonth: string;
        nextMonth: string;
        minimize: string;
        contentPending: string;
        tabs: Record<SidebarTabId, string>;
        bookmarks: PanelTranslations & { groupLabel: string };
        tags: PanelTranslations;
        databases: PanelTranslations;
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
    const databaseSource = createDatabaseSource({
        load: loadDatabases,
        open: (blockId) => openDatabase(app, blockId),
    });
    let preferences = $state<SidebarHubPreferences>();
    let visibleYear = $state(today.getFullYear());
    let visibleMonth = $state(today.getMonth());
    let selectedDate = $state("");
    let calendar = $derived(buildCalendarMonth(visibleYear, visibleMonth, today));
    let visibleTabs = $derived(TAB_DEFINITIONS.filter((tab) => preferences.visibleTabs[tab.id]));

    initializePreferences();

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
        <div class:fn__none={preferences.activeTab !== "bookmarks"} class="sidebar-hub__source-panel">
            <EntrySourcePanel
                source={bookmarkSource}
                translations={translations.bookmarks}
                emptyIcon="iconBookmark"
                sectionLabel={translations.bookmarks.groupLabel}
                active={preferences.activeTab === "bookmarks"}
            />
        </div>
        <div class:fn__none={preferences.activeTab !== "tags"} class="sidebar-hub__source-panel">
            <EntrySourcePanel
                source={tagSource}
                translations={translations.tags}
                emptyIcon="iconTag"
                sectionLabel={translations.tabs.tags}
                showSectionLabels={false}
                active={preferences.activeTab === "tags"}
            />
        </div>
        <div class:fn__none={preferences.activeTab !== "databases"} class="sidebar-hub__source-panel">
            <EntrySourcePanel
                source={databaseSource}
                translations={translations.databases}
                emptyIcon="iconDatabase"
                sectionLabel={translations.tabs.databases}
                showSectionLabels={false}
                active={preferences.activeTab === "databases"}
            />
        </div>
        {#if preferences.activeTab === "pages"}
            <div class="sidebar-hub__state">
                <svg aria-hidden="true"><use href={`#${TAB_DEFINITIONS.find((tab) => tab.id === preferences.activeTab)!.icon}`}></use></svg>
                <p>{translations.contentPending}</p>
            </div>
        {/if}
    </div>
</div>
