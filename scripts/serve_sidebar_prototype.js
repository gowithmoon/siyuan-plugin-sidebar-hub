import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "prototypes", "sidebar-hub-ui");
const port = Number(process.env.SIDEBAR_PROTOTYPE_PORT || 4178);

createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const fileName = url.pathname === "/" || url.pathname === "/index.html" ? "index.html" : null;

    if (!fileName) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Prototype file not found");
        return;
    }

    try {
        const content = await readFile(join(root, fileName));
        const contentType = fileName.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
        response.writeHead(200, { "Content-Type": contentType });
        response.end(content);
    } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Prototype file not found");
    }
}).listen(port, "127.0.0.1", () => {
    console.log(`Sidebar Hub UI prototype: http://127.0.0.1:${port}/?variant=A`);
});
