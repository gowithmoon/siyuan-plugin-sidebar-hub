import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const pluginsDirectoryEnvironmentVariable = "SIYUAN_PLUGINS_DIR";

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function log(message) {
    console.log(`\x1B[36m%s\x1B[0m`, message);
}

export function loadLocalDeployEnvironment(root = projectRoot, environment = process.env) {
    if (environment[pluginsDirectoryEnvironmentVariable]?.trim()) {
        return;
    }

    const localEnvironmentPath = path.join(root, ".env.local");
    if (fs.existsSync(localEnvironmentPath)) {
        process.loadEnvFile(localEnvironmentPath);
    }
}

export function resolveDeployTarget(pluginName, environment = process.env) {
    const pluginsRoot = environment[pluginsDirectoryEnvironmentVariable]?.trim();
    if (!pluginsRoot) {
        throw new Error(
            `缺少 ${pluginsDirectoryEnvironmentVariable}。请在 .env.local 或系统环境变量中配置思源工作空间的 data/plugins 绝对路径。`,
        );
    }
    if (!path.isAbsolute(pluginsRoot)) {
        throw new Error(`${pluginsDirectoryEnvironmentVariable} 必须是绝对路径："${pluginsRoot}"`);
    }

    return path.join(pluginsRoot, pluginName);
}

export function deployBuild({ root = projectRoot, environment = process.env } = {}) {
    const manifest = readJson(path.join(root, "plugin.json"));
    const buildPath = path.join(root, "dist");

    if (!fs.existsSync(buildPath)) {
        throw new Error(`未找到构建产物："${buildPath}"。请先运行 pnpm run build。`);
    }

    const builtManifestPath = path.join(buildPath, "plugin.json");
    if (!fs.existsSync(builtManifestPath)) {
        throw new Error(`构建产物缺少 plugin.json："${builtManifestPath}"。`);
    }

    const builtManifest = readJson(builtManifestPath);
    if (builtManifest.name !== manifest.name) {
        throw new Error(
            `构建产物插件名不匹配：源码为 "${manifest.name}"，dist 为 "${builtManifest.name}"。`,
        );
    }

    const targetDirectory = resolveDeployTarget(manifest.name, environment);
    const targetParent = path.dirname(targetDirectory);
    if (!fs.existsSync(targetParent) || !fs.statSync(targetParent).isDirectory()) {
        throw new Error(
            `思源插件目录不存在："${targetParent}"。请检查 ${pluginsDirectoryEnvironmentVariable} 配置。`,
        );
    }

    const resolvedRoot = fs.realpathSync(root);
    const resolvedTarget = fs.existsSync(targetDirectory)
        ? fs.realpathSync(targetDirectory)
        : path.resolve(targetDirectory);
    if (resolvedTarget === resolvedRoot) {
        throw new Error("部署目标不能是插件源码目录。请将 SIYUAN_PLUGINS_DIR 指向工作空间的 data/plugins 目录。");
    }

    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.cpSync(buildPath, targetDirectory, {
        recursive: true,
        force: true,
    });

    return {
        pluginName: manifest.name,
        buildPath,
        targetDirectory,
    };
}

function main() {
    try {
        log(">>> 正在部署到思源插件目录……");
        loadLocalDeployEnvironment();
        const result = deployBuild();
        log(`>>> 已将 ${result.pluginName} 部署到：${result.targetDirectory}`);
        log(">>> 部署完成。请在思源中启用或重新加载插件。");
    } catch (cause) {
        console.error(`\x1B[31m%s\x1B[0m`, cause instanceof Error ? cause.message : String(cause));
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    main();
}
