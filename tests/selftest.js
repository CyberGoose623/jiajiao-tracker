/* 自测脚本：node tests/selftest.js
   只测纯逻辑与静态资源，不涉及界面交互
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' → ' + detail : '')); }
}

function readJSON(p) { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); }

/* ---------- 装载 calc.js ---------- */
global.window = { YW: {} };
const sandbox = global.window.YW;
global.YW = sandbox;
const calcSrc = fs.readFileSync(path.join(ROOT, 'js/calc.js'), 'utf8');
new Function('window', calcSrc)(global.window);
const C = global.window.YW.calc;

sandbox.state = { tagGroups: readJSON('error-tags.json').groups };

console.log('\n[1] 数据文件');
const tplDoc = readJSON('exam-templates.json');
const tagDoc = readJSON('error-tags.json');
check('exam-templates.json 可解析，schemaVersion=1', tplDoc.schemaVersion === 1);
check('error-tags.json 可解析，schemaVersion=1', tagDoc.schemaVersion === 1);

const tpl = tplDoc.templates[0];
const v = C.validateTemplate(tpl);
check('模板结构校验通过', v.ok, v.errors && v.errors.join('；'));
check('模板小题满分合计 = totalScore(120)', v.sum === tpl.totalScore, '实际 ' + v.sum);

const dims = {};
C.templateItems(tpl).forEach((e) => {
  dims[e.item.dimension] = (dims[e.item.dimension] || 0) + e.item.fullScore;
});
// 维度口径：jilei 只含字音字形/词语/病句/语言运用/默写，名著单列 mingzhu
check('维度统计：积累和运用 16 分', dims.jilei === 16, String(dims.jilei));
check('卷一（积累 16 + 名著 4）= 20 分', dims.jilei + dims.mingzhu === 20);
check('阅读合计 50 分（现代文 32 + 文言 14 + 古诗 4）', dims.xiandai + dims.wenyan + dims.gushi === 50,
  String(dims.xiandai + dims.wenyan + dims.gushi));
check('名著 4 / 文言 14 / 现代文 32 / 古诗 4 / 写作 50',
  dims.mingzhu === 4 && dims.wenyan === 14 && dims.xiandai === 32 && dims.gushi === 4 && dims.xiezuo === 50,
  JSON.stringify(dims));
check('题号包含小题形式 6(1)', C.templateItems(tpl).some((e) => e.item.no === '6(1)'));

const dv = C.validateTags(tagDoc);
check('错因词表校验通过', dv.ok, dv.errors && dv.errors.join('；'));
check('错因标签数量 = 34', tagDoc.groups.reduce((a, g) => a + g.tags.length, 0) === 34);
check('标签 id 唯一', (() => {
  const ids = new Set(); let dup = false;
  tagDoc.groups.forEach((g) => g.tags.forEach((t) => { if (ids.has(t.id)) dup = true; ids.add(t.id); }));
  return !dup;
})());
check('模板小题 id 唯一', (() => {
  const ids = new Set(); let dup = false;
  C.templateItems(tpl).forEach((e) => { if (ids.has(e.item.id)) dup = true; ids.add(e.item.id); });
  return !dup;
})());

console.log('\n[2] 计算规则');

function makeExam(id, date, pairs, essayLevel) {
  return {
    id, date, name: '测试' + id, templateId: tpl.id,
    templateSnapshot: JSON.parse(JSON.stringify(tpl)),
    answers: pairs.map(([itemId, got]) => {
      const e = C.templateItems(tpl).find((x) => x.item.id === itemId);
      return {
        itemId, no: e.item.no, dimension: e.item.dimension,
        fullScore: e.item.fullScore, gotScore: got, errorTagIds: [], note: ''
      };
    }),
    essayLevel: essayLevel === undefined ? null : essayLevel,
    paperImageId: null,
    createdAt: Date.now()
  };
}

