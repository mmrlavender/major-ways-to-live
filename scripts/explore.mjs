#!/usr/bin/env node
// 生成「专业之外的新职业地图」单页 HTML
// 用法：
//   node scripts/explore.mjs --out <页面.html>                                  # 通用版（全部新职业）
//   node scripts/explore.mjs --major 学前教育 --out <页面.html>                  # 带专业关联排序
//   node scripts/explore.mjs --major 学前教育 --categories 数字技术,银发经济 --out <页面.html>
//   node scripts/explore.mjs --major 学前教育 --profile profile.json --out <页面.html>  # 结合访谈画像
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TEMPLATE = resolve(ROOT, "assets", "template.html");

function arg(name, def = null) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const JOBS_PATH = resolve(ROOT, "assets", "new-jobs.json");
const DATA_DIR = resolve(ROOT, "assets", "majors");
const major = (arg("major") || "").trim();
const outPath = arg("out");
const profilePath = arg("profile");
const catsWanted = (arg("categories") || "").split(/[,，\s]+/).filter(Boolean);

if (!outPath) {
  console.error("缺少 --out <输出文件路径>");
  process.exit(2);
}
if (!existsSync(JOBS_PATH)) {
  console.error("缺少 assets/new-jobs.json");
  process.exit(2);
}

const bank = JSON.parse(readFileSync(JOBS_PATH, "utf8"));
let jobs = (bank.jobs || []).slice();

/* ---------- 校验 ---------- */
const problems = [];
const REQUIRED = ["name", "oneline", "access", "match", "cost", "next", "bridge", "category"];
jobs.forEach((j, i) => {
  REQUIRED.forEach((k) => {
    if (!j[k] || !String(j[k]).trim()) problems.push(`#${i} ${j.name || "?"} 缺少 ${k}`);
  });
  if (!Array.isArray(j.roles) || !j.roles.length) problems.push(`#${i} ${j.name} 缺少 roles`);
  if (!Array.isArray(j.skills) || !j.skills.length) problems.push(`#${i} ${j.name} 缺少 skills`);
});
if (problems.length) {
  console.error("数据校验未通过：\n" + problems.join("\n"));
  process.exit(3);
}

/* ---------- 专业数据（用于关联度） ---------- */
function loadMajorPaths(name) {
  if (!name || !existsSync(DATA_DIR)) return null;
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(join(DATA_DIR, f), "utf8"));
      if (d.major && d.major.trim() === name) return d;
    } catch (e) {}
  }
  return null;
}
const majorData = loadMajorPaths(major);

