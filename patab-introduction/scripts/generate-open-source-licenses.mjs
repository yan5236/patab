import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const INTRODUCTION_ROOT = resolve(SCRIPT_DIR, "..");
const REPOSITORY_ROOT = resolve(INTRODUCTION_ROOT, "..");
const OUTPUT_PATH = join(INTRODUCTION_ROOT, "public", "open-source-licenses.json");
const NOTICE_PATH = join(REPOSITORY_ROOT, "NOTICE");
const PROJECTS = [
  { id: "introduction", name: "PaTab 介绍网站", root: INTRODUCTION_ROOT },
  { id: "web", name: "PaTab 网页端", root: join(REPOSITORY_ROOT, "patab-web") },
];

/** 调用 pnpm 读取指定项目的完整生产依赖树。 */
function readProductionTree(projectRoot) {
  const result = spawnSync(
    "pnpm",
    ["list", "--prod", "--depth", "Infinity", "--json"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "pnpm 依赖读取失败");
  }

  const [tree] = JSON.parse(result.stdout);
  if (!tree?.dependencies) {
    throw new Error(`未读取到生产依赖：${projectRoot}`);
  }
  return tree.dependencies;
}

/** 递归展开依赖并按包名和版本去重。 */
function flattenDependencies(dependencies, packages = new Map()) {
  for (const [fallbackName, dependency] of Object.entries(dependencies ?? {})) {
    if (!dependency?.version || !dependency.path) continue;

    const name = dependency.from || fallbackName;
    const key = `${name}@${dependency.version}`;
    if (!packages.has(key)) {
      packages.set(key, { name, version: dependency.version, path: dependency.path });
    }
    flattenDependencies(dependency.dependencies, packages);
  }
  return packages;
}

/** 把 npm 仓库字段规整为浏览器可访问的 HTTPS 地址。 */
function normalizeRepository(repository) {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (!raw) return undefined;

  const url = raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^git\+ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
  return /^https?:\/\//.test(url) ? url : undefined;
}

/** 从包目录读取许可证正文；未随包分发正文时保留为空。 */
async function readLicenseText(packageRoot) {
  const entries = await readdir(packageRoot);
  const licenseFile = entries
    .filter((entry) => /^(license|licence|copying)(\.[^.]+)?$/i.test(entry))
    .sort((left, right) => left.length - right.length)[0];
  return licenseFile ? readFile(join(packageRoot, licenseFile), "utf8") : undefined;
}

/** 读取单个依赖的公开许可证元数据，避免把本机路径写入产物。 */
async function describePackage(dependency) {
  let packageJson;
  try {
    packageJson = JSON.parse(
      await readFile(join(dependency.path, "package.json"), "utf8"),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
  const licenses = Array.isArray(packageJson.license)
    ? packageJson.license.join(" OR ")
    : packageJson.license?.type || packageJson.license || "UNKNOWN";

  return {
    name: dependency.name,
    version: dependency.version,
    licenses,
    repository:
      normalizeRepository(packageJson.repository) ||
      normalizeRepository(packageJson.homepage),
    licenseText: await readLicenseText(dependency.path),
  };
}

/** 收集一个项目的许可证清单，并稳定排序以减少无意义的版本差异。 */
async function collectProject(project) {
  const dependencies = flattenDependencies(readProductionTree(project.root));
  const packages = await Promise.all(
    [...dependencies.values()].map(describePackage),
  );
  const installedPackages = packages.filter(Boolean);
  installedPackages.sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
  return { id: project.id, name: project.name, packages: installedPackages };
}

/** 跨项目合并相同版本的依赖，并记录它被哪些前端使用。 */
function mergeProjectPackages(projects) {
  const packages = new Map();
  for (const project of projects) {
    for (const dependency of project.packages) {
      const key = `${dependency.name}@${dependency.version}`;
      const existing = packages.get(key);
      if (existing) {
        existing.usedBy.push(project.name);
      } else {
        packages.set(key, { ...dependency, usedBy: [project.name] });
      }
    }
  }
  return [...packages.values()];
}

/** 把许可证文档转换为仓库根目录的第三方软件 NOTICE 文本。 */
function formatNotice(document) {
  const sections = mergeProjectPackages(document.projects).map((dependency) => {
    const metadata = [
      `${dependency.name}@${dependency.version}`,
      `Used by: ${dependency.usedBy.join(", ")}`,
      `License: ${dependency.licenses}`,
      dependency.repository ? `Source: ${dependency.repository}` : undefined,
    ].filter(Boolean);
    const licenseText =
      dependency.licenseText ||
      "No license text was bundled with this installed package. See the license and source links above.";
    return `${"=".repeat(80)}\n${metadata.join("\n")}\n${"-".repeat(80)}\n${licenseText.trim()}\n`;
  });

  return [
    "PaTab Third-Party Software Notices",
    "",
    "This file is generated from the installed production dependencies of patab-introduction and patab-web.",
    "Run `pnpm --dir patab-introduction run notice:generate` from the repository root to refresh it.",
    "Do not edit this file manually.",
    "",
    ...sections,
  ].join("\n");
}

/** 生成介绍站许可证 JSON 与仓库根目录 NOTICE。 */
async function generateLicenseDocument() {
  const projects = [];
  for (const project of PROJECTS) {
    projects.push(await collectProject(project));
  }

  const document = {
    schemaVersion: 1,
    generatedBy: "pnpm list --prod --depth Infinity --json",
    projects,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await writeFile(NOTICE_PATH, formatNotice(document), "utf8");
  console.log(
    `已生成 ${basename(OUTPUT_PATH)} 与 ${basename(NOTICE_PATH)}：${projects.map((project) => `${project.name} ${project.packages.length} 项`).join("，")}`,
  );
}

await generateLicenseDocument();
