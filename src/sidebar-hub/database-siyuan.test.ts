import { describe, expect, it } from "vitest";

import { loadDatabaseBatches } from "./database-pagination";
import type { DatabaseSearchResult } from "./databases";

function result(avID: string, index: number): DatabaseSearchResult {
    return {
        avID,
        avName: `数据库 ${index}`,
        blockID: `block-${index}`,
        hPath: `笔记本/数据库 ${index}`,
        viewID: "",
        viewName: "",
        viewLayout: "",
    };
}

describe("思源数据库加载", () => {
    it("通过累积 excludes 加载超过 12 个数据库，并在完整加载后返回", async () => {
        const requests: string[][] = [];
        const batches = [
            Array.from({ length: 12 }, (_, index) => result(`av-${index}`, index)),
            [result("av-12", 12), result("av-13", 13)],
            [],
        ];

        const loaded = await loadDatabaseBatches(async (excludes) => {
            requests.push([...excludes]);
            return batches[requests.length - 1];
        });

        expect(loaded).toHaveLength(14);
        expect(requests).toEqual([
            [],
            Array.from({ length: 12 }, (_, index) => `av-${index}`),
            [
                ...Array.from({ length: 12 }, (_, index) => `av-${index}`),
                "av-12",
                "av-13",
            ],
        ]);
    });

    it("遇到重复批次时停止而不是重复请求", async () => {
        const batch = [result("av-1", 1)];
        const requests: string[][] = [];

        await expect(loadDatabaseBatches(async (excludes) => {
            requests.push([...excludes]);
            return batch;
        })).resolves.toEqual(batch);

        expect(requests).toEqual([[], ["av-1"]]);
    });

    it("传播批次加载错误", async () => {
        await expect(loadDatabaseBatches(async () => {
            throw new Error("数据库搜索失败");
        })).rejects.toThrow("数据库搜索失败");
    });
});