/* ---------- 文本相似度（中文 bigram 交集） ---------- */
function norm(s) {
  return String(s || "").replace(/[\s，。、；：！？（）()【】《》“”"'’·\-—…,.!?;:/\\|+]/g, "");
}
function bigrams(s) {
  const t = norm(s);
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((x) => { if (B.has(x)) hit++; });
  return hit / Math.min(A.size, B.size);
}
function jobText(j) {
  return [j.name, j.oneline, (j.roles || []).join(" "), (j.skills || []).join(" "), j.access, j.match].join(" ");
}

/* ---------- 画像 ---------- */
let profile = null;
if (profilePath && existsSync(profilePath)) {
  try { profile = JSON.parse(readFileSync(profilePath, "utf8")); } catch (e) { profile = null; }
}
const profileText = profile
  ? Object.values(profile).map((v) => (Array.isArray(v) ? v.join(" ") : String(v || ""))).join(" ")
  : "";
const avoidText = profile && profile.avoid
  ? (Array.isArray(profile.avoid) ? profile.avoid.join(" ") : String(profile.avoid))
  : "";

const SIGNALS = [
  { kw: ["老人", "养老", "长者", "银发", "照护"], cat: ["银发经济"], add: 3.2 },
  { kw: ["孩子", "儿童", "幼儿", "小孩", "托育"], cat: ["民生服务", "教育新形态"], add: 2.8 },
  { kw: ["电脑", "技术", "设备", "编程", "代码", "理工", "机器"], cat: ["数字技术"], add: 3.2 },
  { kw: ["内容", "视频", "写作", "拍", "剪", "创作", "文案"], cat: ["内容创意"], add: 3.2 },
  { kw: ["设计", "手工", "美术", "画", "审美", "首饰"], cat: ["内容创意", "文旅消费"], add: 2.8 },
  { kw: ["沟通", "组织", "活动", "张罗", "社交", "协调"], cat: ["社区治理", "民生服务"], add: 2.2 },
  { kw: ["旅游", "研学", "户外", "出行", "乡村"], cat: ["文旅消费"], add: 2.6 },
  { kw: ["环保", "低碳", "能源", "绿色"], cat: ["绿色低碳"], add: 2.6 },
];
const STATE_SIGNALS = [
  { kw: ["稳定", "编制", "公办", "体制", "别折腾"], fam: { public: 5, core: 1.5 } },
  { kw: ["自由", "不受管", "自己安排", "不想被管", "灵活"], fam: { ops: 5, media: 3 } },
  { kw: ["成长", "学东西", "进步", "挑战"], fam: { core: 3, hybrid: 3 } },
  { kw: ["收入", "赚钱", "挣钱", "高薪"], fam: { ops: 3, media: 3 } },
];

function scoreJob(j) {
  let score = 0;
  const why = [];

  if (majorData) {
    if ((j.relatedMajors || []).some((m) => m === major || major.includes(m) || m.includes(major))) {
      score += 8;
      why.push("你的专业底子直接能用");
    }
    let best = 0;
    (majorData.paths || []).forEach((p) => {
      const s = similarity(jobText(j), jobText(p));
      if (s > best) best = s;
    });
    if (best > 0.05) {
      score += Math.min(6, best * 12);
      if (best > 0.12) why.push("和你现有活法有共通能力");
    }
  }

  const jt = jobText(j);
  SIGNALS.forEach((sig) => {
    if (sig.kw.some((k) => profileText.includes(k)) && sig.cat.includes(j.category)) {
      score += sig.add;
    }
  });
  STATE_SIGNALS.forEach((sig) => {
    if (sig.kw.some((k) => profileText.includes(k))) {
      const v = sig.fam[j.family];
      if (v) score += v;
    }
  });

  if (avoidText) {
    const avoidWords = avoidText.split(/[,，、;；\s]+/).filter((w) => w.length >= 2);
    const costText = [j.cost, j.oneline, j.match, j.access].join(" ");
    avoidWords.forEach((w) => {
      if (costText.includes(w)) {
        score -= 8;
        why.push(`注意：这行可能要面对「${w}」`);
      }
    });
  }
  return { score, why };
}

/* ---------- 排序与分组 ---------- */
const CAT_ORDER = ["数字技术", "内容创意", "银发经济", "文旅消费", "民生服务", "社区治理", "绿色低碳", "教育新形态"];
const catRank = (c) => {
  const i = CAT_ORDER.indexOf(c);
  return i < 0 ? 99 : i;
};

const scored = jobs.map((j) => {
  const r = scoreJob(j);
  return { ...j, _score: r.score, _why: r.why };
});

let chosen = scored;
if (catsWanted.length) {
  chosen = chosen.filter((j) => catsWanted.includes(j.category));
  if (!chosen.length) {
    console.error("所选方向没有内容：" + catsWanted.join(","));
    process.exit(4);
  }
}

function mk(j, fit) {
  return {
    name: j.name,
    fit: fit || null,
    oneline: j.oneline,
    why: majorData
      ? (j._why.length ? j._why.slice(0, 2).join("；") : "看它要的能力，和你现在的积累有多少重合")
      : "",
    category: j.category,
    bridge: j.bridge || "",
    roles: j.roles || [],
    skills: j.skills || [],
    access: j.access,
    match: j.match,
    cost: j.cost,
    next: j.next,
    family: j.family || "core",
  };
}

// 衔接区：跟专业底子最贴的 3 条（只在带专业参数时才有）
const nearSrc = majorData
  ? chosen.slice().sort((a, b) => b._score - a._score).filter((j) => j._score >= 4.5).slice(0, 3)
  : [];
const nearNames = new Set(nearSrc.map((j) => j.name));
const nearItems = nearSrc.map((j) => mk(j, "先用得上"));

// 拓展区：其余全部，按方向聚拢，方向内按相关度
const restItems = chosen
  .filter((j) => !nearNames.has(j.name))
  .sort((a, b) => catRank(a.category) - catRank(b.category) || b._score - a._score)
  .map((j) => mk(j, majorData && j._score >= 6 ? "值得试一试" : null));

const groups = nearItems.length
  ? [
      {
        title: "一、先用得上：你的专业底子能直接接上的方向",
        desc: "这几条不是让你转行，是把已经会的东西换个地方用。",
        items: nearItems,
      },
      {
        title: "二、跳出去看看：这些方向不看专业出身",
        desc: "按方向归在一起，先扫一遍，挑一个你愿意补能力的就行，不用现在就决定。",
        items: restItems,
      },
    ]
  : [];

const paths = nearItems.concat(restItems);

const catCount = {};
chosen.forEach((j) => { catCount[j.category] = (catCount[j.category] || 0) + 1; });
const filterChips = Object.keys(catCount).sort((a, b) => catRank(a) - catRank(b));

const headline = major
  ? `${major}之外，还有 ${paths.length} 种新活法`
  : `专业之外，还有 ${paths.length} 种新活法`;

const DATA = {
  major: major || "专业",
  headline,
  paths,
  groups,
  filterChips,
  profileChips: major ? [`给「${major}」的拓展版`] : ["全校通用版"],
  note: bank.note || "岗位名称与准入要求以当年官方公告和企业实际招聘为准。",
  updated: bank.updated || "",
};

let html = readFileSync(TEMPLATE, "utf8");
html = html
  .replace("/*__DATA__*/", JSON.stringify(DATA))
  .replace("__TITLE__", headline)
  .replace("__MAJOR__", major || "专业")
  .replaceAll("__INDEX__", "index.html")
  .replaceAll("__EXPLORE__", "");

writeFileSync(outPath, html, "utf8");
console.log(JSON.stringify({
  ok: true,
  major: major || null,
  total: paths.length,
  groups: groups.map((g) => ({ title: g.title, count: g.items.length })),
  categories: filterChips,
  out: outPath,
}, null, 2));
