import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const DIST_DIR = "dist";
const ROUTES = ["install", "docs", "privacy", "user-agreement", "changelog"];

/** 为 Cloudflare Pages 生成二级页入口，避免清理 URL 绕过 React 页面壳。 */
async function copySpaRoute(route) {
  const source = join(DIST_DIR, "index.html");
  const directoryTarget = join(DIST_DIR, route, "index.html");
  await mkdir(dirname(directoryTarget), { recursive: true });
  await copyFile(source, directoryTarget);
  await copyFile(source, join(DIST_DIR, `${route}.html`));
}

await Promise.all(ROUTES.map(copySpaRoute));