// 加权 vs 平均：2 分题得 0，16 分题得 16
const weighted = makeExam('exam-t', '2026-10-01', [
  ['i-1', 0],   // 2 分 0 分
  ['i-7', 4], ['i-8', 4], ['i-9', 5], ['i-10', 5]  // 记叙文 18 分满分
]);
const t1 = C.totals(weighted, {});
check('得分率按满分加权（18/20=90%）', Math.abs(t1.rate - 0.9) < 1e-9, String(t1.rate));
const naive = (0 / 2 + 18 / 18) / 2;
check('不是简单平均（简单平均会得 50%）', Math.abs(t1.rate - naive) > 1e-6, 'naive=' + naive);

const d1 = C.dimensions(weighted, {}).find((d) => d.key === 'jilei');
check('维度 jilei = 0/2', d1.got === 0 && d1.full === 2);

// 排除作文
const full = makeExam('exam-full', '2026-10-10', C.templateItems(tpl).map((e) => [e.item.id, e.item.fullScore]));
const tf = C.totals(full, {});
check('满分卷 = 120/120 = 100%', tf.got === 120 && tf.full === 120 && tf.rate === 1, JSON.stringify(tf));
const tfx = C.totals(full, { excludeEssay: true });
check('排除作文后满分 70', tfx.full === 70, JSON.stringify(tfx));
const half = makeExam('exam-half', '2026-10-12', C.templateItems(tpl).map((e) => [e.item.id, e.item.fullScore / 2]));
check('半对卷 = 60/120 = 50%', Math.abs(C.totals(half, {}).rate - 0.5) < 1e-9);
check('半对卷排除作文后仍是 50%', Math.abs(C.totals(half, { excludeEssay: true }).rate - 0.5) < 1e-9);

// 作文档位折算
const essay40 = makeExam('exam-e', '2026-10-15', [['i-20', 41]]);
check('作文 41/50 折算二类', C.essayLevelOf(essay40) === 2, String(C.essayLevelOf(essay40)));
const essay29 = makeExam('exam-e2', '2026-10-16', [['i-20', 29]]);
check('作文 29/50 折算五类', C.essayLevelOf(essay29) === 5, String(C.essayLevelOf(essay29)));
check('手动档位优先', C.essayLevelOf(Object.assign({}, essay40, { essayLevel: 1 })) === 1);

// 快照：改模板不影响历史
const hist = makeExam('exam-snap', '2026-09-01', [['i-1', 1]]);
const before = C.totals(hist, {}).full;
const edited = JSON.parse(JSON.stringify(tpl));
C.templateItems(edited).find((e) => e.item.id === 'i-1').item.fullScore = 10;
const after = C.totals(hist, {}).full;
check('改当前模板后，历史记录满分不变', before === after && after === 2, before + ' / ' + after);

// 排序与最近 N 次
const list = [
  makeExam('exam-c', '2026-11-05', [['i-1', 2]]),
  makeExam('exam-a', '2026-09-10', [['i-1', 2]]),
  makeExam('exam-b', '2026-10-15', [['i-1', 2]])
];
const sorted = C.sortExams(list).map((e) => e.id);
check('按日期升序', JSON.stringify(sorted) === JSON.stringify(['exam-a', 'exam-b', 'exam-c']), sorted.join(','));
check('最近 2 次取到 b、c', JSON.stringify(C.recent(list, 2).map((e) => e.id)) === JSON.stringify(['exam-b', 'exam-c']));

// 错因统计与趋势
sandbox.state.tagGroups = tagDoc.groups;
const taged = [
  makeExam('exam-1', '2026-09-01', [['i-7', 2]]),
  makeExam('exam-2', '2026-09-15', [['i-7', 2]]),
  makeExam('exam-3', '2026-10-01', [['i-7', 2]]),
  makeExam('exam-4', '2026-10-15', [['i-7', 0]])
];
taged[0].answers[0].errorTagIds = ['t-jiaodu'];
taged[1].answers[0].errorTagIds = ['t-jiaodu'];
taged[2].answers[0].errorTagIds = ['t-yuanwen'];
taged[3].answers[0].errorTagIds = ['t-jiaodu', 't-yuanwen'];
const stats = C.tagStats(taged, {});
const jiaodu = stats.find((s) => s.id === 't-jiaodu');
check('错因总次数统计', jiaodu && jiaodu.count === 3, JSON.stringify(jiaodu));
check('错因趋势：最近两次 1 次', jiaodu && jiaodu.recent === 1, JSON.stringify(jiaodu));
check('错因趋势：前两次 2 次', jiaodu && jiaodu.prev === 2, JSON.stringify(jiaodu));
check('错因按次数降序', stats[0].count >= stats[stats.length - 1].count);

