/* 自测脚本：node tests/selftest.js
   纯逻辑与静态资源，不涉及界面交互
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

// calc.js 会用 util.js 的 YW.uid，测试里补一个
sandbox.uid = (p) => (p || 'id') + '-' + Math.random().toString(36).slice(2, 9);

const tagDoc = readJSON('error-tags.json');
sandbox.state = { tagGroups: tagDoc.groups };

console.log('\n[1] 数据文件');
const tplDoc = readJSON('exam-templates.json');
check('exam-templates.json schemaVersion=2', tplDoc.schemaVersion === 2);
check('error-tags.json schemaVersion=2', tagDoc.schemaVersion === 2);

const tpl = tplDoc.templates[0];
const v = C.validateTemplate(tpl);
check('模板结构校验通过', v.ok, v.errors && v.errors.join('；'));
check('模板小题满分合计 = totalScore(120)', v.sum === tpl.totalScore, '实际 ' + v.sum);
check('模板有 subject 字段', tpl.subject === '语文', tpl.subject);
check('模板名是 地区-学段-科目 格式', /^西安-初中-语文$/.test(tpl.name), tpl.name);

const dims = {};
C.templateItems(tpl).forEach((e) => {
  dims[e.item.dimension] = (dims[e.item.dimension] || 0) + e.item.fullScore;
});
check('维度统计：积累和运用 21 分', dims.jilei === 21, String(dims.jilei));
check('卷一（积累 21 + 名著 3）= 24 分', dims.jilei + dims.mingzhu === 24);
check('阅读合计 46 分', dims.xiandai + dims.wenyan + dims.gushi === 46);
check('题号 1-21 连续', C.templateItems(tpl).length === 21 && C.templateItems(tpl)[20].item.no === '21');

const dv = C.validateTags(tagDoc);
check('错因词表校验通过', dv.ok, dv.errors && dv.errors.join('；'));
check('错因标签数量 = 54', tagDoc.groups.reduce((a, g) => a + g.tags.length, 0) === 54);
check('每个错因分组都有 subject', tagDoc.groups.every((g) => !!g.subject));
check('错因分组按科目取：语文 8 组', C.tagGroupsFor(tpl, tagDoc.groups).length === 8);
check('标签 id 唯一', (() => {
  const ids = new Set(); let dup = false;
  tagDoc.groups.forEach((g) => g.tags.forEach((t) => { if (ids.has(t.id)) dup = true; ids.add(t.id); }));
  return !dup;
})());

console.log('\n[2] 计算规则');

function makeExam(id, date, pairs, extra) {
  return Object.assign({
    id, date, name: '测试' + id,
    studentId: 'stu-a',
    templateId: tpl.id,
    templateSnapshot: JSON.parse(JSON.stringify(tpl)),
    answers: pairs.map(([itemId, got]) => {
      const e = C.templateItems(tpl).find((x) => x.item.id === itemId);
      return {
        itemId, no: e.item.no, dimension: e.item.dimension,
        fullScore: e.item.fullScore, gotScore: got, errorTagIds: [], note: ''
      };
    }),
    essayLevel: null,
    paperImageIds: [],
    createdAt: Date.now()
  }, extra || {});
}

const weighted = makeExam('exam-t', '2026-10-01', [
  ['i-1', 0],
  ['i-11', 3], ['i-12', 6]
]);
const t1 = C.totals(weighted, {});
check('得分率按满分加权（9/11）', Math.abs(t1.rate - 9/11) < 1e-9, String(t1.rate));
const naive = (0 / 2 + 9 / 9) / 2;
check('不是简单平均', Math.abs(t1.rate - naive) > 1e-6, 'naive=' + naive);

const full = makeExam('exam-full', '2026-10-10', C.templateItems(tpl).map((e) => [e.item.id, e.item.fullScore]));
check('满分卷 = 120/120 = 100%', C.totals(full, {}).got === 120 && C.totals(full, {}).rate === 1);
check('排除作文后满分 70', C.totals(full, { excludeEssay: true }).full === 70);

const essay41 = makeExam('exam-e', '2026-10-15', [['i-21', 41]]);
check('作文 41/50 折算二类', C.essayLevelOf(essay41) === 2);
check('作文 29/50 折算五类', C.essayLevelOf(makeExam('exam-e2', '2026-10-16', [['i-21', 29]])) === 5);
check('手动档位优先', C.essayLevelOf(Object.assign({}, essay41, { essayLevel: 1 })) === 1);

// 快照隔离
const hist = makeExam('exam-snap', '2026-09-01', [['i-1', 1]]);
const before = C.totals(hist, {}).full;
const edited = JSON.parse(JSON.stringify(tpl));
C.templateItems(edited).find((e) => e.item.id === 'i-1').item.fullScore = 10;
check('改当前模板后，历史满分不变', before === C.totals(hist, {}).full && before === 2);

console.log('\n[3] 学生与模板隔离');
const exams = [
  makeExam('exam-a1', '2026-09-01', [['i-1', 2]], { studentId: 'stu-a', createdAt: 300 }),
  makeExam('exam-a2', '2026-10-01', [['i-1', 1]], { studentId: 'stu-a', createdAt: 500 }),
  makeExam('exam-b1', '2026-09-15', [['i-1', 0]], { studentId: 'stu-b', createdAt: 400 }),
  makeExam('exam-a3', '2026-09-20', [['i-1', 2]], { studentId: 'stu-a', templateId: 'tpl-en', createdAt: 900 })
];
check('按学生过滤：A 有 3 次', C.byStudent(exams, 'stu-a').length === 3);
check('按学生过滤：B 有 1 次', C.byStudent(exams, 'stu-b').length === 1);
check('学生 A + 语文模板 = 2 次', C.byTemplate(C.byStudent(exams, 'stu-a'), tpl.id).length === 2);
check('学生 A 的英语不会混进语文', C.byTemplate(C.byStudent(exams, 'stu-a'), 'tpl-en').length === 1);
check('学生 B 的语文和 A 的语文互不影响',
  C.byTemplate(C.byStudent(exams, 'stu-b'), tpl.id).length === 1);
check('学生用过哪些模板按最近使用排序',
  JSON.stringify(C.templatesOfStudent(exams, 'stu-a')) === JSON.stringify(['tpl-en', tpl.id]),
  JSON.stringify(C.templatesOfStudent(exams, 'stu-a')));

check('科目默认语文', C.subjectOf({}) === '语文');
check('科目按 subject 取', C.subjectOf({ subject: '英语' }) === '英语');
check('subjectsOf 去重', C.subjectsOf([{ subject: '语文' }, { subject: '语文' }, { subject: '英语' }]).length === 2);

// 英语词表不串到语文
const mixedTags = tagDoc.groups.concat([
  { id: 'g-en', subject: '英语', name: '语法', tags: [{ id: 't-en1', name: '时态错' }] }
]);
check('语文模板只拿到语文的 8 组', C.tagGroupsFor({ subject: '语文' }, mixedTags).length === 8);
check('英语模板只拿到英语的 1 组', C.tagGroupsFor({ subject: '英语' }, mixedTags).length === 1);

console.log('\n[4] 自动错题');
const examForMistake = makeExam('exam-m', '2026-10-20', [
  ['i-1', 0], ['i-2', 2], ['i-11', 1]
]);
const plan1 = C.buildMistakes(examForMistake, [], tpl);
check('失分题生成错题：2 条', plan1.create.length === 2, String(plan1.create.length));
check('满分题不生成', !plan1.create.some((m) => m.itemId === 'i-2'));
check('错题带 examId 和 itemId', plan1.create.every((m) => m.examId === 'exam-m' && m.itemId));
check('错题带题号和考什么', plan1.create.some((m) => m.no === '11' && m.label === '情节内容梳理'));
check('错题带学生 id', plan1.create.every((m) => m.studentId === 'stu-a'));

// 第二次跑：已有记录，不重复创建
const existing = plan1.create.slice();
const plan2 = C.buildMistakes(examForMistake, existing, tpl);
check('重复保存不会重复生成', plan2.create.length === 0, String(plan2.create.length));

// 改成满分：标记 resolved，不删手写内容
const fixed = JSON.parse(JSON.stringify(examForMistake));
fixed.answers[0].gotScore = 2;
const plan3 = C.buildMistakes(fixed, existing, tpl);
check('改满分后标记 resolved', plan3.resolve.length === 1, String(plan3.resolve.length));
check('resolved 是标记不是删除', plan3.resolve[0].id === existing[0].id);

// 改了错因标签再保存：已有错题要同步标签，不能停在旧标签上
const tagged = JSON.parse(JSON.stringify(examForMistake));
tagged.answers[0].errorTagIds = ['t-yinxing', 't-cuxin'];
const plan4 = C.buildMistakes(tagged, existing, tpl);
check('改错因后同步到已有错题', plan4.update.length === 1, String(plan4.update.length));
check('同步的是新标签', JSON.stringify(plan4.update[0].errorTagIds) === JSON.stringify(['t-yinxing', 't-cuxin']),
  JSON.stringify(plan4.update[0].errorTagIds));
check('标签没变就不重复写库', C.buildMistakes(examForMistake, existing, tpl).update.length === 0);

console.log('\n[5] 排序与空数据');
const list = [
  makeExam('exam-c', '2026-11-05', [['i-1', 2]]),
  makeExam('exam-a', '2026-09-10', [['i-1', 2]]),
  makeExam('exam-b', '2026-10-15', [['i-1', 2]])
];
check('按日期升序', JSON.stringify(C.sortExams(list).map((e) => e.id)) === JSON.stringify(['exam-a', 'exam-b', 'exam-c']));
check('最近 2 次', JSON.stringify(C.recent(list, 2).map((e) => e.id)) === JSON.stringify(['exam-b', 'exam-c']));
check('空列表不报错', C.sortExams([]).length === 0 && C.byStudent([], 'x').length === 0);
check('全 0 满分不产生 NaN', C.totals({ answers: [{ fullScore: 0, gotScore: 0, dimension: 'jilei' }] }, {}).rate === null);

console.log('\n[6] 静态资源');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const refs = [];
html.replace(/(?:src|href)="([^"]+)"/g, (m, p1) => { refs.push(p1); return m; });
const localRefs = refs.filter((r) => !/^(https?:|data:|#)/.test(r));
localRefs.forEach((r) => {
  check('引用存在：' + r, fs.existsSync(path.join(ROOT, r.replace(/^\.\//, ''))));
});
check('没有以 / 开头的绝对路径', !localRefs.some((r) => r.startsWith('/')));
check('没有 CDN 外链', !refs.some((r) => /^https?:/.test(r)));

const manifest = readJSON('manifest.json');
check('manifest 有 192 图标', manifest.icons.some((i) => i.sizes === '192x192'));
check('manifest 有 512 图标', manifest.icons.some((i) => i.sizes === '512x512'));
check('manifest display=standalone', manifest.display === 'standalone');
manifest.icons.forEach((i) => {
  check('图标存在：' + i.src, fs.existsSync(path.join(ROOT, i.src.replace(/^\.\//, ''))));
});

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
check('SW 预缓存文件都存在', (() => {
  const m = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
  if (!m) return false;
  const list = m[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
  const missing = list.filter((p) => {
    const clean = p.replace(/^\.\//, '');
    return clean !== '' && !fs.existsSync(path.join(ROOT, clean));
  });
  if (missing.length) console.log('    缺失：' + missing.join(', '));
  return missing.length === 0;
})());

console.log('\n[7] 关键实现点');
const entry = fs.readFileSync(path.join(ROOT, 'js/page-entry.js'), 'utf8');
check('录入页有 inputmode=decimal', entry.includes("inputmode: 'decimal'"));
check('录入页默认填满分', entry.includes('got: Number(entry.item.fullScore)'));
check('保存时写 templateSnapshot', entry.includes('templateSnapshot: YW.clone(tpl)'));
check('保存时写 studentId', entry.includes('studentId: student.id'));
check('保存时写 paperImageIds 数组', entry.includes('paperImageIds: st.photoIds.slice()'));
check('多图上传 multiple', html.includes('id="entry-photo-input"') && html.includes('multiple'));
check('保存时自动生成错题', entry.includes('C.buildMistakes'));
check('超分拦截', entry.includes('r.got > r.fullScore') && entry.includes('invalidRows'));
check('错因面板按科目过滤', entry.includes('C.tagGroupsFor'));

const analysis = fs.readFileSync(path.join(ROOT, 'js/page-analysis.js'), 'utf8');
check('分析页按学生+模板过滤', analysis.includes('C.byStudent') && analysis.includes('C.byTemplate'));
check('分析页有模板选择器', html.includes('id="analysis-template"'));
check('四张图都渲染', ['trend', 'radar', 'heat', 'bars'].every((k) => analysis.includes('YW.charts.' + k)));
check('作文档位图', analysis.includes('YW.charts.levels'));

const settings = fs.readFileSync(path.join(ROOT, 'js/page-settings.js'), 'utf8');
check('设置页能可视化新建模板', settings.includes('openTemplateForm'));
check('设置页能可视化编辑错因', settings.includes('openTagForm'));
check('设置页有学生管理', settings.includes('renderStudents') && settings.includes('confirmDeleteStudent'));
check('模板编辑器能加题', settings.includes("'+ 加一道题'"));
check('模板编辑器能加部分', settings.includes("'+ 加一个部分'"));

const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
check('备份导出文件名带日期', ui.includes("'语文数据-备份-' + YW.todayISO()"));
check('备份含学生表', ui.includes('students: s.students'));
check('导入按 id 去重', ui.includes('s.exams.some(function (x) { return x.id === e.id; })'));
check('14 天未备份提醒', ui.includes('days >= 14'));
check('有学生切换器', ui.includes('switchStudent') && html.includes('id="student-bar"'));

const dbjs = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
check('主数据用 IndexedDB', dbjs.includes('indexedDB.open') && !dbjs.includes('localStorage'));
check('有 students 表', dbjs.includes("'students'"));
check('DB 版本升到 2', dbjs.includes('DB_VER = 2'));

const boot = fs.readFileSync(path.join(ROOT, 'js/boot.js'), 'utf8');
check('启动时迁移单图到多图', boot.includes('paperImageIds'));
check('启动时补 studentId', boot.includes('e.studentId = defaultId'));
check('兼容 v1 词表（补 subject）', boot.includes("g.subject || '语文'"));

console.log('\n============================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail) { console.log('\n失败项：'); failures.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }