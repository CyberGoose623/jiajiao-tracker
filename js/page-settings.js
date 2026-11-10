/* 设置页 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var C = YW.calc;

  function render() {
    renderOverview();
    YW.ui.renderBackupLine();
    YW.$('#tpl-count').textContent = '共 ' + YW.state.templates.length + ' 个';
    YW.$('#tag-count').textContent = '共 ' + countTags() + ' 个标签';
    YW.$('#mistake-count').textContent = '共 ' + YW.state.mistakes.length + ' 条';
    YW.$('#about-line').textContent =
      '纯前端 · 无后端 · 数据只在本机（IndexedDB）' +
      (YW.db.isDegraded() ? ' · 当前是内存模式，重启会丢' : '');
  }

  function countTags() {
    return (YW.state.tagGroups || []).reduce(function (a, g) { return a + (g.tags || []).length; }, 0);
  }

  function renderOverview() {
    var host = YW.$('#overview-list');
    if (!host) return;
    var exams = YW.state.exams;
    var newest = C.sortExams(exams).slice(-1)[0];
    var cells = [
      { k: '考试次数', v: String(exams.length) },
      { k: '试卷模板', v: String(YW.state.templates.length) },
      { k: '错因标签', v: String(countTags()) },
      { k: '错题本', v: String(YW.state.mistakes.length) },
      { k: '最近一次', v: newest ? newest.date.slice(5) : '—' }
    ];
    host.innerHTML = cells.map(function (c) {
      return '<li><div class="k">' + YW.escapeHTML(c.k) + '</div><div class="v">' + YW.escapeHTML(c.v) + '</div></li>';
    }).join('');
  }

  /* ---------- JSON 编辑弹层 ---------- */
  function openJsonEditor(title, value, onSave) {
    var ta = YW.el('textarea', { class: 'control', rows: '16', spellcheck: 'false' });
    ta.value = value;
    var errBox = YW.el('p', { class: 'hint', style: 'color:#a8452a' });
    var body = YW.el('div', {}, [ta, errBox]);

    var saveBtn = YW.el('button', {
      type: 'button', class: 'btn primary',
      onclick: function () {
        var parsed;
        try {
          parsed = JSON.parse(ta.value);
        } catch (e) {
          errBox.textContent = 'JSON 格式有问题：' + e.message;
          return;
        }
        var msg = onSave(parsed);
        if (msg) { errBox.textContent = msg; return; }
        YW.ui.closeSheet();
      }
    }, ['保存']);

    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
    YW.ui.openSheet(title, body, [cancel, saveBtn]);
  }

  /* ---------- 模板 ---------- */
  function exportTemplates() {
    var doc = { schemaVersion: 1, templates: YW.state.templates };
    YW.download('exam-templates.json', JSON.stringify(doc, null, 2));
    YW.ui.toast('已导出 exam-templates.json');
  }

  function importTemplates(raw) {
    var doc;
    try { doc = JSON.parse(raw); } catch (e) { YW.ui.toast('不是有效 JSON', 3200); return; }
    var list = Array.isArray(doc) ? doc : doc.templates;
    if (!Array.isArray(list)) { YW.ui.toast('文件里没有 templates 数组', 3200); return; }

    var okList = [];
    var problems = [];
    list.forEach(function (t) {
      var v = C.validateTemplate(t);
      if (v.ok) okList.push(t);
      else problems.push((t && t.name ? t.name : '未命名') + '：' + v.errors.slice(0, 2).join('；'));
    });

    if (!okList.length) {
      YW.ui.toast('模板都不合格：' + problems[0], 5000);
      return;
    }

    // 同 id 覆盖，新 id 追加
    okList.forEach(function (t) {
      var i = YW.state.templates.findIndex(function (x) { return x.id === t.id; });
      if (i >= 0) YW.state.templates[i] = t;
      else YW.state.templates.push(t);
    });

    YW.db.putMany('templates', YW.state.templates).then(function () {
      YW.entry.refresh();
      render();
      YW.ui.toast('已导入 ' + okList.length + ' 个模板' + (problems.length ? '，' + problems.length + ' 个有问题被跳过' : ''), 4000);
    });
  }

  function saveTemplatesJson(parsed) {
    var list = Array.isArray(parsed) ? parsed : parsed.templates;
    if (!Array.isArray(list)) return '需要 {"schemaVersion":1,"templates":[...]} 这样的结构';
    var problems = [];
    list.forEach(function (t) {
      var v = C.validateTemplate(t);
      if (!v.ok) problems.push((t && t.name) || '未命名');
    });
    if (problems.length) return '这些模板不合格：' + problems.join('、');

    YW.state.templates = list;
    YW.db.putMany('templates', list).then(function () {
      YW.entry.refresh();
      render();
      YW.ui.toast('模板已更新', 2600);
    });
    return null;
  }

  /* ---------- 词表 ---------- */
  function exportTags() {
    var doc = { schemaVersion: 1, groups: YW.state.tagGroups };
    YW.download('error-tags.json', JSON.stringify(doc, null, 2));
    YW.ui.toast('已导出 error-tags.json');
  }

  function importTags(raw) {
    var doc;
    try { doc = JSON.parse(raw); } catch (e) { YW.ui.toast('不是有效 JSON', 3200); return; }
    var groups = Array.isArray(doc) ? doc : doc.groups;
    if (!Array.isArray(groups)) { YW.ui.toast('文件里没有 groups 数组', 3200); return; }

    var v = C.validateTags({ groups: groups });
    if (!v.ok) { YW.ui.toast('词表不合格：' + v.errors[0], 4200); return; }

    YW.state.tagGroups = groups;
    YW.db.putMany('tagGroups', groups).then(function () {
      YW.entry.refresh();
      render();
      YW.ui.toast('词表已更新', 2600);
    });
  }

  function saveTagsJson(parsed) {
    var groups = Array.isArray(parsed) ? parsed : parsed.groups;
    if (!Array.isArray(groups)) return '需要 {"schemaVersion":1,"groups":[...]} 这样的结构';
    var v = C.validateTags({ groups: groups });
    if (!v.ok) return '词表不合格：' + v.errors.slice(0, 3).join('；');
    YW.state.tagGroups = groups;
    YW.db.putMany('tagGroups', groups).then(function () {
      YW.entry.refresh();
      render();
      YW.ui.toast('词表已更新', 2600);
    });
    return null;
  }

  /* ---------- 错题本 ---------- */
  function tagNames(ids) {
    var names = [];
    (ids || []).forEach(function (id) {
      (YW.state.tagGroups || []).forEach(function (g) {
        (g.tags || []).forEach(function (t) { if (t.id === id) names.push(t.name); });
      });
    });
    return names;
  }

  function viewMistakes() {
    var list = YW.state.mistakes.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var body = YW.el('div');

    if (!list.length) {
      body.appendChild(YW.el('p', { class: 'hint', text: '还没有错题。在考试详情里，失分的小题后面有「记错题」。' }));
    }

    list.forEach(function (m) {
      var exam = YW.state.exams.filter(function (e) { return e.id === m.examId; })[0];
      var tags = tagNames(m.errorTagIds);

      body.appendChild(YW.el('div', { class: 'mistake-card' }, [
        YW.el('div', { class: 'mistake-q', text: m.question || '（没写题干）' }),
        YW.el('div', { class: 'item-tags', style: 'margin-top:6px' },
          tags.map(function (n) { return YW.el('span', { class: 'tag-pill', text: n }); })),
        m.myAnswer ? YW.el('p', { class: 'hint', style: 'margin-top:6px', text: '我答：' + m.myAnswer }) : null,
        m.correctAnswer ? YW.el('p', { class: 'hint', text: '应为：' + m.correctAnswer }) : null,
        m.howToFix ? YW.el('p', { class: 'hint', text: '怎么改：' + m.howToFix }) : null,
        YW.el('div', { class: 'mistake-foot' }, [
          YW.el('span', { class: 'hint', text: exam ? exam.name + ' · ' + YW.formatDate(exam.date) : '原考试已删除' }),
          exam ? YW.el('button', {
            type: 'button', class: 'mini-btn',
            onclick: function () { YW.ui.closeSheet(); YW.detail.open(exam.id); }
          }, ['看原卷']) : null
        ])
      ]));
    });

    YW.ui.openSheet('错题本（' + list.length + ' 条）', body, []);
  }

  function exportMistakes() {
    var doc = { schemaVersion: 1, kind: 'yuwen-mistakes', exportedAt: new Date().toISOString(), mistakes: YW.state.mistakes };
    YW.download('错题本-' + YW.todayISO() + '.json', JSON.stringify(doc, null, 2));
    YW.ui.toast('已导出错题本');
  }

  function clearMistakes() {
    var body = YW.el('div', {}, [YW.el('p', { text: '清空错题本？考试记录不受影响。' })]);
    var ok = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () {
        YW.db.clear('mistakes').then(function () {
          YW.state.mistakes = [];
          YW.ui.closeSheet();
          render();
          YW.ui.toast('错题本已清空', 2400);
        });
      }
    }, ['清空']);
    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
    YW.ui.openSheet('清空错题本', body, [cancel, ok]);
  }

  /* ---------- 事件 ---------- */
  function bind() {
    YW.$('#btn-export-all').addEventListener('click', function () {
      var withPhotos = YW.$('#backup-with-photos').checked;
      YW.ui.exportAll(withPhotos);
    });

    YW.$('#btn-import-all').addEventListener('click', function () {
      YW.$('#import-all-input').click();
    });
    YW.$('#import-all-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      YW.readFileText(f).then(function (txt) { YW.ui.importAll(txt); });
    });

    YW.$('#btn-tpl-export').addEventListener('click', exportTemplates);
    YW.$('#btn-tpl-import').addEventListener('click', function () { YW.$('#tpl-import-input').click(); });
    YW.$('#tpl-import-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      YW.readFileText(f).then(importTemplates);
    });
    YW.$('#btn-tpl-edit').addEventListener('click', function () {
      openJsonEditor('编辑模板 JSON', JSON.stringify({ schemaVersion: 1, templates: YW.state.templates }, null, 2), saveTemplatesJson);
    });

    YW.$('#btn-tag-export').addEventListener('click', exportTags);
    YW.$('#btn-tag-import').addEventListener('click', function () { YW.$('#tag-import-input').click(); });
    YW.$('#tag-import-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      YW.readFileText(f).then(importTags);
    });
    YW.$('#btn-tag-edit').addEventListener('click', function () {
      openJsonEditor('编辑词表 JSON', JSON.stringify({ schemaVersion: 1, groups: YW.state.tagGroups }, null, 2), saveTagsJson);
    });

    YW.$('#btn-mistake-export').addEventListener('click', exportMistakes);
    YW.$('#btn-mistake-clear').addEventListener('click', clearMistakes);
  }

  YW.settings = { bind: bind, render: render };
})(window.YW);