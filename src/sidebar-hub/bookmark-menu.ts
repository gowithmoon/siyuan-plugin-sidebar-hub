import type { EntrySourceEntry } from "./entry-source";
import type { PageDocumentMenuAction, PageDocumentMenuActions, PageMenuDocument } from "./page-document-menu";

export interface BookmarkMenuAction extends Omit<PageDocumentMenuAction, "id"> {
    id: "rename" | "attributes" | "removeBookmark" | "deleteDocument";
}

interface BookmarkMenuDependencies {
    isReadOnly: () => boolean;
    documentActions: PageDocumentMenuActions;
    labels: { attributes: string; removeBookmark: string };
    loadAttributes: (id: string) => Promise<Record<string, string>>;
    openAttributes: (attributes: Record<string, string>) => void;
    confirmRemoveBookmark: (target: PageMenuDocument) => Promise<boolean>;
    removeBookmark: (id: string) => Promise<void>;
    onChanged: () => Promise<void> | void;
    reportError: (error: unknown) => void;
}

export function createBookmarkMenuActions(dependencies: BookmarkMenuDependencies) {
    return {
        forEntry(entry: EntrySourceEntry): BookmarkMenuAction[] {
            const target = { id: entry.key, title: entry.label };
            const documentActions = entry.blockType === "document"
                ? dependencies.documentActions.forDocument(target)
                : [];
            const attributes: BookmarkMenuAction = {
                id: "attributes",
                label: dependencies.labels.attributes,
                icon: "iconAttr",
                execute: () => execute(async () => {
                    const attrs = await dependencies.loadAttributes(target.id);
                    dependencies.openAttributes(attrs);
                }),
            };
            if (dependencies.isReadOnly()) {
                return documentActions.length > 0
                    ? documentActions.filter((action) => action.id === "attributes")
                        .map((action): BookmarkMenuAction => ({ ...action, id: "attributes" }))
                    : [attributes];
            }
            if (documentActions.length > 0) {
                return [
                    ...documentActions.filter((action) => action.id === "rename")
                        .map((action): BookmarkMenuAction => ({ ...action, id: "rename" })),
                    ...documentActions.filter((action) => action.id === "attributes")
                        .map((action): BookmarkMenuAction => ({ ...action, id: "attributes" })),
                    removeBookmarkAction(),
                    ...documentActions.filter((action) => action.id === "remove")
                        .map((action): BookmarkMenuAction => ({ ...action, id: "deleteDocument" })),
                ];
            }
            return [
                attributes,
                removeBookmarkAction(),
            ];

            function removeBookmarkAction(): BookmarkMenuAction {
                return {
                    id: "removeBookmark",
                    label: dependencies.labels.removeBookmark,
                    icon: "iconTrashcan",
                    warning: true,
                    execute: () => execute(async () => {
                        if (dependencies.isReadOnly() || !await dependencies.confirmRemoveBookmark(target)) {
                            return;
                        }
                        await dependencies.removeBookmark(target.id);
                        await dependencies.onChanged();
                    }),
                };
            }
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
