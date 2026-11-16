// 批量构建全校各专业「专业的 N 种活法」页面 + 索引页（单进程内联注入，不依赖子进程）
// 用法：node scripts/build_all.mjs --data-dir <data目录> --out-dir <输出目录>
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
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

const dataDir = resolve(arg("data-dir", ""));
const outDir = resolve(arg("out-dir", ""));
if (!arg("data-dir") || !arg("out-dir")) {
  die(1, "缺少参数：--data-dir <目录> --out-dir <目录>");
}
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const COLLEGE_ORDER = ["学前教育学院", "艺术教育学院", "人文科学学院", "外语教育学院", "信息科学学院"];
const FAMILY_LABEL = {
  core: "对口深耕",
  public: "体制稳定",
  hybrid: "专业×相邻",
  media: "内容与个人品牌",
  ops: "组织运营侧",
  switch: "升学转轨",
};
const FAMILY_COLOR = {
  core: "#1A73BB",
  public: "#2E9E5B",
  hybrid: "#C98A12",
  media: "#B14AA0",
  ops: "#3D8DCD",
  switch: "#7A6BD6",
};

const NEED = ["name", "oneline", "access", "match", "cost", "next"];
const tpl = readFileSync(TEMPLATE, "utf8");
const files = readdirSync(dataDir).filter((f) => f.endsWith(".json")).sort();
const rows = [];
const problems = [];

for (const f of files) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(dataDir, f), "utf8"));
  } catch (e) {
    problems.push(`${f}: JSON 解析失败 ${e.message}`);
    continue;
  }
  const errs = [];
  if (!data.major || typeof data.major !== "string") errs.push("major 必填");
  if (!Array.isArray(data.paths) || data.paths.length < 1) errs.push("paths 至少 1 条");
  (data.paths || []).forEach((p, i) => {
    NEED.forEach((k) => {
      if (!p[k] || !String(p[k]).trim()) errs.push(`paths[${i}] 缺 ${k}`);
    });
    ["roles", "skills"].forEach((k) => {
      if (!Array.isArray(p[k]) || p[k].length < 1) errs.push(`paths[${i}] 缺数组 ${k}`);
    });
  });
  if (errs.length) {
    problems.push(`${f}: ${errs.join("；")}`);
    continue;
  }

  const safeJson = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");
  const major = data.major;
  const title = `${major}的N种活法`;
  const html = tpl
    .replace("/*__DATA__*/", safeJson)
    .replace(/__TITLE__/g, title)
    .replace(/__MAJOR__/g, major)
    .replace(/__INDEX__/g, "04");

  const fileName = `${major}-专业的N种活法.html`;
  writeFileSync(join(outDir, fileName), html, "utf8");

  rows.push({
    major,
    college: data.college || "未分类",
    count: data.paths.length,
    families: [...new Set(data.paths.map((p) => p.family || "core"))],
    size: Number((Buffer.byteLength(html, "utf8") / 1024).toFixed(1)),
    file: fileName,
  });
}

// ---- 索引页 ----
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const groups = COLLEGE_ORDER.map((c) => ({ college: c, items: rows.filter((r) => r.college === c) }));
const others = rows.filter((r) => !COLLEGE_ORDER.includes(r.college));
if (others.length) groups.push({ college: "其他", items: others });

const totalPaths = rows.reduce((s, r) => s + r.count, 0);
const allFams = new Set(rows.flatMap((r) => r.families));

const groupHtml = groups
  .filter((g) => g.items.length)
  .map((g) => {
    const cards = g.items
      .map((r) => {
        const dots = Object.keys(FAMILY_LABEL)
          .map((k) => `<i class="dot" style="background:${FAMILY_COLOR[k]}" title="${FAMILY_LABEL[k]}"></i>`)
          .join("");
        return `    <a class="card" href="${esc(r.file)}">
      <div class="card-main"><h3>${esc(r.major)}</h3><p>${r.count} 种活法 · 六类路径覆盖</p></div>
      <div class="card-side">${dots}<span class="go">查看 →</span></div>
    </a>`;
      })
      .join("\n");
    return `  <section class="group">
    <h2><span class="bar"></span>${esc(g.college)}<em>${g.items.length} 个专业</em></h2>
${cards}
  </section>`;
  })
  .join("\n");

const legend = Object.keys(FAMILY_LABEL)
  .map((k) => `<span class="lg"><i class="dot" style="background:${FAMILY_COLOR[k]}"></i>${FAMILY_LABEL[k]}</span>`)
  .join("");

const explorePages = existsSync(outDir)
  ? readdirSync(outDir).filter((f) => f.endsWith("-专业之外的新活法.html"))
  : [];
