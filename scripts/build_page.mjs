// 把活法数据注入模板，生成单文件 HTML
// 用法：node scripts/build_page.mjs --data <data.json> --out <输出.html> [--index 04] [--title 自定义标题]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, "..", "assets", "template.html");

/* 统一退出：同步写出后再退出，避免 process.exit 在管道/CI 下截断输出。 */
function die(code, payload) {
  writeFileSync(2, (typeof payload === "string" ? payload : JSON.stringify(payload)) + "\n");
  process.exit(code);
}
function arg(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dataPath = arg("data", "");
const outPath = arg("out", "");
const indexNo = arg("index", "04");
if (!dataPath || !outPath) {
  die(1, "缺少参数：--data <data.json> --out <输出.html>");
}

const data = JSON.parse(readFileSync(dataPath, "utf8"));

// ---- 校验 ----
const errs = [];
if (!data.major || typeof data.major !== "string") errs.push("major 必填（专业全称）");
if (!Array.isArray(data.paths) || data.paths.length < 1) errs.push("paths 至少 1 条");
const NEED = ["name", "oneline", "access", "match", "cost", "next"];
(data.paths || []).forEach((p, i) => {
  NEED.forEach((k) => {
    if (!p[k] || !String(p[k]).trim()) errs.push(`paths[${i}] 缺少字段 ${k}`);
  });
  ["roles", "skills"].forEach((k) => {
    if (!Array.isArray(p[k]) || p[k].length < 1) errs.push(`paths[${i}] 缺少数组 ${k}`);
  });
});
if (errs.length) {
  die(2, "数据校验失败：\n- " + errs.join("\n- "));
}

// ---- 注入 ----
const safeJson = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");
const major = data.major;
const title = arg("title", `${major}的N种活法`);

let html = readFileSync(TEMPLATE, "utf8");
html = html
  .replace("/*__DATA__*/", safeJson)
  .replace(/__TITLE__/g, title)
  .replace(/__MAJOR__/g, major)
  .replace(/__INDEX__/g, indexNo);

const out = resolve(outPath);
if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, "utf8");

const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
console.log(JSON.stringify({
  ok: true,
  out,
  major,
  paths: data.paths.length,
  size_kb: Number(kb),
  families: [...new Set(data.paths.map((p) => p.family || "core"))],
}, null, 2));
