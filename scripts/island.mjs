#!/usr/bin/env node
/**
 * island.mjs —— 生成「我的职业探索岛」个性化结论页：岛屿上 5 个交互点，每个栏目一个入口。
 *
 * 用法：
 *   node scripts/island.mjs --profile <profile.json> [--out <页面.html>] [--top 3] [--json]
 *
 * profile.json 与 scripts/recommend.mjs 完全一致（major 必填），可额外带：
 *   "says": ["我在探索里说过的原话1", "..."]   // 可选，画像节点的「你说过的」
 *
 * 岛屿 5 个交互点：
 *   ① 我的画像      灯塔   —— 画像标签 + 你说过的原话
 *   ② 最匹配的活法  主营地 —— 排序前 N 条（默认 3）
 *   ③ 备选路径      风车   —— 第 N+1 条起（默认 2 条）
 *   ④ 跳出去看      出海小舟 —— 与专业相关的 3 条新职业（assets/new-jobs.json）
 *   ⑤ 这周的第一步  路标   —— 前几条活法的 next 动作汇总
 *
 * exit code：0 成功；3 专业不在库；2 参数错误
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TEMPLATE = join(ROOT, "assets", "island-template.html");   // 平面版（--flat 时使用）
const TEMPLATE_RANCH = join(ROOT, "assets", "island-ranch-template.html"); // 雪山牧场三维版（默认）
const TEMPLATE_OCEAN = join(ROOT, "assets", "island-3d-ocean-template.html"); // 旧海洋岛三维版（--theme ocean）
const THREE_SRC = join(ROOT, "assets", "vendor", "three.min.js");   // 内联用的 Three.js
const DATA_DIR = join(ROOT, "assets", "majors");
const JOBS_FILE = join(ROOT, "assets", "new-jobs.json");

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

/* 岛名：学生可自命名，统一收敛为「XX·职业探索岛」；--name 优先，其次 profile.islandName，最后用专业名兜底 */
function toIslandName(v) {
  const s = String(v == null ? "" : v).trim().replace(/\s+/g, " ").slice(0, 20);
  if (!s) return "";
  if (/职业探索岛$/.test(s)) return s;
  const bare = s.replace(/[·・.\-—\s]+$/g, "");
  return bare + "·职业探索岛";
}
const islandName = toIslandName(arg("name")) || toIslandName(profile.islandName) || toIslandName(major);

/* ---------- 2. 找专业数据 ---------- */
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
const pool = files.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(DATA_DIR, f), "utf8").replace(/^\uFEFF/, "")),
}));
const norm = (s) => String(s || "").replace(/[\s（）()·\-]/g, "");
const hit =
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

/* ---------- 3. 画像解析（与 recommend.mjs 同一套规则） ---------- */
const prose = [
  ...(profile.interests || []),
  ...(profile.strengths || []),
  String(profile.state || ""),
  String(profile.extra || ""),
]
  .join(" ")
  .toLowerCase();

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
  健康: ["营养", "食品", "膳食", "健康", "配餐", "食育", "检验", "质量"],
  舞台: ["舞蹈", "表演", "舞台", "编舞", "演员", "形体"],
  音乐: ["音乐", "声乐", "乐器", "唱歌", "演出", "混音", "版权"],
};
const userWords = [...(profile.interests || []), ...(profile.strengths || [])].filter(
  (w) => String(w).trim().length >= 2
);
const groups = new Set();
userWords.forEach((w) => {
  const key = Object.keys(LEX).find((k) => k === w || String(w).includes(k));
  if (key) groups.add(key);
  Object.keys(LEX).forEach((g) => {
    if (LEX[g].some((t) => String(w).toLowerCase().includes(t.toLowerCase()))) groups.add(g);
  });
});
const avoid = (profile.avoid || []).map((w) => String(w).trim()).filter(Boolean);
const state = String(profile.state || "").trim();
const further = String(profile.further || "").trim();