const exploreBlock = `
  <section class="group">
    <h2><span class="bar"></span>拓展眼界：专业之外的新职业<em>23 条 · 8 个方向</em></h2>
    <a class="card" href="${encodeURI("专业之外的新职业地图.html")}">
      <div class="card-main"><h3>专业之外的新职业地图</h3><p>23 条新岗位形态，按 8 个方向归类，每条写清「跟你的专业怎么搭」</p></div>
      <div class="card-side"><span class="go">打开 →</span></div>
    </a>
    ${explorePages.map((f) => `    <a class="card" href="${encodeURI(f)}">
      <div class="card-main"><h3>${esc(f.replace("-专业之外的新活法.html", ""))}的拓展版</h3><p>先用得上 3 条 + 跳出去看看 20 条，可点方向筛选</p></div>
      <div class="card-side"><span class="go">打开 →</span></div>
    </a>`).join("\n")}
  </section>
`;

const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>专业的N种活法 · 全校专业总览</title>
<style>
  :root{--cream:#FCFFEA;--green:#4CAF6D;--deep:#3D8DCD;--ink:#1F2A30;--muted:#5B6B72}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--cream)}
  .wrap{max-width:760px;margin:0 auto;padding:0 16px 56px}
  header{background:linear-gradient(160deg,#AAECA7 0%,#FCFFEA 78%);padding:28px 0 20px;margin-bottom:8px}
  .head-in{max-width:760px;margin:0 auto;padding:0 16px}
  .badge{display:inline-block;background:#3D8DCD;color:#fff;font-weight:800;font-size:15px;letter-spacing:.5px;padding:4px 12px;border-radius:8px}
  h1{font-size:26px;line-height:1.3;margin:12px 0 6px}
  h1 .q{color:#4CAF6D}
  .sub{font-size:13.5px;color:var(--muted);line-height:1.7;margin:0}
  .stats{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 4px}
  .stat{background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 2px 10px rgba(61,141,205,.08);min-width:96px}
  .stat b{display:block;font-size:20px;color:#1A73BB}
  .stat span{font-size:12px;color:var(--muted)}
  .legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:14px 0 6px}
  .lg{display:inline-flex;align-items:center;gap:5px}
  .dot{width:8px;height:8px;border-radius:50%;display:inline-block}
  .group{margin:26px 0 0}
  .group h2{font-size:16px;margin:0 0 10px;display:flex;align-items:center;gap:8px}
  .group h2 .bar{width:4px;height:16px;background:#4CAF6D;border-radius:2px}
  .group h2 em{font-style:normal;font-size:12px;color:var(--muted);font-weight:400;margin-left:auto}
  .card{display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit;background:#fff;border-radius:14px;padding:14px 16px;margin-bottom:10px;box-shadow:0 2px 12px rgba(61,141,205,.07)}
  .card-main h3{font-size:16px;margin:0 0 4px;line-height:1.35}
  .card-main p{font-size:12.5px;color:var(--muted);margin:0}
  .card-side{margin-left:auto;display:flex;align-items:center;gap:6px}
  .go{font-size:12px;color:#1A73BB;margin-left:8px;white-space:nowrap}
  footer{margin-top:32px;padding-top:16px;border-top:1px dashed #d7e3d4;font-size:12px;color:var(--muted);line-height:1.8}
</style>
</head>
<body>
<header>
  <div class="head-in">
    <span class="badge">04</span>
    <h1>专业的<span class="q">N 种</span>"活法"</h1>
    <p class="sub">打破"一考定终身"的刻板印象，拓宽专业发展视野，加强探索的主动性与好奇心。</p>
    <div class="stats">
      <div class="stat"><b>${rows.length}</b><span>个专业</span></div>
      <div class="stat"><b>${totalPaths}</b><span>种活法</span></div>
      <div class="stat"><b>${allFams.size}</b><span>类路径族</span></div>
    </div>
    <div class="legend">${legend}</div>
  </div>
</header>
<div class="wrap">
${groupHtml}
${exploreBlock}
  <footer>
    专业清单依据学校教务处公布的 2025 级在办专业（共 ${rows.length} 个，按学院归类）。各条活法中的岗位、证书与报考条件为通用梳理，具体名额、政策与要求请以当年官方公告为准。
  </footer>
</div>
</body>
</html>
`;

writeFileSync(join(outDir, "index.html"), indexHtml, "utf8");

lines: {
  const report = {
    ok: problems.length === 0,
    majors: rows.length,
    total_paths: totalPaths,
    families: [...allFams],
    problems,
    index: join(outDir, "index.html"),
  };
  for (const r of rows) console.log(`ok  ${r.college}  ${r.major}  ${r.count}条  ${r.size}KB`);
  for (const p of problems) console.error(`fail ${p}`);
  console.log(JSON.stringify(report, null, 2));
}
if (problems.length) process.exitCode = 3;
