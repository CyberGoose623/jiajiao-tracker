/* 端到端：jsdom + fake-indexeddb，真实加载 index.html 跑一遍主要流程
   node tests/e2e.js
*/
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
const FDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ❌ ' + name + (detail ? ' → ' + detail : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 4000, step = 25) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (fn()) return true; } catch (e) {}
    await sleep(step);
  }
  return false;
}

function buildDom(opts = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script src="[^"]+"><\/script>/g, '');

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => console.log('  [jsdomError]', e.message));

  const dom = new JSDOM(html, {
    url: 'http://localhost/app/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc
  });
  const win = dom.window;

  win.indexedDB = new FDBFactory();
  win.IDBKeyRange = FDBKeyRange;
  win.HTMLElement.prototype.scrollIntoView = function () {};
  win.scrollTo = function () {};

  let objCount = 0;
  win.URL.createObjectURL = function () { objCount++; return 'blob:fake/' + objCount; };
  win.URL.revokeObjectURL = function () {};

  win.fetch = function (p) {
    if (opts.fetchFail) return Promise.reject(new TypeError('Failed to fetch'));
    const clean = String(p).replace(/^\.\//, '').split('?')[0];
    const file = path.join(ROOT, clean);
    return new Promise((resolve, reject) => {
      fs.readFile(file, 'utf8', (err, txt) => {
        if (err) { reject(new Error('404 ' + p)); return; }
        resolve({ ok: true, status: 200, text: () => Promise.resolve(txt) });
      });
    });
  };

  ['util.js', 'db.js', 'calc.js', 'charts.js', 'photos.js', 'ui.js',
   'fallback.js', 'page-entry.js', 'page-analysis.js', 'page-detail.js',
   'page-settings.js', 'boot.js'].forEach((f) => {
    win.eval(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'));
  });

  return { dom, win };
}

function setInput(win, input, value) {
  input.value = value;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}

(async () => {
  console.log('\n[E2E] 启动');
  const { dom, win } = buildDom();
  const YW = win.YW;

  const booted = await waitFor(() => win.document.querySelectorAll('#entry-items .item-row').length > 0, 8000);
  check('启动完成，题目行已渲染', booted);
  check('模板来自 exam-templates.json（120 分）', YW.state.templates[0].totalScore === 120);
  check('模板科目是语文', YW.state.templates[0].subject === '语文');
  check('错因词表 7 组 34 个标签', YW.state.tagGroups.length === 7 &&
    YW.state.tagGroups.reduce((a, g) => a + g.tags.length, 0) === 34);
  check('首次启动自动建了一个学生', YW.state.students.length === 1, String(YW.state.students.length));
  check('默认学生被选中', YW.state.currentStudentId === YW.state.students[0].id);
  check('顶部学生条显示名字', win.document.querySelector('#student-bar-name').textContent === YW.state.students[0].name);
  check('IndexedDB 可用', YW.db.isDegraded() === false);

  console.log('\n[E2E] 录入 + 自动错题');
  const rows = [...win.document.querySelectorAll('#entry-items .item-row')];
  check('题目行数 = 22', rows.length === 22, String(rows.length));
  check('默认全部满分', win.document.querySelector('#live-total').textContent === '120');

  const inputs = [...win.document.querySelectorAll('#entry-items .score-input')];
  // 第 1 题（2 分）拿 0；第 7 题（记叙文 4 分）拿 2
  setInput(win, inputs[0], '0');
  const i7 = [...win.document.querySelectorAll('#entry-items .item-row')]
    .findIndex((r) => r.querySelector('.item-no').textContent === '7');
  setInput(win, inputs[i7], '2');
  check('两道失分后总分 116', win.document.querySelector('#live-total').textContent === '116',
    win.document.querySelector('#live-total').textContent);

  win.document.querySelector('#entry-name').value = '初一期中考试';
  win.document.querySelector('#entry-save').click();
  const saved = await waitFor(() => YW.state.exams.length === 1, 4000);
  check('保存成功', saved);

  const exam = YW.state.exams[0];
  check('考试挂了学生 id', exam.studentId === YW.state.students[0].id, String(exam.studentId));
  check('试卷图是数组（这次为空）', Array.isArray(exam.paperImageIds) && exam.paperImageIds.length === 0);
  check('模板快照是深拷贝', exam.templateSnapshot && exam.templateSnapshot !== YW.state.templates[0]);
  check('总分 116', YW.calc.totals(exam, {}).got === 116, String(YW.calc.totals(exam, {}).got));

  const mistakes = YW.state.mistakes.filter((m) => m.examId === exam.id);
  check('失分题自动生成错题 2 条', mistakes.length === 2, String(mistakes.length));
  check('错题带学生 id', mistakes.every((m) => m.studentId === exam.studentId));
  check('错题能定位到哪道题', mistakes.every((m) => m.itemId && m.no));
  check('错题带考什么标签', mistakes.some((m) => m.label === '概括情节'));
  check('满分题没进错题本', !mistakes.some((m) => m.itemId === 'i-2'));
  check('错题默认未掌握未订正', mistakes.every((m) => m.mastered === false && m.resolved === false));

  console.log('\n[E2E] 错因面板按科目过滤');
  win.document.querySelectorAll('#entry-items .tag-btn')[0].click();
  await sleep(100);
  const chips = [...win.document.querySelectorAll('.tag-chip')];
  check('语文模板只显示语文的 34 个标签', chips.length === 34, String(chips.length));
  chips[0].click();
  win.document.querySelector('.sheet-foot .btn.primary').click();
  await sleep(60);
  // 直接给这次考试挂一个错因，让错因排行有数据（不再重复保存，避免多出第二条记录）
  const firstExam = YW.state.exams[0];
  firstExam.answers[0].errorTagIds = ['t-yinxing'];
  await YW.db.put('exams', firstExam);
  YW.analysis.render();
  await sleep(150);

  console.log('\n[E2E] 多图');
  check('照片区有缩略图容器', !!win.document.querySelector('#entry-photo-list'));
  check('文件输入支持多选', win.document.querySelector('#entry-photo-input').hasAttribute('multiple'));
  check('空态提示可以挂多张', win.document.querySelector('#entry-photo-hint').textContent.includes('多张'));
  check('详情页按数组取图', fs.readFileSync(path.join(ROOT, 'js/page-detail.js'), 'utf8').includes('paperImageIds'));

  console.log('\n[E2E] 分析页（按模板过滤）');
  win.document.querySelector('.tab[data-go="analysis"]').click();
  await sleep(250);
  check('分析页可见', !win.document.querySelector('#page-analysis').hidden);
  check('分析页有模板选择器', !!win.document.querySelector('#analysis-template'));
  check('分析页标题显示学生和模板', win.document.querySelector('#analysis-scope').textContent.includes('西安-初中-语文'),
    win.document.querySelector('#analysis-scope').textContent);
  check('趋势图出 SVG', win.document.querySelector('#chart-trend svg') !== null);
  check('雷达图出 SVG', win.document.querySelector('#chart-radar svg') !== null);
  check('热力图有数值', (win.document.querySelector('#chart-heat svg')?.querySelectorAll('text').length || 0) > 3);
  check('错因排行出 SVG', win.document.querySelector('#chart-tags svg') !== null);
  check('作文档位图出 SVG', win.document.querySelector('#chart-level svg') !== null);

  console.log('\n[E2E] 新建学生，统计隔离');
  win.document.querySelector('.tab[data-go="settings"]').click();
  await sleep(200);
  win.document.querySelector('#btn-student-add').click();
  await sleep(120);
  const nameInput = win.document.querySelector('#sheet-body input.control');
  nameInput.value = '小宇';
  win.document.querySelector('.sheet-foot .btn.primary').click();
  await waitFor(() => YW.state.students.length === 2, 3000);
  check('新建学生成功', YW.state.students.length === 2);
  check('自动切到新学生', YW.state.currentStudentId !== exam.studentId);
  check('顶部条跟着换了', win.document.querySelector('#student-bar-name').textContent === '小宇');

  win.document.querySelector('.tab[data-go="analysis"]').click();
  await sleep(250);
  check('新学生没有语文记录，图表给空状态', !!win.document.querySelector('#chart-trend .empty'));
  check('新学生的考试次数是 0', YW.calc.byStudent(YW.state.exams, YW.state.currentStudentId).length === 0);

  // 切回第一个学生，数据还在
  win.YW.ui.switchStudent(exam.studentId);
  await sleep(250);
  check('切回原学生数据还在', win.document.querySelector('#chart-trend svg') !== null);
  check('切回后标题变回原学生', win.document.querySelector('#analysis-scope').textContent.includes(YW.state.students[0].name));

  console.log('\n[E2E] 模板与科目隔离');
  // 造一份英语模板和英语考试，验证两套统计不混
  const enTpl = {
    id: 'tpl-xa-en', name: '西安-初中-英语', subject: '英语', totalScore: 100,
    sections: [{ id: 's-en', name: '一、选择', items: [
      { id: 'e-1', no: '1', fullScore: 10, dimension: 'jilei', type: 'choice', label: '语法' }
    ] }]
  };
  YW.state.templates.push(enTpl);
  YW.state.tagGroups.push({ id: 'g-en', subject: '英语', name: '语法', tags: [{ id: 't-en-1', name: '时态错' }] });
  const enExam = {
    id: 'exam-en-1', date: '2026-11-01', name: '英语单元测', studentId: exam.studentId,
    templateId: 'tpl-xa-en', templateSnapshot: enTpl,
    answers: [{ itemId: 'e-1', no: '1', dimension: 'jilei', fullScore: 10, gotScore: 5, errorTagIds: [], note: '' }],
    essayLevel: null, paperImageIds: [], createdAt: Date.now()
  };
  YW.state.exams.push(enExam);
  await YW.db.put('exams', enExam);
  YW.analysis.render();
  await sleep(200);

  const tplSel = win.document.querySelector('#analysis-template');
  const opt = [...tplSel.options].find((o) => o.value === 'tpl-xa-en');
  check('模板选择器里出现英语模板', !!opt);
  tplSel.value = 'tpl-xa-en';
  tplSel.dispatchEvent(new win.Event('change'));
  await sleep(250);
  check('切到英语模板后，只统计英语那次', win.document.querySelector('#records-count').textContent === '共 1 次',
    win.document.querySelector('#records-count').textContent);
  check('英语得分率 50%', win.document.querySelector('#analysis-strip').textContent.includes('50.0%'));
  check('语文的 116 分没混进来', !win.document.querySelector('#analysis-strip').textContent.includes('116'));

  tplSel.value = 'tpl-xa-g7-yuwen';
  tplSel.dispatchEvent(new win.Event('change'));
  await sleep(250);
  check('切回语文，次数还是 1', win.document.querySelector('#records-count').textContent === '共 1 次');

  console.log('\n[E2E] 表单式模板编辑器');
  win.document.querySelector('#btn-tpl-new').click();
  await sleep(150);
  check('新建模板表单打开', !win.document.querySelector('#sheet-backdrop').hidden);
  check('表单里有科目输入', [...win.document.querySelectorAll('#sheet-body label')].some((l) => l.textContent === '科目'));
  check('表单里有加题按钮', win.document.querySelector('#sheet-body').textContent.includes('+ 加一道题'));
  check('表单里有加部分按钮', win.document.querySelector('#sheet-body').textContent.includes('+ 加一个部分'));
  win.document.querySelector('#sheet-close').click();
  await sleep(80);

  console.log('\n[E2E] 表单式错因编辑器');
  const tagEditBtns = [...win.document.querySelectorAll('#tag-list .mini-btn')];
  check('词表按科目分组显示', win.document.querySelector('#tag-list').textContent.includes('语文'));
  check('词表有编辑入口', tagEditBtns.length > 0);
  tagEditBtns[0].click();
  await sleep(120);
  check('错因编辑表单打开', win.document.querySelector('#sheet-body').textContent.includes('标签'));
  check('表单能加新标签', !!win.document.querySelector('#sheet-body .add-row'));
  win.document.querySelector('#sheet-close').click();
  await sleep(80);

  console.log('\n[E2E] 备份含学生');
  const payload = {};
  check('导出逻辑带上 students', fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8').includes('students: s.students'));
  const before = YW.state.students.length;
  await YW.ui.importAll(JSON.stringify({
    schemaVersion: 2, students: [{ id: 'stu-imported', name: '外来学生', createdAt: 1 }],
    exams: [], templates: [], tagGroups: [], mistakes: []
  }));
  await sleep(250);
  check('导入学生成功', YW.state.students.length === before + 1);

  console.log('\n[E2E] 旧数据迁移');
  const migTpl = JSON.parse(JSON.stringify(YW.state.templates[0]));
  migTpl.id = 'tpl-old-version';
  migTpl.name = '西安市初一语文 120 分卷';
  delete migTpl.subject;
  const oldExam = {
    id: 'exam-old-1', date: '2026-08-01', name: '暑假摸底',
    templateId: 'tpl-old-version', templateSnapshot: migTpl,
    answers: [{ itemId: 'i-1', no: '1', dimension: 'jilei', fullScore: 2, gotScore: 1, errorTagIds: [], note: '' }],
    essayLevel: null, paperImageId: 'img-old-1', createdAt: 1
  };
  const oldMistake = { id: 'err-old-1', examId: 'exam-old-1', itemId: 'i-1', question: 'x', errorTagIds: [], createdAt: 1 };
  const migStudents = [{ id: 'stu-default', name: '学生 1', createdAt: 1 }];
  const migExams = [oldExam];
  const migMistakes = [oldMistake];
  const tplCountBefore = YW.state.templates.length;

  const mig = YW.boot.migrate(migExams, migMistakes, migStudents);
  check('迁移补上 studentId', migExams[0].studentId === 'stu-default');
  check('单图 paperImageId 转成数组', Array.isArray(migExams[0].paperImageIds) &&
    migExams[0].paperImageIds[0] === 'img-old-1', JSON.stringify(migExams[0].paperImageIds));
  check('旧模板按快照补回列表', YW.state.templates.length === tplCountBefore + 1,
    YW.state.templates.length + ' vs ' + tplCountBefore);
  check('补回的模板标注（历史）', YW.state.templates.some((t) => t.id === 'tpl-old-version' && t.name.includes('历史')));
  check('补回的模板有科目', YW.state.templates.filter((t) => t.id === 'tpl-old-version')[0].subject === '语文');
  check('旧考试现在能被分析页选中',
    YW.calc.byTemplate(YW.calc.byStudent(migExams, 'stu-default'), 'tpl-old-version').length === 1);
  check('迁移补上错题的 mastered/resolved', migMistakes[0].mastered === false && migMistakes[0].resolved === false);
  check('迁移幂等：再跑一次不重复补模板', (() => {
    const n = YW.state.templates.length;
    YW.boot.migrate(migExams, migMistakes, migStudents);
    return YW.state.templates.length === n;
  })());

  console.log('\n[E2E] 空状态');
  await YW.db.clear('exams');
  YW.state.exams = [];
  YW.analysis.render();
  await sleep(200);
  check('无数据时趋势图给空状态', !!win.document.querySelector('#chart-trend .empty'));
  check('无数据时热力图给空状态', !!win.document.querySelector('#chart-heat .empty'));
  check('无数据时雷达图给空状态', !!win.document.querySelector('#chart-radar .empty'));
  check('无数据时错因图给空状态', !!win.document.querySelector('#chart-tags .empty'));
  check('无数据不抛异常', !win.document.querySelector('#page-analysis').hidden);

  console.log('\n[E2E] file:// 模拟（fetch 失败）');
  const dom2 = buildDom({ fetchFail: true });
  const win2 = dom2.win;
  await waitFor(() => win2.document.querySelectorAll('#entry-items .item-row').length > 0, 8000);
  check('fetch 失败时用内置兜底模板', win2.YW.state.templates.length === 1 && win2.YW.state.templates[0].totalScore === 120);
  check('兜底模板也带科目', win2.YW.state.templates[0].subject === '语文');
  check('fetch 失败时给明确提示条', !win2.document.querySelector('#banner').hidden);
  check('兜底后能渲染题目行', win2.document.querySelectorAll('#entry-items .item-row').length === 22);
  check('兜底后也有默认学生', win2.YW.state.students.length >= 1);

  console.log('\n============================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail) { console.log('\n失败项：'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exitCode = fail ? 1 : 0;
})();