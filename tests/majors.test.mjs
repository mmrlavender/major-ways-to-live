// 数据契约测试：只读 assets/ 下的 JSON，不依赖浏览器、不联网。
// 运行：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAJOR_DIR = join(ROOT, 'assets', 'majors');

// 每条活法必填字段，与 SKILL.md 第五节、references/paths-framework.md 对齐
const PATH_FIELDS = ['family', 'name', 'oneline', 'roles', 'skills', 'access', 'match', 'cost', 'next'];
// 六类路径族
const FAMILIES = ['core', 'public', 'hybrid', 'ops', 'media', 'switch'];

const files = readdirSync(MAJOR_DIR).filter((f) => f.endsWith('.json')).sort();
const majors = files.map((f) => ({ file: f, data: JSON.parse(readFileSync(join(MAJOR_DIR, f), 'utf8')) }));
const majorNames = majors.map((m) => m.data.major);

test('专业库：25 个在办专业，一专业一 JSON，编号 00–24 连续', () => {
  assert.equal(files.length, 25, '专业文件数量应为 25');
  const ids = files.map((f) => f.slice(0, 2));
  assert.deepEqual(ids, Array.from({ length: 25 }, (_, i) => String(i).padStart(2, '0')));
});

test('专业库：专业名唯一', () => {
  assert.equal(new Set(majorNames).size, majorNames.length, '存在重复专业名');
});

test('专业库：活法总数为 152 条', () => {
  const total = majors.reduce((n, m) => n + m.data.paths.length, 0);
  assert.equal(total, 152);
});

for (const { file, data } of majors) {
  test(`活法契约：${file}`, () => {
    assert.ok(data.major && typeof data.major === 'string', '缺 major');
    assert.ok(Array.isArray(data.paths) && data.paths.length >= 6, `${data.major} 至少 6 条活法`);
    for (const p of data.paths) {
      for (const k of PATH_FIELDS) {
        assert.ok(p[k] !== undefined && p[k] !== null && p[k] !== '', `${data.major} /「${p.name || '?'}」缺字段 ${k}`);
      }
      assert.ok(FAMILIES.includes(p.family), `${data.major} /「${p.name}」路径族 ${p.family} 不在六类内`);
      assert.ok(Array.isArray(p.roles) && p.roles.length >= 3 && p.roles.length <= 5, `${data.major} /「${p.name}」典型岗位应为 3~5 个`);
      assert.ok(Array.isArray(p.skills) && p.skills.length >= 2, `${data.major} /「${p.name}」技能项至少 2 条`);
      assert.ok(String(p.oneline).length <= 30, `${data.major} /「${p.name}」一句话超过 30 字`);
    }
  });
}

test('新职业库：23 条 / 8 个方向', () => {
  const nj = JSON.parse(readFileSync(join(ROOT, 'assets', 'new-jobs.json'), 'utf8'));
  assert.equal(nj.jobs.length, 23);
  const cats = new Set(nj.jobs.map((j) => j.category));
  assert.equal(cats.size, 8);
  assert.deepEqual([...cats].sort(), ['内容创意', '教育新形态', '数字技术', '文旅消费', '民生服务', '绿色低碳', '社区治理', '银发经济'].sort());
});

test('新职业库：relatedMajors 全部指向库内专业（不出现幽灵专业名）', () => {
  const nj = JSON.parse(readFileSync(join(ROOT, 'assets', 'new-jobs.json'), 'utf8'));
  const dangling = [];
  for (const job of nj.jobs) {
    assert.ok(Array.isArray(job.relatedMajors) && job.relatedMajors.length > 0, `「${job.name}」缺 relatedMajors`);
    for (const m of job.relatedMajors) if (!majorNames.includes(m)) dangling.push(`${job.name} → ${m}`);
  }
  assert.deepEqual(dangling, [], '存在不在专业库内的专业名');
});

test('示例数据：assets/example-data.json 与学前教育成稿一致', () => {
  const ex = JSON.parse(readFileSync(join(ROOT, 'assets', 'example-data.json'), 'utf8'));
  const xq = JSON.parse(readFileSync(join(MAJOR_DIR, '00-学前教育.json'), 'utf8'));
  assert.equal(ex.major, xq.major);
  assert.equal(ex.paths.length, xq.paths.length);
});
