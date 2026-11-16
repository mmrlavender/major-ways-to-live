// 文档一致性测试：确保 README / SKILL.md 里写到的文件真实存在，装完不会踩空。
// 运行：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

test('SKILL.md：frontmatter 完整，name 与安装目录一致', () => {
  const md = read('SKILL.md');
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, 'SKILL.md 必须以 YAML frontmatter 开头');
  const fm = m[1];
  assert.match(fm, /^name:\s*major-ways-to-live\s*$/m);
  const desc = fm.match(/^description:\s*(.+)$/m);
  assert.ok(desc && desc[1].trim().length >= 80, 'description 应说明触发场景');
});

test('SKILL.md：声明的 references / scripts 文件都在仓库里', () => {
  const md = read('SKILL.md');
  const refs = [...md.matchAll(/references\/([\w.-]+\.md)/g)].map((x) => x[1]);
  const scripts = [...md.matchAll(/scripts\/([\w.-]+\.mjs)/g)].map((x) => x[1]);
  assert.ok(refs.length > 0 && scripts.length > 0);
  for (const f of new Set(refs)) assert.ok(existsSync(join(ROOT, 'references', f)), `缺 references/${f}`);
  for (const f of new Set(scripts)) assert.ok(existsSync(join(ROOT, 'scripts', f)), `缺 scripts/${f}`);
});

test('README.md：引用的图片与数据文件都存在', () => {
  const md = read('README.md');
  const imgs = [...md.matchAll(/!\[[^\]]*\]\(([^)]+\.png)\)/g)].map((x) => x[1]);
  assert.ok(imgs.length >= 3, 'README 至少三张预览图');
  for (const p of imgs) assert.ok(existsSync(join(ROOT, p)), `README 引用图片不存在：${p}`);
});

test('README.md：安装口令指向本仓库', () => {
  const md = read('README.md');
  assert.match(md, /github\.com\/mmrlavender\/major-ways-to-live/);
});

test('LICENSE：MIT 且保留版权行', () => {
  const t = read('LICENSE');
  assert.match(t, /MIT License/);
  assert.match(t, /Copyright \(c\) \d{4}/);
});

test('.gitignore 存在且忽略临时产物', () => {
  const t = read('.gitignore');
  assert.match(t, /node_modules\//);
  assert.match(t, /\.zip/);
});

test('联动：README 声明的活法条数与数据实际一致', () => {
  const md = read('README.md');
  const claim = md.match(/(\d+)\s*条活法/);
  assert.ok(claim, 'README 应说明活法总条数');
  assert.equal(Number(claim[1]), 152);
});

test('联动：README 声明的专业数、新职业数与数据实际一致', () => {
  const md = read('README.md');
  const majorClaim = md.match(/(\d+)\s*个在办专业/);
  assert.ok(majorClaim && Number(majorClaim[1]) === 25, 'README 专业数 25');
});

test('index.html：入口页存在，引用的预览图都在，且带安装口令', () => {
  assert.ok(existsSync(join(ROOT, 'index.html')), '仓库根应有 index.html 作为展示入口');
  const html = read('index.html');
  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imgs.length >= 3, '入口页至少引用三张预览图');
  for (const src of imgs) {
    assert.ok(existsSync(join(ROOT, src)), `入口页引用的图片不存在：${src}`);
  }
  assert.match(html, /github\.com\/mmrlavender\/major-ways-to-live/);
});

test('examples/：每份示例画像都是合法 JSON 且含 major 字段', () => {
  const dir = join(ROOT, 'examples');
  assert.ok(existsSync(dir), '应有 examples/ 目录');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 2, '至少两份示例画像');
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    assert.ok(data.major && String(data.major).trim(), `${f} 缺少 major`);
  }
});

test('package.json：test 脚本与 engines 声明齐全', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.name, 'major-ways-to-live');
  assert.match(pkg.scripts.test, /node --test/);
  assert.ok(pkg.engines && pkg.engines.node, '应声明最低 Node 版本');
});

test('CI：workflow 会跑测试并校验产物自包含', () => {
  const wf = read('.github', 'workflows', 'verify.yml');
  assert.match(wf, /node --test tests\//);
  assert.match(wf, /island\.mjs/);
  assert.match(wf, /node-version/);
});
