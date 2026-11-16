#!/usr/bin/env node
/**
 * recommend.mjs —— 按学生画像对「专业的N种活法」做个性化排序，并生成个性化页面。
 *
 * 用法：
 *   node scripts/recommend.mjs --profile <profile.json> [--out <页面.html>] [--top 5] [--json]
 *
 * profile.json 最小字段（后面都可省略）：
 *   {
 *     "major": "学前教育",              // 必填，须命中 assets/majors 里的专业
 *     "level": "专科", "grade": "大三",  // 阶段
 *     "state": "稳定",                  // 想要的工作状态：稳定 / 成长 / 收入 / 自由
 *     "interests": ["和孩子相处", "做内容"],
 *     "strengths": ["耐心", "会剪视频"],
 *     "region": "福州",
 *     "further": "maybe",               // yes 升学 / no 先就业 / maybe 待定
 *     "avoid": ["销售业绩", "夜班轮班"]
 *   }
 *
 * 输出：stdout 打印 JSON（ok / major / college / ranked / out），供 Agent 在对话里复述；
 *       --out 给了就顺手写一张个性化页面。
 * exit code：0 成功；3 专业不在库；2 参数错误
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TEMPLATE = join(ROOT, "assets", "template.html");
const DATA_DIR = join(ROOT, "assets", "majors");

/* 统一退出：同步写出后再退出，避免 process.exit 在管道/CI 下截断输出。 */
function die(code, payload) {
  writeFileSync(2, (typeof payload === "string" ? payload : JSON.stringify(payload)) + "\n");
  process.exit(code);
}
function arg(name, fallback = "") {
  const i = process.argv.indexOf("--" + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ---------- 1. 读画像 ---------- */
const profilePath = arg("profile");
if (!profilePath || !existsSync(profilePath)) {
  die(2, { ok: false, msg: "缺少 --profile 或文件不存在" });
}
let profile;
try {
  profile = JSON.parse(readFileSync(profilePath, "utf8").replace(/^\uFEFF/, ""));
} catch (e) {
  die(2, { ok: false, msg: "profile JSON 解析失败：" + e.message });
}
const major = String(profile.major || "").trim();
if (!major) {
  die(2, { ok: false, msg: "profile.major 必填" });
}

/* ---------- 2. 找专业数据 ---------- */
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
const pool = files.map((f) => {
  const data = JSON.parse(readFileSync(join(DATA_DIR, f), "utf8").replace(/^\uFEFF/, ""));
  return { file: f, data };
});
const norm = (s) => String(s || "").replace(/[\s（）()·\-]/g, "");
let hit =
  pool.find((x) => norm(x.data.major) === norm(major)) ||
  pool.find((x) => norm(major).includes(norm(x.data.major)) || norm(x.data.major).includes(norm(major))) ||
  pool.find((x) => norm(major).includes(norm((x.data.major || "").slice(0, 3))));

if (!hit) {
  die(3,
    {
      ok: false,
      code: 3,
      msg: "「" + major + "」不在专业库内",
      available: pool.map((x) => x.data.major),
    }
  );
}

const majorsData = hit.data;
const paths = (majorsData.paths || []).map((p, i) => ({ ...p, __i: i }));

/* ---------- 3. 画像解析 ---------- */
const prose = [
  ...(profile.interests || []),
  ...(profile.strengths || []),
  String(profile.state || ""),
  String(profile.extra || ""),
]
  .join(" ")
  .toLowerCase();

// 语义近义词组：用户词命中组内任一词，就把整组当成相关方向
const LEX = {
  孩子: ["幼儿", "儿童", "孩子", "托育", "亲子", "幼教", "早教", "保教"],
  老人: ["养老", "长者", "老年", "银龄", "康养", "照护"],
  沟通: ["家长", "沟通", "咨询", "面谈", "服务", "管理", "组织", "协调", "接待", "表达", "演讲"],
  内容: ["内容", "视频", "脚本", "拍摄", "剪辑", "剪", "公众号", "小红书", "绘本", "编导", "文案", "新媒体"],
  设计: ["设计", "插画", "排版", "视觉", "配色", "手绘", "工艺", "首饰", "美术", "审美", "修图"],
  技术: ["编程", "代码", "开发", "人工智能", "AI", "设备", "调试", "算法", "数据", "前端", "技术", "嵌入式", "机器人"],
  稳定: ["编制", "公办", "事业单位", "考编", "公告", "稳定", "体制"],
  创业: ["创业", "主理", "机构", "运营", "店长", "自己", "合伙"],
  动手: ["手工", "制作", "组装", "实操", "动手", "作品"],
  研究: ["教研", "课题", "论文", "方案", "评估", "备课"],
  英语: ["英语", "双语", "翻译", "口语", "国际", "外贸", "跨境"],
};
const reversed = (word) => Object.keys(LEX).find((k) => k === word || word.includes(k));

const userWords = [...(profile.interests || []), ...(profile.strengths || [])].filter(
  (w) => String(w).trim().length >= 2
);
const groups = new Set();
userWords.forEach((w) => {
  const k = reversed(String(w));
  if (k) groups.add(k);
  Object.keys(LEX).forEach((key) => {
    if (LEX[key].some((t) => String(w).toLowerCase().includes(t.toLowerCase()))) groups.add(key);
  });
});

const avoid = (profile.avoid || []).map((w) => String(w).trim()).filter(Boolean);
const state = String(profile.state || "").trim();
const further = String(profile.further || "").trim();

/* ---------- 4. 打分 ---------- */
function textOf(p) {
  return [
    p.name,
    p.oneline,
    ...(p.roles || []),
    ...(p.skills || []),
    p.access,
    p.match,
    p.cost,
    p.next,
    p.family,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function score(p) {
  const t = textOf(p);
  let s = 0;
  const hits = [];

  // 用户原话命中
  userWords.forEach((w) => {
    const key = String(w).toLowerCase();
    if (t.includes(key)) {
      s += 2.5;
      if (!hits.includes(w)) hits.push(w);
    }
  });

  // 语义组命中
  groups.forEach((g) => {
    const syn = LEX[g].filter((x) => x.length >= 2);
    if (syn.some((x) => t.includes(x.toLowerCase()))) {
      s += 1.5;
      if (!hits.includes(g)) hits.push(g);
    }
  });

  // 路径族偏好
  if (further === "yes" && p.family === "switch") s += 2;
  if (further === "no" && p.family === "switch") s -= 2;
  // 硬性偏好：权重高于泛关键词命中，避免被堆叠的关键词淹没
  if (/稳定|编制|体制|铁饭碗|公办|考编|考公|五险一金/.test(state + " " + prose)) {
    if (p.family === "public") s += 7;
    else if (p.family === "core" && /编|公办|事业单位/.test(t)) s += 2;
    if (p.family === "ops") s -= 2;
    if (p.family === "media") s -= 1;
  }
  if (/自由|创业|自己|开店|自由职业|不受管/.test(state + " " + prose)) {
    if (p.family === "ops") s += 5;
    if (p.family === "media") s += 4;
    if (p.family === "public") s -= 2;
  }
  if (/收入|赚钱|高薪|上限/.test(state + " " + prose)) {
    if (p.family === "ops" || p.family === "media") s += 3;
  }
  if (/成长|挑战|不确定|多试/.test(state + " " + prose)) {
    if (p.family === "hybrid" || p.family === "switch") s += 2;
  }

  // 地域
  const region = String(profile.region || "").trim();
  if (region && region !== "不限" && !region.includes("不限")) {
    if (t.includes(region.toLowerCase())) {
      s += 2;
      if (!hits.includes(region)) hits.push(region);
    }
  }

  // 想避开
  const conflicts = avoid.filter((a) => t.includes(String(a).toLowerCase()));
  s -= conflicts.length * 6;

  return { s, hits, conflicts };
}

const ranked = paths
  .map((p) => {
    const { s, hits, conflicts } = score(p);
    return { path: p, score: s, hits, conflicts };
  })
  .sort((a, b) => b.score - a.score || a.path.__i - b.path.__i);

const wantTop = Number(arg("top", "0")) || Math.min(5, ranked.length);
const chosen = ranked.slice(0, wantTop);

// fit 标签
const topScore = ranked[0].score;
const avg = ranked.reduce((a, x) => a + x.score, 0) / ranked.length;
const base = topScore > 0 ? topScore : avg;
chosen.forEach((r, idx) => {
  if (idx === 0) r.fit = "最匹配";
  else if (r.score >= base * 0.35) r.fit = "较匹配";
  else r.fit = "可作备选";
  r.why = buildWhy(r);
});

function buildWhy(r) {
  const parts = [];
  const p = r.path;
  if (r.hits.length) parts.push("命中你的「" + r.hits.slice(0, 3).join("、") + "」");
  if (r.conflicts.length) parts.push("但与你想避开的「" + r.conflicts.join("、") + "」有交集，需自己判断");
  if (!parts.length) parts.push("和你写的条件没有明显冲突");
  const tail = p.oneline ? "。这条路的核心是" + String(p.oneline).replace(/[。.]$/, "") : "。";
  return parts.join("；") + tail;
}

/* ---------- 5. 组装个性化数据 ---------- */
const chips = [];
if (profile.level) chips.push(profile.level);
if (profile.grade) chips.push(profile.grade);
if (profile.interests && profile.interests.length) chips.push("兴趣：" + profile.interests.slice(0, 3).join("、"));
if (profile.strengths && profile.strengths.length) chips.push("优势：" + profile.strengths.slice(0, 3).join("、"));
if (profile.region) chips.push("意向地：" + profile.region);
if (further) chips.push({ yes: "考虑升学", no: "先就业", maybe: "升学待定" }[further] || further);
if (avoid.length) chips.push("避开：" + avoid.join("、"));

const personalized = {
  major: majorsData.major,
  college: majorsData.college || "",
  note: "根据你的画像从" + paths.length + "条活法中筛出" + chosen.length + "条，排序仅供参考，怎么选由你定。",
  updated: new Date().toISOString().slice(0, 10),
  profileChips: chips,
  paths: chosen.map((r) => ({
    ...r.path,
    __i: undefined,
    fit: r.fit,
    why: r.why,
  })),
};
personalized.paths.forEach((p) => delete p.__i);

const outPath = arg("out");
if (outPath) {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const json = JSON.stringify(personalized).replace(/</g, "\\u003c");
  const html = tpl
    .replace(/\/\*__DATA__\*\//g, () => json)
    .replace(/__TITLE__/g, () => esc(personalized.major + "的N种活法（个性化）"))
    .replace(/__MAJOR__/g, () => esc(personalized.major));
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, html, "utf8");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      major: personalized.major,
      college: personalized.college,
      total: paths.length,
      chips,
      ranked: chosen.map((r) => ({
        name: r.path.name,
        family: r.path.family,
        fit: r.fit,
        score: Number(r.score.toFixed(1)),
        oneline: r.path.oneline,
        why: r.why,
      })),
      rest: ranked.slice(wantTop).map((r) => r.path.name),
      out: outPath || null,
    },
    null,
    2
  )
);
