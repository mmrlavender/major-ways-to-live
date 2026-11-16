---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 78db55555203ac71c8a419c882a06031_c0327276df4011f1913b525400393706
    ReservedCode1: xLKSrxVtddcBr6l34AEb6NoItPrnLJ4yXudy98zhgy7vb9OKz1/OGhC0ootMY8AjDf2JoegYF5sY88GO8O7PEt/HGu3z9IOT+O9yXrb3e11m96OGr5NArokdnLpyV7VL7FsSzjOLSQOXxruPsTSMMqizCGF4Un3MIKOexlbZ/LeJVoY4g8IDh06d8Y4=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 78db55555203ac71c8a419c882a06031_c0327276df4011f1913b525400393706
    ReservedCode2: xLKSrxVtddcBr6l34AEb6NoItPrnLJ4yXudy98zhgy7vb9OKz1/OGhC0ootMY8AjDf2JoegYF5sY88GO8O7PEt/HGu3z9IOT+O9yXrb3e11m96OGr5NArokdnLpyV7VL7FsSzjOLSQOXxruPsTSMMqizCGF4Un3MIKOexlbZ/LeJVoY4g8IDh06d8Y4=
---

# 验收记录

> 每次改动 Skill 后把实测数字更新到这里，方便别人复核「这套东西现在到底能不能跑」。

## 2026-11-13 · 工程化补齐（v1.1.0）

### 环境

| 项 | 值 |
| --- | --- |
| 系统 | Windows 10 19045 |
| Node.js | v26.13.1（另在 v22.12.0 上验证过脚本行为一致） |
| 依赖安装 | 无，`node_modules` 不存在也能跑 |
| Python | 不需要 |

### 自动化测试

```bash
node --test tests/
```

结果：**53 项全部通过，0 失败**。

| 测试文件 | 覆盖内容 | 用例数 |
| --- | --- | --- |
| `tests/majors.test.mjs` | 25 个专业 JSON 的字段契约、六类路径族取值、152 条活法、23 条新职业 / 8 方向、`relatedMajors` 无幽灵专业名 | 31 |
| `tests/island.test.mjs` | `island.mjs` 三维 / `--flat` / `--theme ocean` 三条产出分支、退出码 2 与 3、产物单文件自包含、`recommend.mjs`、`build_page.mjs`、`explore.mjs`、`build_all.mjs` | 10 |
| `tests/docs.test.mjs` | SKILL.md frontmatter 与 `references/`、`scripts/` 引用存在，README 图片与安装口令有效，README 声明的 25 专业 / 152 条活法与数据一致，入口页图片可达，示例画像与 CI 配置齐全 | 12 |

### 冒烟产物

| 命令 | 产物 | 大小 |
| --- | --- | --- |
| `island.mjs --profile examples/profile-学前教育.json` | 小星星·职业探索岛 | 821,915 B |
| `island.mjs --profile examples/profile-食品营养与健康.json` | 麦穗·职业探索岛 | 822,674 B |
| `build_all.mjs --data-dir assets/majors` | 25 个专业页 + `index.html` | 索引页 21,656 B，专业页约 20 KB |

两次单页产物都满足：`style:"3d"`、`theme:"ranch"`、`island_name` 以「·职业探索岛」结尾、五个节点齐全、`jobs_matched_by_major:true`。
`build_all.mjs` 的 `problems` 为空数组，说明全校 25 个专业都能出页面。

### 单文件自包含校验

对生成的 HTML 逐项断言（已固化为 `tests/island.test.mjs` 用例）：

- 无 `<script src=...>`、无 `<link href=...>`、无 `@import url(...)`
- `three.js` 已内联（体积 669,884 B）
- 四处注入占位符 `__TITLE__` / `__MAJOR__` / `/*__DATA__*/` / `/*__THREE__*/` 全部替换干净

### 本轮修的问题

1. **退出时输出被截断**：原来报错分支用 `console.error(...)` 紧跟 `process.exit()`，在管道 / CI 下 stdout 与 stderr 未冲刷完就退出，`--json` 消费者可能拿到半截 JSON（`code:3` 分支的 `available` 列表 25 个专业名时必现）。五个脚本统一改为 `die(code, payload)`：用 `writeFileSync(2, ...)` 同步写出后再退出。
2. **批量构建的退出码**：`build_all.mjs` 末尾由 `process.exit(3)` 改为 `process.exitCode = 3`，保证汇总报告完整打印后再退出。

### 未覆盖的部分

- 三维页面的视觉观感（配色、镜头、动物行为）没有自动化断言，需人工在浏览器里看一遍；WebGL 不可用时的文字降级分支同样靠人工确认。
- 手机端窄屏布局未纳入 CI，建议至少在 390 px 宽度下打开一次。
*（内容由AI生成，仅供参考）*