// 空数据
check('空考试列表不出错', C.sortExams([]).length === 0 && C.recent([], 3).length === 0);
check('全 0 满分不产生 NaN', C.totals({ answers: [{ fullScore: 0, gotScore: 0, dimension: 'jilei' }] }, {}).rate === null);

console.log('\n[3] 静态资源引用');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = [];
html.replace(/(?:src|href)="([^"]+)"/g, (m, p1) => { refs.push(p1); return m; });
const localRefs = refs.filter((r) => !/^(https?:|data:|#)/.test(r));
localRefs.forEach((r) => {
  const clean = r.replace(/^\.\//, '');
  check('引用存在：' + r, fs.existsSync(path.join(ROOT, clean)));
});
check('没有以 / 开头的绝对路径', !localRefs.some((r) => r.startsWith('/')));
check('没有 CDN 外链', !refs.some((r) => /^https?:/.test(r)), refs.filter((r) => /^https?:/.test(r)).join(','));

const manifest = readJSON('manifest.json');
check('manifest 有 192 图标', manifest.icons.some((i) => i.sizes === '192x192'));
check('manifest 有 512 图标', manifest.icons.some((i) => i.sizes === '512x512'));
check('manifest display=standalone', manifest.display === 'standalone');
check('manifest start_url 是相对路径', !manifest.start_url.startsWith('/'));
manifest.icons.forEach((i) => {
  check('图标文件存在：' + i.src, fs.existsSync(path.join(ROOT, i.src.replace(/^\.\//, ''))));
});

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('SW 预缓存列表里的文件都存在', (() => {
  const m = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!m) return false;
  const list = m[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
  const missing = list.filter((p) => {
    const clean = p.replace(/^\.\//, '');
    if (clean === '') return false;
    return !fs.existsSync(path.join(ROOT, clean));
  });
  if (missing.length) console.log('    缺失：' + missing.join(', '));
  return missing.length === 0;
})());
check('SW 不含绝对路径资源', !/'\/(?!\/)/.test((sw.match(/const ASSETS = \[([\s\S]*?)\];/) || ['', ''])[1].replace(/\/\//g, '')));

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
check('CSS 无外链 url(http)', !/url\(\s*['"]?https?:/.test(css));

const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
check('js 文件数 >= 10', jsFiles.length >= 10, String(jsFiles.length));
check('closure 计数（window.YW 挂载）', jsFiles.every((f) => {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  return src.includes('window.YW');
}));

console.log('\n[4] 关键实现点');
const entry = fs.readFileSync(path.join(ROOT, 'js/page-entry.js'), 'utf8');
check('录入页有 inputmode=decimal', entry.includes("inputmode: 'decimal'"));
check('录入页默认填满分', entry.includes('got: Number(entry.item.fullScore)'));
check('保存时写 templateSnapshot', entry.includes('templateSnapshot: YW.clone(tpl)'));
check('超分拦截', entry.includes('r.got > r.fullScore') && entry.includes('invalidRows'));

const analysis = fs.readFileSync(path.join(ROOT, 'js/page-analysis.js'), 'utf8');
check('分析页有排除作文开关', analysis.includes('excludeEssay'));
check('四张图都渲染', ['trend', 'radar', 'heat', 'bars'].every((k) => analysis.includes('YW.charts.' + k)));
check('作文档位图', analysis.includes('YW.charts.levels'));

const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
check('备份导出文件名带日期', ui.includes("'语文数据-备份-' + YW.todayISO()"));
check('导入按 id 去重', ui.includes('s.exams.some(function (x) { return x.id === e.id; })'));
check('14 天未备份提醒', ui.includes('days >= 14'));

const dbjs = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
check('主数据用 IndexedDB', dbjs.includes('indexedDB.open') && !dbjs.includes('localStorage'));
check('存储降级有明确标记', dbjs.includes('degraded'));

console.log('\n============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('\n失败项：'); failures.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }