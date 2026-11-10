/* 静态冒烟：JS 里引用的 DOM id / class 是否真存在
   node tests/smoke.js
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

const ids = new Set();
html.replace(/\sid="([^"]+)"/g, (m, p1) => { ids.add(p1); return m; });

const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && f !== 'fallback.js');

let problems = 0;
function bad(msg) { problems++; console.log('  ❌ ' + msg); }

console.log('\n[1] JS 引用的 id 是否存在于 index.html');
const referenced = new Set();
jsFiles.forEach((f) => {
  const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  const re = /\.\$\('#([A-Za-z0-9_-]+)'\)/g;
  let m;
  while ((m = re.exec(src))) {
    referenced.add(m[1]);
    if (!ids.has(m[1])) bad(f + ' 引用了不存在的 id: #' + m[1]);
  }
  // 也查 getElementById
  const re2 = /getElementById\('([A-Za-z0-9_-]+)'\)/g;
  while ((m = re2.exec(src))) {
    referenced.add(m[1]);
    if (!ids.has(m[1])) bad(f + ' 引用了不存在的 id: #' + m[1]);
  }
});
console.log('  引用 ' + referenced.size + ' 个 id，html 里共 ' + ids.size + ' 个');

console.log('\n[2] 带 id 的元素是否被脚本用到（孤儿 id 只提示）');
[...ids].forEach((id) => {
  if (!referenced.has(id)) console.log('  · 未在 JS 直接引用（可能只做锚点 / label）: #' + id);
});

console.log('\n[3] 关键 class 是否有样式');
const mustHave = [
  '.page', '.page-scroll', '.tabbar', '.tab', '.item-row', '.score-input',
  '.live-bar', '.sheet', '.sheet-backdrop', '.tag-chip', '.chart', '.legend',
  '.tooltip', '.segment', '.seg-btn', '.stat-strip', '.stat-cell', '.exam-row',
  '.dim-line', '.dim-bar', '.empty', '.toast', '.photo-preview', '.backup-line'
];
mustHave.forEach((c) => {
  const esc = c.replace('.', '\\.');
  if (!new RegExp(esc + '[\\s,{:]').test(css)) bad('CSS 缺少 ' + c);
});

console.log('\n[4] 内联 script 顺序');
const scripts = [];
html.replace(/<script src="([^"]+)"><\/script>/g, (m, p1) => { scripts.push(p1); return m; });
const mustOrder = [
  './js/util.js', './js/db.js', './js/calc.js', './js/charts.js', './js/photos.js',
  './js/ui.js', './js/fallback.js', './js/page-entry.js', './js/page-analysis.js',
  './js/page-detail.js', './js/page-settings.js', './js/boot.js'
];
mustOrder.forEach((s) => {
  if (!scripts.includes(s)) bad('index.html 缺少脚本 ' + s);
});
const uiAt = scripts.indexOf('./js/ui.js');
const fbAt = scripts.indexOf('./js/fallback.js');
const bootAt = scripts.indexOf('./js/boot.js');
if (!(uiAt > -1 && fbAt > -1 && bootAt === scripts.length - 1)) bad('脚本顺序不对：boot.js 必须最后');
if (scripts.indexOf('./js/page-entry.js') < fbAt) bad('page-entry.js 应在 fallback.js 之后');

console.log('\n[5] 视口与 iOS 关键设置');
if (!/user-scalable=no/.test(html)) bad('viewport 缺 user-scalable=no');
if (!/viewport-fit=cover/.test(html)) bad('viewport 缺 viewport-fit=cover');
if (!/apple-mobile-web-app-capable/.test(html)) bad('缺 apple-mobile-web-app-capable');
if (!/100dvh/.test(css)) bad('CSS 缺 100dvh');
if (!/touch-action:\s*manipulation/.test(css)) bad('CSS 缺 touch-action: manipulation');
if (!/\.tab\b[\s\S]{0,200}min-height/.test(css)) bad('页签没有最小点击高度');

console.log('\n[6] 禁止项');
const allJs = jsFiles.map((f) => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n');
// localStorage 只允许存主题这类界面偏好，不允许存主数据
const lsLines = allJs.split('\n').filter((line) => line.includes('localStorage'));
const lsBad = lsLines.filter((line) => !/yuwen-theme/.test(line));
if (lsBad.length) bad('localStorage 被用于主数据：' + lsBad[0].trim().slice(0, 60));
if (/localStorage[\s\S]{0,80}(exams|templates|tagGroups|mistakes|students)/.test(allJs)) {
  bad('主数据出现在 localStorage 附近');
}
if (/fetch\(\s*['"]https?:/.test(allJs)) bad('出现外部网络请求');
if (/XMLHttpRequest/.test(allJs)) bad('出现 XHR 请求');
if (/CDN|cdn\./.test(html)) bad('index.html 里出现 CDN 引用');

console.log('\n============================');
console.log(problems ? '发现 ' + problems + ' 个问题' : '冒烟检查通过，0 个问题');
process.exitCode = problems ? 1 : 0;