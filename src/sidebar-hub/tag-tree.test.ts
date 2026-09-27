import { describe, expect, it } from "vitest";

import type { EntrySourceEntry } from "./entry-source";
import { flattenTagTree, tagTreeBranchKeys } from "./tag-tree";

const tree: EntrySourceEntry[] = [
    {
        key: "项目",
        label: "项目",
        icon: "iconTag",
        children: [
            {
                key: "项目/开发",
                label: "开发",
                icon: "iconTag",
                children: [{ key: "项目/开发/前端", label: "前端", icon: "iconTag" }],
            },
        ],
    },
    { key: "阅读", label: "阅读", icon: "iconTag" },
];

describe("标签虚拟树", () => {
    it("按深度优先顺序输出稳定 key、条目和 depth", () => {
        expect(flattenTagTree(tree, new Set(), false).map(({ key, entry, depth }) => ({
            key,
            label: entry.label,
            depth,
        }))).toEqual([
            { key: "项目", label: "项目", depth: 0 },
            { key: "项目/开发", label: "开发", depth: 1 },
            { key: "项目/开发/前端", label: "前端", depth: 2 },
            { key: "阅读", label: "阅读", depth: 0 },
        ]);
    });

    it("无搜索时排除已折叠节点的后代", () => {
        expect(flattenTagTree(tree, new Set(["项目"]), false).map((row) => row.key))
            .toEqual(["项目", "阅读"]);
    });

    it("搜索时忽略折叠集合并展示来源保留的完整路径", () => {
        expect(flattenTagTree(tree, new Set(["项目", "项目/开发"]), true).map((row) => row.key))
            .toEqual(["项目", "项目/开发", "项目/开发/前端", "阅读"]);
    });

    it("展开和折叠全部使用完整树中的全部分支 key", () => {
        expect(tagTreeBranchKeys(tree)).toEqual(["项目", "项目/开发"]);
    });
});