function textOf(p) {
  return [p.name, p.oneline, ...(p.roles || []), ...(p.skills || []), p.access, p.match, p.cost, p.next, p.family]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function score(p) {
  const t = textOf(p);
  let s = 0;
  const hits = [];
  userWords.forEach((w) => {
    const key = String(w).toLowerCase();
    if (t.includes(key)) {
      s += 2.5;
      if (!hits.includes(w)) hits.push(w);
    }
  });
  groups.forEach((g) => {
    const syn = LEX[g].filter((x) => x.length >= 2);
    if (syn.some((x) => t.includes(x.toLowerCase()))) {
      s += 1.5;
      if (!hits.includes(g)) hits.push(g);
    }
  });
  if (further === "yes" && p.family === "switch") s += 2;
  if (further === "no" && p.family === "switch") s -= 2;
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
  const region = String(profile.region || "").trim();
  if (region && region !== "不限" && !region.includes("不限") && t.includes(region.toLowerCase())) {
    s += 2;
    if (!hits.includes(region)) hits.push(region);
  }
  const conflicts = avoid.filter((a) => t.includes(String(a).toLowerCase()));
  s -= conflicts.length * 6;
  return { s, hits, conflicts };
}
function buildWhy(r) {
  const parts = [];
  if (r.hits.length) parts.push("命中你的「" + r.hits.slice(0, 3).join("、") + "」");
  if (r.conflicts.length) parts.push("但与你想避开的「" + r.conflicts.join("、") + "」有交集，需自己判断");
  if (!parts.length) parts.push("和你写的条件没有明显冲突");
  const tail = r.path.oneline ? "。这条路的核心是" + String(r.path.oneline).replace(/[。.]$/, "") : "。";
  return parts.join("；") + tail;
}

const ranked = paths
  .map((p) => {
    const { s, hits, conflicts } = score(p);
    return { path: p, score: s, hits, conflicts };
  })
  .sort((a, b) => b.score - a.score || a.path.__i - b.path.__i);

const topScore = ranked[0].score;
const avg = ranked.reduce((a, x) => a + x.score, 0) / ranked.length;
const base = topScore > 0 ? topScore : avg;
ranked.forEach((r, idx) => {
  if (idx === 0) r.fit = "最匹配";
  else if (r.score >= base * 0.35) r.fit = "较匹配";
  else r.fit = "可作备选";
  r.why = buildWhy(r);
});

const wantTop = Math.max(1, Math.min(Number(arg("top", "3")) || 3, ranked.length - 1));
const topList = ranked.slice(0, wantTop);
const altList = ranked.slice(wantTop, Math.min(wantTop + 2, ranked.length));

function toPath(r) {
  const p = { ...r.path };
  delete p.__i;
  p.fit = r.fit;
  p.why = r.why;
  return p;
}

/* ---------- 4. 新职业：按 relatedMajors 命中的前 3 条 ---------- */
let jobsData = { jobs: [] };
if (existsSync(JOBS_FILE)) {
  try {
    jobsData = JSON.parse(readFileSync(JOBS_FILE, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    jobsData = { jobs: [] };
  }
}
const allJobs = jobsData.jobs || [];
const majorName = majorsData.major;
const related = allJobs.filter((j) => (j.relatedMajors || []).some((m) => norm(m) === norm(majorName) || norm(m).includes(norm(majorName))));
const pickJobs = (related.length ? related : allJobs).slice(0, 3);
const jobsLead = related.length
  ? "这些不是让你转行，是把已经会的东西换个地方用。"
  : "下面 3 条和你专业没有直接接口，纯当看外面的世界。";

/* ---------- 5. 画像标签与摘录 ---------- */
const chips = [];
if (profile.level) chips.push(profile.level);
if (profile.grade) chips.push(profile.grade);
if (profile.state) chips.push("想要：" + String(profile.state).slice(0, 22));
if (profile.interests && profile.interests.length) chips.push("兴趣：" + profile.interests.slice(0, 3).join("、"));
if (profile.strengths && profile.strengths.length) chips.push("优势：" + profile.strengths.slice(0, 3).join("、"));
if (profile.region) chips.push("意向地：" + profile.region);
if (further) chips.push({ yes: "考虑升学", no: "先就业", maybe: "升学待定" }[further] || further);
if (avoid.length) chips.push("避开：" + avoid.join("、"));

const says = [];
if (profile.says && profile.says.length) says.push(...profile.says);
else {
  if (profile.state) says.push("想要的工作状态：" + profile.state);
  if (profile.interests && profile.interests.length) says.push("做起来不觉得累的事：" + profile.interests.join("、"));
  if (profile.strengths && profile.strengths.length) says.push("自己觉得像的样子：" + profile.strengths.join("、"));
  if (profile.region) says.push("想留在：" + profile.region);
  if (avoid.length) says.push("不想干的：" + avoid.join("、"));
}

/* ---------- 5.5 主题（默认牧场；--flat 走二维，--theme ocean 走旧海洋岛） ---------- */
const themeArg = String(arg("theme", "") || "").trim().toLowerCase();
const wantFlat = arg("flat") === "1" || arg("style") === "flat" || themeArg === "flat";
const theme = wantFlat ? "flat" : (themeArg === "ocean" ? "ocean" : "ranch");
const KICKERS = {
  ranch: ["① 牧人小屋", "② 奶酪工坊", "③ 风车", "④ 缆车站", "⑤ 路标"],
  ocean: ["① 灯塔", "② 主营地", "③ 风车", "④ 出海", "⑤ 路标"],
};
const K = KICKERS[theme === "ocean" ? "ocean" : "ranch"];

/* ---------- 6. 组装岛屿数据 ---------- */
const island = {
  major: majorName,
  islandName: islandName,
  college: majorsData.college || "",
  headline: majorName + "的" + "N" + "种“活法”",
  note: "排序只按你说的画像来，怎么选由你定；具体报考条件与政策以当年公告为准",
  updated: new Date().toISOString().slice(0, 10),
  profileChips: chips,
  nodes: [
    {
      id: "me",
      kind: "profile",
      kicker: K[0],
      label: "我的画像",
      lead: "你在这一轮探索里给出的条件，就是岛上所有路线的起点。",
      says,
      tail: "画像不是判决书。想改动哪一条，随时改，排序会跟着变。",
    },
    {
      id: "top",
      kind: "paths",
      kicker: K[1],
      label: "最匹配的活法",
      lead: "从 " + paths.length + " 条活法里排到前面的 " + topList.length + " 条，理由写清楚了，代价也写了。",
      items: topList.map(toPath),
    },
    {
      id: "alt",
      kind: "paths",
      kicker: K[2],
      label: "备选路径",
      lead: altList.length
        ? "没进前三，但不是不能选；换了条件，它们可能就上来了。"
        : "你专业只有这些路线，备选没有额外的。",
      items: altList.map(toPath),
    },
    {
      id: "new",
      kind: "jobs",
      kicker: K[3],
      label: "跳出去看的新职业",
      lead: jobsLead,
      items: pickJobs,
    },
    {
      id: "next",
      kind: "steps",
      kicker: K[4],
      label: "这周的第一步",
      lead: "别一次改命，先动一步。下面几条都是本周能做完的。",
      items: [...topList, ...altList].map((r) => ({ from: r.path.name, text: r.path.next })),
    },
  ],
};

/* ---------- 7. 写页面 ---------- */
const outPath = arg("out");
let styleUsed = "flat";
if (outPath) {
  let tplPath = TEMPLATE;
  if (theme === "ranch") {
    tplPath = existsSync(TEMPLATE_RANCH) ? TEMPLATE_RANCH
      : (existsSync(TEMPLATE_OCEAN) ? TEMPLATE_OCEAN : TEMPLATE);
  } else if (theme === "ocean") {
    tplPath = existsSync(TEMPLATE_OCEAN) ? TEMPLATE_OCEAN : TEMPLATE;
  }
  if (!existsSync(tplPath)) {
    die(2, { ok: false, msg: "缺少模板文件 assets/island-ranch-template.html 或 assets/island-3d-ocean-template.html 或 assets/island-template.html" });
  }
  const tpl = readFileSync(tplPath, "utf8");
  const json = JSON.stringify(island).replace(/</g, "\\u003c");
  let threeSrc = "";
  if (tplPath !== TEMPLATE) {
    if (!existsSync(THREE_SRC)) {
      die(2, { ok: false, msg: "缺少 assets/vendor/three.min.js，请先下载 Three.js" });
    }
    threeSrc = readFileSync(THREE_SRC, "utf8").replace(/<\/script/gi, "<\\/script");
  }
  const html = tpl
    .replace(/\/\*__DATA__\*\//g, () => json)
    .replace(/\/\*__THREE__\*\//g, () => threeSrc)
    .replace(/__TITLE__/g, () => esc(islandName))
    .replace(/__MAJOR__/g, () => esc(majorName));
  const dir = dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, html, "utf8");
  styleUsed = tplPath === TEMPLATE ? "flat" : "3d";
}

console.log(
  JSON.stringify(
    {
      ok: true,
      major: majorName,
      island_name: islandName,
      college: majorsData.college || "",
      total_paths: paths.length,
      chips,
      nodes: island.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        count: n.items ? n.items.length : n.says ? n.says.length : 0,
      })),
      top: topList.map((r) => ({ name: r.path.name, fit: r.fit, score: Number(r.score.toFixed(1)), why: r.why })),
      alt: altList.map((r) => ({ name: r.path.name, fit: r.fit })),
      jobs: pickJobs.map((j) => j.name),
      jobs_matched_by_major: related.length > 0,
      out: outPath || null,
    style: styleUsed,
    theme,
    },
    null,
    2
  )
);
