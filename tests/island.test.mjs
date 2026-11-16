// 脚本冒烟测试：真实执行 scripts/*.mjs，检查退出码契约与产物自包含性。
// 运行：node --test tests/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = mkdtempSync(join(tmpdir(), 'mwtl-test-'));

after(() => { try { rmSync(WORK, { recursive: true, force: true }); } catch {} });

const PROFILE = join(WORK, 'profile.json');
writeFileSync(PROFILE, JSON.stringify({
  major: '学前教育',
  stage: '大二',
  wantState: '稳定+有成长',
  interests: ['和孩子打交道'],
  strengths: ['耐心', '会做手工'],
  city: '福州',
  avoid: ['长期熬夜'],
  islandName: '小星星',
}, null, 2), 'utf8');

function run(script, args) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000,
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function jsonOf(r) {
  // 成功走 stdout、报错走 stderr；两者都可能是格式化多行 JSON
  for (const stream of [r.out, r.err]) {
    const start = stream.indexOf('{');
    const end = stream.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(stream.slice(start, end + 1)); } catch { /* 换下一个流 */ }
    }
  }
  assert.fail(`没有可解析的 JSON：${r.out.slice(0, 200)} | ${r.err.slice(0, 200)}`);
}

test('island.mjs：默认生成三维牧场岛，退出码 0', () => {
  const out = join(WORK, 'island.html');
  const r = run('island.mjs', ['--profile', PROFILE, '--out', out, '--json']);
  assert.equal(r.code, 0, r.err);
  const d = jsonOf(r);
  assert.equal(d.ok, true);
  assert.equal(d.style, '3d');
  assert.equal(d.theme, 'ranch');
  assert.equal(d.island_name, '小星星·职业探索岛');
  assert.equal(d.major, '学前教育');
  assert.ok(d.total_paths >= 6);
  assert.equal(d.nodes.length, 5, '岛屿固定五地标');
  assert.deepEqual(d.nodes.map((n) => n.id), ['me', 'top', 'alt', 'new', 'next']);
  assert.equal(d.jobs_matched_by_major, true, '新职业应按专业匹配');
  assert.ok(existsSync(out) && statSync(out).size > 300000, '产物异常偏小');
});

test('island.mjs：产物是单文件，无外部依赖', () => {
  const out = join(WORK, 'island.html');
  const html = readFileSync(out, 'utf8');
  assert.ok(!/<script[^>]+src=/i.test(html), '不得有外链 script');
  assert.ok(!/<link[^>]+href=/i.test(html), '不得有外链样式表');
  assert.ok(!/@import\s+url\(/i.test(html), '不得有 @import 外部资源');
  assert.ok(!/\bsrc=["']https?:/i.test(html), '不得有远程资源引用');
  assert.ok(html.includes('THREE'), 'three.js 应已内联');
  // 三处模板占位符必须被替换干净
  for (const token of ['__TITLE__', '__MAJOR__', '/*__DATA__*/', '/*__THREE__*/']) {
    assert.ok(!html.includes(token), `占位符 ${token} 未替换`);
  }
});

test('island.mjs：--flat 1 走二维回退，体积更小', () => {
  const out = join(WORK, 'flat.html');
  const r = run('island.mjs', ['--profile', PROFILE, '--out', out, '--flat', '1', '--json']);
  assert.equal(r.code, 0, r.err);
  const d = jsonOf(r);
  assert.equal(d.style, 'flat');
  assert.ok(statSync(out).size < statSync(join(WORK, 'island.html')).size);
});

test('island.mjs：--theme ocean 切换旧海洋岛视觉', () => {
  const out = join(WORK, 'ocean.html');
  const r = run('island.mjs', ['--profile', PROFILE, '--out', out, '--theme', 'ocean', '--json']);
  assert.equal(r.code, 0, r.err);
  assert.equal(jsonOf(r).theme, 'ocean');
});

test('island.mjs：专业不在库时退出码 3，并列出可用专业', () => {
  const bad = join(WORK, 'bad.json');
  writeFileSync(bad, JSON.stringify({ major: '不存在的专业' }), 'utf8');
  const r = run('island.mjs', ['--profile', bad, '--out', join(WORK, 'x.html'), '--json']);
  assert.equal(r.code, 3);
  const d = jsonOf(r);
  assert.equal(d.ok, false);
  assert.equal(d.code, 3);
  assert.ok(Array.isArray(d.available) && d.available.includes('学前教育'));
});

test('island.mjs：缺 --profile 时退出码 2', () => {
  const r = run('island.mjs', ['--json']);
  assert.equal(r.code, 2);
  assert.match(r.out + r.err, /--profile/);
});

test('recommend.mjs：海报页可生成，退出码 0', () => {
  const out = join(WORK, 'poster.html');
  const r = run('recommend.mjs', ['--profile', PROFILE, '--out', out, '--json']);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(out) && statSync(out).size > 5000);
  const html = readFileSync(out, 'utf8');
  assert.ok(!/<script[^>]+src=/i.test(html), '不得有外链 script');
});

test('build_page.mjs：单专业通用页可生成', () => {
  const out = join(WORK, 'single.html');
  const r = run('build_page.mjs', ['--data', join(ROOT, 'assets', 'majors', '00-学前教育.json'), '--out', out]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(out) && statSync(out).size > 5000);
});

test('explore.mjs：新职业地图可生成', () => {
  const out = join(WORK, 'explore.html');
  const r = run('explore.mjs', ['--out', out]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(out) && statSync(out).size > 5000);
});

test('build_all.mjs：全校批量 + index 页', () => {
  const dir = join(WORK, 'all');
  const r = run('build_all.mjs', ['--data-dir', join(ROOT, 'assets', 'majors'), '--out-dir', dir]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, 'index.html')), '应生成索引页');
  const htmlPages = readdirSync(dir).filter((f) => f.endsWith('.html'));
  assert.ok(htmlPages.length >= 26, '应有 25 个专业页 + index');
});
