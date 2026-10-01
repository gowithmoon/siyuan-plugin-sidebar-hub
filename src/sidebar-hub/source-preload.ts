import PromiseLimitPool from "../libs/promise-pool";
import { SIDEBAR_TAB_IDS, type SidebarTabId } from "./preferences";

const PRELOAD_CONCURRENCY = 2;

export interface PreloadableSourcePanel {
    preload: () => Promise<void>;
}

export async function preloadVisibleSources(
    panels: Partial<Record<SidebarTabId, PreloadableSourcePanel>>,
    visibleTabs: readonly SidebarTabId[],
): Promise<void> {
    const visible = new Set(visibleTabs);
    const pool = new PromiseLimitPool<void>(PRELOAD_CONCURRENCY);

    for (const tabId of SIDEBAR_TAB_IDS) {
        const panel = panels[tabId];
        if (!visible.has(tabId) || !panel) {
            continue;
        }
        pool.add(async () => {
            try {
                await panel.preload();
            } catch {
                // A background failure is retried when the tab is activated.
            }
        });
    }

    await pool.awaitAll();
}
