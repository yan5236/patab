#!/usr/bin/env node
/*
 * 校验 docs-site 的 theme-css 展示页与 SDK / 宿主源码保持一致：
 *
 * 1. packages/widget-sdk/src/theme.css 中的每个契约类（.pt-*）
 *    必须出现在展示组件的 styles.module.css 与 zh/en 两个 theme-css.mdx 中；
 * 2. packages/widget-sdk/src/rpc.ts 的 WidgetThemeTokenName 联合中的每个 token
 *    必须出现在展示组件 TOKEN_VALUES 的 light/dark 两组取值与两个 mdx 文件中；
 * 3. 展示组件中的 token 演示取值必须等于
 *    patab-web/src/custom-components/runtime/widgetTheme.ts 的 createFallbackTokens 回退值。
 *
 * 用法：pnpm --filter docs-site verify:theme-css
 */
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const paths = {
  themeCss: 'packages/widget-sdk/src/theme.css',
  rpcTs: 'packages/widget-sdk/src/rpc.ts',
  hostThemeTs: 'patab-web/src/custom-components/runtime/widgetTheme.ts',
  showcaseCss: 'packages/docs-site/src/components/ThemeCssShowcase/styles.module.css',
  showcaseTsx: 'packages/docs-site/src/components/ThemeCssShowcase/index.tsx',
  mdxZh: 'packages/docs-site/docs/sdk/theme-css.mdx',
  mdxEn: 'packages/docs-site/i18n/en/docusaurus-plugin-content-docs/current/sdk/theme-css.mdx',
};

const read = (key) => readFileSync(resolve(root, paths[key]), 'utf8');

const problems = [];

// 1. 契约类：theme.css 选择器中的 .pt-* 类名
const contractClasses = [
  ...new Set(
    [...read('themeCss').matchAll(/^\s*(\.pt-[a-z-]+)(?=[,\s:])/gm)].map((m) => m[1]),
  ),
];

// 2. 契约 token：WidgetThemeTokenName 联合成员
const contractTokens = [
  ...new Set([...read('rpcTs').matchAll(/'(--pt-[a-z-]+)'/g)].map((m) => m[1])),
];

// 3. 宿主回退取值：createFallbackTokens 函数体
const hostBody = read('hostThemeTs').match(
  /createFallbackTokens[^{]*\{[\s\S]*?return \{([\s\S]*?)\n  \}/,
)?.[1];
if (!hostBody) {
  problems.push('无法解析 widgetTheme.ts 中的 createFallbackTokens 返回值');
}

const hostFallback = {};
if (hostBody) {
  for (const line of hostBody.split('\n')) {
    const m = line.match(/^\s*'(--pt-[a-z-]+)':\s*(.+?),?\s*$/);
    if (!m) continue;
    const [, token, expr] = m;
    const strings = [...expr.matchAll(/'([^']*)'|"([^"]*)"/g)].map(
      (s) => s[1] ?? s[2],
    );
    if (expr.includes('isDark')) {
      hostFallback[token] = {dark: strings[0], light: strings[1]};
    } else if (expr.includes('reducedMotion')) {
      // 展示页演示正常动效取值（非 reduced）
      hostFallback[token] = {light: strings.at(-1), dark: strings.at(-1)};
    } else if (strings.length > 0) {
      hostFallback[token] = {light: strings[0], dark: strings[0]};
    } else if (/\btheme\b/.test(expr)) {
      hostFallback[token] = {light: 'light', dark: 'dark'};
    } else {
      problems.push(`无法解析宿主回退取值：${token} = ${expr}`);
    }
  }
}

// 展示组件 TOKEN_VALUES
const tsx = read('showcaseTsx');
const showcaseValues = {};
for (const theme of ['light', 'dark']) {
  const block = tsx.match(new RegExp(`${theme}: \\{([\\s\\S]*?)\\n  \\},`))?.[1];
  if (!block) {
    problems.push(`无法在 index.tsx 中解析 TOKEN_VALUES.${theme}`);
    continue;
  }
  for (const m of block.matchAll(/'(--pt-[a-z-]+)':\s*'([^']*)'/g)) {
    (showcaseValues[m[1]] ??= {})[theme] = m[2];
  }
}

// ---- 断言 ----
const showcaseCss = read('showcaseCss');
const mdxZh = read('mdxZh');
const mdxEn = read('mdxEn');

for (const cls of contractClasses) {
  if (!showcaseCss.includes(cls)) problems.push(`styles.module.css 缺少契约类 ${cls}`);
  if (!mdxZh.includes(cls)) problems.push(`theme-css.mdx（zh）缺少契约类 ${cls}`);
  if (!mdxEn.includes(cls)) problems.push(`theme-css.mdx（en）缺少契约类 ${cls}`);
}

for (const token of contractTokens) {
  for (const theme of ['light', 'dark']) {
    if (!showcaseValues[token]?.[theme]) {
      problems.push(`index.tsx TOKEN_VALUES 缺少 ${token} 的 ${theme} 取值`);
    }
  }
  if (!mdxZh.includes(token)) problems.push(`theme-css.mdx（zh）缺少 token ${token}`);
  if (!mdxEn.includes(token)) problems.push(`theme-css.mdx（en）缺少 token ${token}`);
}

for (const [token, expected] of Object.entries(hostFallback)) {
  for (const theme of ['light', 'dark']) {
    const actual = showcaseValues[token]?.[theme];
    if (actual !== undefined && actual !== expected[theme]) {
      problems.push(
        `${token} 的 ${theme} 演示取值与宿主回退值不一致：` +
          `展示页 "${actual}" ≠ 宿主 "${expected[theme]}"`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('theme-css 展示页一致性校验失败：');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `theme-css 展示页一致性校验通过：${contractClasses.length} 个契约类、${contractTokens.length} 个契约 token（含宿主回退取值比对）。`,
);
