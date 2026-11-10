/* 端到端：jsdom + fake-indexeddb，真实加载 index.html 跑一遍主要流程
   node tests/e2e.js
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
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
async function waitFor(fn, timeout = 3000, step = 25) {
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

  const dom = new JSDOM(html, {
    url: 'http://localhost/app/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const win = dom.window;

  win.indexedDB = new FDBFactory();
  win.IDBKeyRange = FDBKeyRange;
  win.HTMLElement.prototype.scrollIntoView = function () {};
  win.scrollTo = function () {};

  // fetch：默认从仓库根读文件（模拟 GitHub Pages）
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

  const order = [
    'util.js', 'db.js', 'calc.js', 'charts.js', 'photos.js', 'ui.js',
    'fallback.js', 'page-entry.js', 'page-analysis.js', 'page-detail.js',
    'page-settings.js', 'boot.js'
  ];
  order.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    win.eval(src);
  });

  return { dom, win };
}

function setInput(win, input, value) {
  input.value = value;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
}

(async () => {
  console.log('\n[E2E] 启动（fetch 正常，模拟部署在 Pages）');
  const { dom, win } = buildDom();
  const YW = win.YW;

  const booted = await waitFor(() => win.document.querySelectorAll('#entry-items .item-row').length > 0, 8000);
  check('启动完成，模板已载入', booted, 'templates=' + (YW.state.templates || []).length);
  check('模板来自 exam-templates.json（总分 120）', YW.state.templates[0].totalScore === 120);
  check('错因词表已载入（7 组）', YW.state.tagGroups.length === 7, String(YW.state.tagGroups.length));
  check('页签渲染正常：三个页面只有一个可见', (() => {
    const pages = [...win.document.querySelectorAll('.page')];
    const visible = pages.filter((p) => !p.hidden);
    return visible.length === 1 && visible[0].dataset.page === 'entry';
  })(), win.document.querySelectorAll('.page').length + ' pages');
  check('IndexedDB 可用（未降级）', YW.db.isDegraded() === false);

  console.log('\n[E2E] 录入页');
  const rows = [...win.document.querySelectorAll('#entry-items .item-row')];
  const tplItems = YW.calc.templateItems(YW.state.templates[0]);
  check('题目行数 = 模板小题数', rows.length === tplItems.length, rows.length + ' vs ' + tplItems.length);
  check('每行都有得分输入框且默认满分', (() => {
    const inputs = [...win.document.querySelectorAll('#entry-items .score-input')];
    return inputs.length === tplItems.length &&
      inputs.every((inp, i) => inp.value === YW.fmt(tplItems[i].item.fullScore));
  })());
  check('输入框是 inputmode=decimal', win.document.querySelector('.score-input').getAttribute('inputmode') === 'decimal');
  check('初始总分显示 120/120', win.document.querySelector('#live-total').textContent === '120' &&
    win.document.querySelector('#live-full').textContent === '/120');
  check('初始得分率 100.0%', win.document.querySelector('#live-rate').textContent === '100.0%');

  // 改一道题的分
  const firstInput = win.document.querySelector('#entry-items .score-input');
  setInput(win, firstInput, '0');
  check('改一道题为 0 分后总分 118', win.document.querySelector('#live-total').textContent === '118',
    win.document.querySelector('#live-total').textContent);
  check('得分率同步更新', win.document.querySelector('#live-rate').textContent === '98.3%',
    win.document.querySelector('#live-rate').textContent);

  // 超分
  setInput(win, firstInput, '5');
  check('超分时输入框标红', firstInput.classList.contains('invalid'));
  check('超分时顶部出现警告', !win.document.querySelector('#live-warn').hidden);

  const examCountBefore = YW.state.exams.length;
  win.document.querySelector('#entry-save').click();
  await sleep(400);
  check('超分点保存被拦下，没写库', YW.state.exams.length === examCountBefore, 'exams=' + YW.state.exams.length);
  check('拦下时给了提示文案', win.document.querySelector('#toast').textContent.includes('超过满分'));

  // 改回 0，先标错因，再保存
  setInput(win, firstInput, '0');

  console.log('\n[E2E] 错因面板');
  win.document.querySelector('#entry-items .tag-btn').click();
  await sleep(80);
  check('错因抽屉打开', !win.document.querySelector('#sheet-backdrop').hidden);
  const chips = [...win.document.querySelectorAll('.tag-chip')];
  check('标签按分组全部渲染', chips.length === 34, String(chips.length));
  chips[0].click();
  win.document.querySelector('.sheet-foot .btn.primary').click();
  await sleep(60);
  check('选中标签后行内显示标签名', win.document.querySelector('#entry-items .tag-pill') !== null);

  win.document.querySelector('#entry-name').value = '初一期中考试';
  win.document.querySelector('#entry-save').click();
  const saved = await waitFor(() => YW.state.exams.length === 1, 3000);
  check('正常保存写入一条考试', saved, 'exams=' + YW.state.exams.length);

  const exam = YW.state.exams[0];
  check('记录 id 形如 exam-日期', /^exam-\d{4}-\d{2}-\d{2}$/.test(exam.id), exam.id);
  check('记录带完整 templateSnapshot', !!exam.templateSnapshot && exam.templateSnapshot.sections.length === 6);
  check('templateSnapshot 是深拷贝（非同一引用）', exam.templateSnapshot !== YW.state.templates[0]);
  check('逐题答案数与模板小题数一致', exam.answers.length === tplItems.length, String(exam.answers.length));
  const t = YW.calc.totals(exam, {});
  check('首次录入总分 118（2 分题拿了 0）', t.got === 118, String(t.got));
  check('answers 字段名符合约定', exam.answers[0].itemId && exam.answers[0].dimension &&
    'fullScore' in exam.answers[0] && 'gotScore' in exam.answers[0] && Array.isArray(exam.answers[0].errorTagIds));

  console.log('\n[E2E] 分析页');
  win.document.querySelector('.tab[data-go="analysis"]').click();
  await sleep(200);
  check('分析页可见', !win.document.querySelector('#page-analysis').hidden);
  check('趋势图渲染出 SVG', win.document.querySelector('#chart-trend svg') !== null);
  check('雷达图渲染出 SVG', win.document.querySelector('#chart-radar svg') !== null);
  check('热力图有数值格子', (win.document.querySelector('#chart-heat svg').querySelectorAll('text').length || 0) > 3);
  check('错因排行有 SVG', win.document.querySelector('#chart-tags svg') !== null);
  check('作文档位图有 SVG', win.document.querySelector('#chart-level svg') !== null);
  check('雷达图图例可点', win.document.querySelectorAll('#radar-legend .legend-item').length >= 1);

  const stripBefore = win.document.querySelector('#analysis-strip').textContent;
  win.document.querySelector('#seg-essay .seg-btn[data-exclude="1"]').click();
  await sleep(200);
  const stripAfter = win.document.querySelector('#analysis-strip').textContent;
  check('排除作文后统计条数值变化', stripBefore !== stripAfter);
  check('排除作文后满分变 70', YW.calc.totals(YW.state.exams[0], { excludeEssay: true }).full === 70);

  // 只统计最近 N 次：只有 1 次考试时选最近 3 次也不该崩
  win.document.querySelector('#range-select').value = '3';
  win.document.querySelector('#range-select').dispatchEvent(new win.Event('change'));
  await sleep(150);
  check('最近 3 次筛选不报错', win.document.querySelector('#chart-trend svg') !== null);

  // 维度筛选
  win.document.querySelector('#trend-dim').value = 'wenyan';
  win.document.querySelector('#trend-dim').dispatchEvent(new win.Event('change'));
  await sleep(150);
  check('按维度看趋势不报错', win.document.querySelector('#chart-trend svg') !== null);

  console.log('\n[E2E] 快照隔离');
  // 模拟外部改模板：i-1 改成 3 分
  const edited = JSON.parse(JSON.stringify(YW.state.templates[0]));
  edited.sections[0].items[0].fullScore = 3;
  YW.state.templates[0] = edited;
  win.document.querySelector('#entry-template').dispatchEvent(new win.Event('change'));
  const historyTotal = YW.calc.totals(YW.state.exams[0], {});
  check('改当前模板后，历史记录统计不变', historyTotal.full === 120, String(historyTotal.full));
  check('历史记录仍读自己的快照', YW.state.exams[0].templateSnapshot.sections[0].items[0].fullScore === 2);

  console.log('\n[E2E] 备份导入去重');
  const backup = {
    schemaVersion: 1,
    exams: [YW.state.exams[0], {
      id: 'exam-2026-12-01', date: '2026-12-01', name: '外来一次',
      templateId: 'tpl-xa-g7-120', templateSnapshot: YW.state.templates[0],
      answers: [{ itemId: 'i-1', no: '1', dimension: 'jilei', fullScore: 3, gotScore: 3, errorTagIds: [], note: '' }],
      essayLevel: null, paperImageId: null, createdAt: 1
    }],
    templates: [YW.state.templates[0]],
    tagGroups: YW.state.tagGroups,
    mistakes: []
  };
  await YW.ui.importAll(JSON.stringify(backup));
  await sleep(300);
  check('同 id 的考试没被重复插入', YW.state.exams.filter((e) => e.id === exam.id).length === 1);
  check('新 id 的考试被加进来', YW.state.exams.some((e) => e.id === 'exam-2026-12-01'), String(YW.state.exams.length));
  check('同 id 的模板没被重复插入', YW.state.templates.length === 1, String(YW.state.templates.length));

  console.log('\n[E2E] 空状态');
  // 删掉所有考试，看图表是否给空状态而不是白屏 / 报错
  await YW.db.clear('exams');
  YW.state.exams = [];
  YW.analysis.render();
  await sleep(200);
  check('无数据时趋势图给空状态提示', !!win.document.querySelector('#chart-trend .empty'));
  check('无数据时热力图给空状态提示', !!win.document.querySelector('#chart-heat .empty'));
  check('无数据时雷达图给空状态提示', !!win.document.querySelector('#chart-radar .empty'));
  check('无数据时错因图给空状态提示', !!win.document.querySelector('#chart-tags .empty'));
  check('无数据时不抛异常（页面仍可用）', !win.document.querySelector('#page-analysis').hidden);

  console.log('\n[E2E] file:// 模拟（fetch 失败）');
  const dom2 = buildDom({ fetchFail: true });
  const win2 = dom2.win;
  await waitFor(() => win2.document.querySelectorAll('#entry-items .item-row').length > 0, 8000);
  check('fetch 失败时用内置兜底模板', win2.YW.state.templates.length === 1 && win2.YW.state.templates[0].totalScore === 120);
  check('fetch 失败时给明确提示条，不静默', !win2.document.querySelector('#banner').hidden);
  check('提示条文案说清了原因', win2.document.querySelector('#banner-text').textContent.length > 10);
  check('兜底后仍能渲染题目行', win2.document.querySelectorAll('#entry-items .item-row').length > 10);

  console.log('\n============================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  if (fail) { console.log('\n失败项：'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exitCode = fail ? 1 : 0;
})();