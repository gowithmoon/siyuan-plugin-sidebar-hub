export interface Notebook {
    id: string;
    name: string;
    closed: boolean;
}

export interface NotebookDocument {
    id: string;
    path: string;
    name: string;
    subFileCount: number;
}

export interface ScannedNotebookDocument<TDocument extends NotebookDocument = NotebookDocument> {
    document: TDocument;
    attributes: Record<string, string>;
    children: ScannedNotebookDocument<TDocument>[];
}

export interface ScannedNotebook<TDocument extends NotebookDocument = NotebookDocument> {
    notebook: Notebook;
    documents: ScannedNotebookDocument<TDocument>[];
}

export interface NotebookDocumentAdapter<TDocument extends NotebookDocument = NotebookDocument> {
    listNotebooks: () => Promise<Notebook[]>;
    listDocuments: (notebookId: string, path: string) => Promise<TDocument[]>;
    getBlockAttrs: (ids: string[]) => Promise<Record<string, Record<string, string>>>;
}

export async function scanOpenNotebookDocuments<TDocument extends NotebookDocument>(
    adapter: NotebookDocumentAdapter<TDocument>,
    onProgress?: (scanned: number) => void,
): Promise<ScannedNotebook<TDocument>[]> {
    const notebooks = (await adapter.listNotebooks()).filter((notebook) => !notebook.closed);
    const scanned: ScannedNotebook<TDocument>[] = [];
    let scannedCount = 0;
    for (const notebook of notebooks) {
        scanned.push({
            notebook,
            documents: await scanNotebookDocumentTree(adapter, notebook.id, () => {
                scannedCount += 1;
                onProgress?.(scannedCount);
            }),
        });
    }
    return scanned;
}

export async function scanNotebookDocuments<TDocument extends NotebookDocument>(
    adapter: Pick<NotebookDocumentAdapter<TDocument>, "listDocuments" | "getBlockAttrs">,
    notebookId: string,
    onProgress?: (scanned: number) => void,
): Promise<ScannedNotebookDocument<TDocument>[]> {
    let scannedCount = 0;
    return scanNotebookDocumentTree(adapter, notebookId, () => {
        scannedCount += 1;
        onProgress?.(scannedCount);
    });
}

async function scanNotebookDocumentTree<TDocument extends NotebookDocument>(
    adapter: Pick<NotebookDocumentAdapter<TDocument>, "listDocuments" | "getBlockAttrs">,
    notebookId: string,
    onDocumentScanned: () => void,
): Promise<ScannedNotebookDocument<TDocument>[]> {
    return scanPath("/");

    async function scanPath(path: string): Promise<ScannedNotebookDocument<TDocument>[]> {
        const documents = await adapter.listDocuments(notebookId, path);
        const attributes = documents.length > 0
            ? await adapter.getBlockAttrs(documents.map((document) => document.id))
            : {};
        const scanned: ScannedNotebookDocument<TDocument>[] = [];
        for (const document of documents) {
            const result = {
                document,
                attributes: attributes[document.id] ?? {},
                children: document.subFileCount > 0 ? await scanPath(document.path) : [],
            };
            scanned.push(result);
            onDocumentScanned();
        }
        return scanned;
    }
}

export function isDailyNote(attributes: Readonly<Record<string, string>>) {
    return Object.keys(attributes).some((name) => name.startsWith("custom-dailynote-"));
}
