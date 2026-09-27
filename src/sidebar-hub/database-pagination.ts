import type { DatabaseSearchResult } from "./databases";

type DatabaseBatchLoader = (excludes: readonly string[]) => Promise<DatabaseSearchResult[]>;

export async function loadDatabaseBatches(loadBatch: DatabaseBatchLoader): Promise<DatabaseSearchResult[]> {
    const excludes = new Set<string>();
    const results: DatabaseSearchResult[] = [];

    while (true) {
        const batch = await loadBatch([...excludes]);
        let added = 0;

        for (const result of batch) {
            if (!result.avID || excludes.has(result.avID)) {
                continue;
            }

            excludes.add(result.avID);
            results.push(result);
            added += 1;
        }

        if (batch.length === 0 || added === 0) {
            return results;
        }
    }
}
