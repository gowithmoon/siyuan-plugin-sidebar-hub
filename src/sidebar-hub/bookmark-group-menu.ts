import type { EntrySourceSection } from "./entry-source";

export interface BookmarkGroupMenuAction {
    id: "rename" | "remove";
    label: string;
    icon: string;
    warning?: boolean;
    execute: () => Promise<void>;
}

interface BookmarkGroupMenuDependencies {
    isReadOnly: () => boolean;
    labels: { rename: string; remove: string };
    requestRename: (name: string) => Promise<string | null>;
    renameBookmark: (oldBookmark: string, newBookmark: string) => Promise<void>;
    confirmRemove: (name: string) => Promise<boolean>;
    removeBookmark: (name: string) => Promise<void>;
    onChanged: () => Promise<void> | void;
    reportError: (error: unknown) => void;
}

export function createBookmarkGroupMenuActions(dependencies: BookmarkGroupMenuDependencies) {
    return {
        forGroup(group: EntrySourceSection): BookmarkGroupMenuAction[] {
            if (dependencies.isReadOnly()) {
                return [];
            }
            const name = group.key;
            return [
                {
                    id: "rename",
                    label: dependencies.labels.rename,
                    icon: "iconEdit",
                    execute: () => execute(async () => {
                        const requestedName = await dependencies.requestRename(group.label ?? name);
                        if (requestedName === null) {
                            return;
                        }
                        const newName = requestedName.trim();
                        if (!newName || newName === name) {
                            return;
                        }
                        await dependencies.renameBookmark(name, newName);
                        await dependencies.onChanged();
                    }),
                },
                {
                    id: "remove",
                    label: dependencies.labels.remove,
                    icon: "iconTrashcan",
                    warning: true,
                    execute: () => execute(async () => {
                        if (!await dependencies.confirmRemove(group.label ?? name)) {
                            return;
                        }
                        await dependencies.removeBookmark(name);
                        await dependencies.onChanged();
                    }),
                },
            ];
        },
    };

    async function execute(action: () => Promise<void>) {
        try {
            await action();
        } catch (error) {
            dependencies.reportError(error);
        }
    }
}
