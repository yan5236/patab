import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LICENSES_PATH = join(SCRIPT_DIR, "..", "public", "open-source-licenses.json");
const NOTICE_PATH = join(SCRIPT_DIR, "..", "..", "NOTICE");

/** 读取生成后的许可证清单。 */
async function readLicenseDocument() {
  return JSON.parse(await readFile(LICENSES_PATH, "utf8"));
}

test("许可证清单同时覆盖介绍网站与网页端", async () => {
  const document = await readLicenseDocument();
  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(
    document.projects.map((project) => project.id),
    ["introduction", "web"],
  );
  assert.ok(
    document.projects.find((project) => project.id === "introduction").packages
      .some((dependency) => dependency.name === "react"),
  );
  assert.ok(
    document.projects.find((project) => project.id === "web").packages
      .some((dependency) => dependency.name === "vue"),
  );
});

test("许可证清单不泄露本机依赖路径且包记录完整", async () => {
  const document = await readLicenseDocument();

  for (const project of document.projects) {
    const keys = project.packages.map(
      (dependency) => `${dependency.name}@${dependency.version}`,
    );
    assert.equal(new Set(keys).size, keys.length);
    for (const dependency of project.packages) {
      assert.equal("path" in dependency, false);
      assert.equal("licenseFile" in dependency, false);
      assert.ok(dependency.name);
      assert.ok(dependency.version);
      assert.ok(dependency.licenses);
    }
  }
});

test("根目录 NOTICE 可由同一份许可数据生成", async () => {
  const notice = await readFile(NOTICE_PATH, "utf8");
  assert.match(notice, /^PaTab Third-Party Software Notices/);
  assert.match(notice, /Used by: PaTab 介绍网站/);
  assert.match(notice, /Used by: PaTab 网页端/);
  assert.match(notice, /react@\d/);
  assert.match(notice, /vue@\d/);
  assert.doesNotMatch(notice, /E:\\xiangmu\\patab/i);
});
