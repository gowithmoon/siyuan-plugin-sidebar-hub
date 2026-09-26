import type { EntrySourceSort } from "./entry-source";
import { BOOKMARK_SORT_FIELDS, type BookmarkSortField } from "./bookmarks";
import { DATABASE_SORT_FIELDS, type DatabaseSortField } from "./databases";
import { PAGE_SORT_FIELDS, type PageSortField } from "./pages";
import { TAG_SORT_FIELDS, type TagSortField } from "./tags";

export const TAB_DEFINITIONS = [
    { id: "bookmarks", icon: "iconBookmark" },
    { id: "tags", icon: "iconTag" },
    { id: "databases", icon: "iconDatabase" },
    { id: "pages", icon: "iconFile" },
] as const;

export type SidebarTabId = (typeof TAB_DEFINITIONS)[number]["id"];

export type SidebarHubSortField = BookmarkSortField | TagSortField | DatabaseSortField | PageSortField;
export type SidebarHubSorts = Record<SidebarTabId, EntrySourceSort<SidebarHubSortField>>;

export interface SidebarHubPreferences {
    activeTab: SidebarTabId;
    dailyNotebookId: string;
    sorts: SidebarHubSorts;
    visibleTabs: Record<SidebarTabId, boolean>;
    collapsedBookmarkGroups: string[];
}

export const SIDEBAR_TAB_IDS: readonly SidebarTabId[] = TAB_DEFINITIONS.map((tab) => tab.id);
const SORT_FIELDS: Record<SidebarTabId, readonly SidebarHubSortField[]> = {
    bookmarks: BOOKMARK_SORT_FIELDS,
    tags: TAG_SORT_FIELDS,
    databases: DATABASE_SORT_FIELDS,
    pages: PAGE_SORT_FIELDS,
};

const DEFAULT_SORTS: SidebarHubSorts = {
    bookmarks: { field: "name", direction: "asc" },
    tags: { field: "name", direction: "asc" },
    databases: { field: "name", direction: "asc" },
    pages: { field: "name", direction: "asc" },
};

export const DEFAULT_PREFERENCES: SidebarHubPreferences = {
    activeTab: "bookmarks",
    dailyNotebookId: "",
    sorts: DEFAULT_SORTS,
    visibleTabs: {
        bookmarks: true,
        tags: true,
        databases: true,
        pages: true,
    },
    collapsedBookmarkGroups: [],
};

export function normalizePreferences(value: unknown): SidebarHubPreferences {
    const stored = isRecord(value) ? value : {};
    const storedVisibility = isRecord(stored.visibleTabs) ? stored.visibleTabs : {};
    const visibleTabs = Object.fromEntries(
        SIDEBAR_TAB_IDS.map((tabId) => [tabId, storedVisibility[tabId] !== false]),
    ) as Record<SidebarTabId, boolean>;

    if (!SIDEBAR_TAB_IDS.some((tabId) => visibleTabs[tabId])) {
        visibleTabs.bookmarks = true;
    }

    const requestedActiveTab = stored.activeTab;
    const activeTab = isSidebarTabId(requestedActiveTab) && visibleTabs[requestedActiveTab]
        ? requestedActiveTab
        : SIDEBAR_TAB_IDS.find((tabId) => visibleTabs[tabId])!;
    const storedSorts = isRecord(stored.sorts) ? stored.sorts : {};
    const sorts = Object.fromEntries(SIDEBAR_TAB_IDS.map((tabId) => [
        tabId,
        normalizeSort(storedSorts[tabId], tabId),
    ])) as SidebarHubSorts;
    const collapsedBookmarkGroups = isRecord(stored) && Array.isArray(stored.collapsedBookmarkGroups)
        ? [...new Set(stored.collapsedBookmarkGroups.filter((value): value is string => typeof value === "string" && value.length > 0))]
        : [];

    return {
        activeTab,
        dailyNotebookId: typeof stored.dailyNotebookId === "string" ? stored.dailyNotebookId : "",
        sorts,
        visibleTabs,
        collapsedBookmarkGroups,
    };
}

export function setTabVisibility(
    preferences: SidebarHubPreferences,
    tabId: SidebarTabId,
    visible: boolean,
): SidebarHubPreferences {
    const visibleTabs = {
        ...preferences.visibleTabs,
        [tabId]: visible,
    };

    if (!SIDEBAR_TAB_IDS.some((id) => visibleTabs[id])) {
        return preferences;
    }

    return normalizePreferences({
        ...preferences,
        visibleTabs,
    });
}

function isSidebarTabId(value: unknown): value is SidebarTabId {
    return typeof value === "string" && SIDEBAR_TAB_IDS.includes(value as SidebarTabId);
}

function normalizeSort(value: unknown, tabId: SidebarTabId): EntrySourceSort<SidebarHubSortField> {
    const stored = isRecord(value) ? value : {};
    if (typeof stored.field !== "string" || !SORT_FIELDS[tabId].includes(stored.field as SidebarHubSortField)) {
        return DEFAULT_SORTS[tabId];
    }
    const field = stored.field as SidebarHubSortField;
    const direction = stored.direction === "desc" ? "desc" : "asc";
    return { field, direction };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
