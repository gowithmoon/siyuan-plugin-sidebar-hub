export const TAB_DEFINITIONS = [
    { id: "bookmarks", icon: "iconBookmark" },
    { id: "tags", icon: "iconTag" },
    { id: "databases", icon: "iconDatabase" },
    { id: "pages", icon: "iconFile" },
] as const;

export type SidebarTabId = (typeof TAB_DEFINITIONS)[number]["id"];

export interface SidebarHubPreferences {
    activeTab: SidebarTabId;
    visibleTabs: Record<SidebarTabId, boolean>;
}

const TAB_IDS = TAB_DEFINITIONS.map((tab) => tab.id);

export const DEFAULT_PREFERENCES: SidebarHubPreferences = {
    activeTab: "bookmarks",
    visibleTabs: {
        bookmarks: true,
        tags: true,
        databases: true,
        pages: true,
    },
};

export function normalizePreferences(value: unknown): SidebarHubPreferences {
    const stored = isRecord(value) ? value : {};
    const storedVisibility = isRecord(stored.visibleTabs) ? stored.visibleTabs : {};
    const visibleTabs = Object.fromEntries(
        TAB_IDS.map((tabId) => [tabId, storedVisibility[tabId] !== false]),
    ) as Record<SidebarTabId, boolean>;

    if (!TAB_IDS.some((tabId) => visibleTabs[tabId])) {
        visibleTabs.bookmarks = true;
    }

    const requestedActiveTab = stored.activeTab;
    const activeTab = isSidebarTabId(requestedActiveTab) && visibleTabs[requestedActiveTab]
        ? requestedActiveTab
        : TAB_IDS.find((tabId) => visibleTabs[tabId])!;

    return { activeTab, visibleTabs };
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

    if (!TAB_IDS.some((id) => visibleTabs[id])) {
        return preferences;
    }

    return normalizePreferences({
        activeTab: preferences.activeTab,
        visibleTabs,
    });
}

function isSidebarTabId(value: unknown): value is SidebarTabId {
    return typeof value === "string" && TAB_IDS.includes(value as SidebarTabId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
