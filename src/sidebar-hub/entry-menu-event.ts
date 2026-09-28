import type { EntrySourceEntry, EntrySourceSection } from "./entry-source";

export interface EntryMenuPosition {
    x: number;
    y: number;
    w?: number;
    h?: number;
}

export type OpenEntryMenu = (entry: EntrySourceEntry, position: EntryMenuPosition) => void;
export type OpenSectionMenu = (section: EntrySourceSection, position: EntryMenuPosition) => void;

export function routeEntryMenuEvent(
    event: MouseEvent,
    entry: EntrySourceEntry,
    open: OpenEntryMenu,
) {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === "contextmenu") {
        open(entry, { x: event.clientX, y: event.clientY });
        return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    open(entry, { x: rect.left, y: rect.bottom, w: rect.width, h: rect.height });
}

export function routeSectionMenuEvent(
    event: MouseEvent,
    section: EntrySourceSection,
    open: OpenSectionMenu,
) {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === "contextmenu") {
        open(section, { x: event.clientX, y: event.clientY });
        return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    open(section, { x: rect.left, y: rect.bottom, w: rect.width, h: rect.height });
}
