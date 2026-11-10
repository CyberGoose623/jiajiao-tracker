/* 录入页 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var C = YW.calc;

  var st = {
    templateId: '',
    rows: [],            // { item, no, dimension, fullScore, type, label, sectionName, got, tagIds, note, el, inputEl, tagBtn }
    photoId: null,
    photoFile: null,
    editingExamId: null,
    populated: false
  };

  function currentTemplate() {
    return YW.state.templates.filter(function (t) { return t.id === st.templateId; })[0] || null;
  }

  function essayFullOf(tpl) {
    var sum = 0;
    (tpl && tpl.sections || []).forEach(function (sec) {
      (sec.items || []).forEach(function (it) { if (it.dimension === 'xiezuo') sum += Number(it.fullScore) || 0; });
    });
    return sum;
  }

  function fillTemplateSelect() {
    var sel = YW.$('#entry-template');
    var prev = st.templateId;
    sel.innerHTML = '';
    if (!YW.state.templates.length) {
      sel.appendChild(YW.el('option', { value: '' }, ['（没有模板，去设置里导入）']));
      return;
    }
    YW.state.templates.forEach(function (t) {
      sel.appendChild(YW.el('option', { value: t.id }, [t.name + '（' + t.totalScore + ' 分）']));
    });
    var keep = prev && YW.state.templates.some(function (t) { return t.id === prev; });
    st.templateId = keep ? prev : YW.state.templates[0].id;
    sel.value = st.templateId;
  }

  function buildRows() {
    var tpl = currentTemplate();
    st.rows = [];
    if (!tpl) return;
    var list = C.templateItems(tpl);
    list.forEach(function (entry) {
      st.rows.push({
        item: entry.item,
        itemId: entry.item.id,
        no: String(entry.item.no),
        dimension: entry.item.dimension,
        fullScore: Number(entry.item.fullScore) || 0,
        type: entry.type,
        label: entry.item.label || '',
        sectionName: entry.sectionName || '',
        got: Number(entry.item.fullScore) || 0,
        tagIds: [],
        note: '',
        el: null,
        inputEl: null,
        tagBtn: null
      });
    });
  }

  function renderItems() {
    var host = YW.$('#entry-items');
    host.innerHTML = '';
    var lastSection = null;

    st.rows.forEach(function (row) {
      if (row.sectionName !== lastSection) {
        lastSection = row.sectionName;
        var secItems = st.rows.filter(function (r) { return r.sectionName === lastSection; });
        var secFull = secItems.reduce(function (a, r) { return a + r.fullScore; }, 0);
        host.appendChild(YW.el('div', { class: 'section-head' }, [
          YW.el('span', { text: lastSection || '题目' }),
          YW.el('span', { class: 'sec-score', text: '满分 ' + YW.fmt(secFull) })
        ]));
      }

      var input = YW.el('input', {
        class: 'score-input',
        type: 'text',
        inputmode: 'decimal',
        pattern: '[0-9]*\\.?[0-9]*',
        autocomplete: 'off',
        enterkeyhint: 'next',
        value: YW.fmt(row.got),
        'aria-label': '第 ' + row.no + ' 题得分，满分 ' + YW.fmt(row.fullScore)
      });
      input.addEventListener('input', function () { onScoreInput(row); });
      input.addEventListener('blur', function () { onScoreBlur(row); });
      input.addEventListener('focus', function () {
        row.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });

      var tagBtn = YW.el('button', {
        type: 'button', class: 'tag-btn',
        onclick: function () { openTagSheet(row); }
      }, ['错因']);
      tagBtn.addEventListener('click', function () {});

      var tagWrap = YW.el('div', { class: 'item-tags' });

      var badges = [
        YW.el('span', { class: 'badge' + (row.type === 'essay' ? ' type-essay' : (row.type === 'blank' ? ' type-blank' : '')), text: C.TYPE_NAMES[row.type] || '主观' })
      ];

      var left = YW.el('div', { class: 'item-main' }, [
        YW.el('div', { class: 'item-label' }, badges.concat([document.createTextNode(row.label || '（未写考什么）')])),
        tagWrap
      ]);

      var right = YW.el('div', { class: 'item-right' }, [
        YW.el('div', { class: 'score-wrap' }, [
          input,
          YW.el('span', { class: 'score-full', text: '/' + YW.fmt(row.fullScore) })
        ]),
        tagBtn
      ]);

      var el = YW.el('div', { class: 'item-row' }, [
        YW.el('div', { class: 'item-no', text: row.no }),
        left,
        right
      ]);

      row.el = el;
      row.inputEl = input;
      row.tagBtn = tagBtn;
      row.tagWrap = tagWrap;

      host.appendChild(el);
      paintRowTags(row);
    });

    if (!st.rows.length) {
      host.appendChild(YW.el('div', { class: 'empty', text: '这个模板里没有题目。检查一下模板 JSON 的 sections。' }));
    }
  }

  function paintRowTags(row) {
    if (!row.tagWrap) return;
    row.tagWrap.innerHTML = '';
    var names = row.tagIds.map(tagName);
    names.slice(0, 3).forEach(function (n) {
      row.tagWrap.appendChild(YW.el('span', { class: 'tag-pill', text: n }));
    });
    if (names.length > 3) {
      row.tagWrap.appendChild(YW.el('span', { class: 'tag-pill more', text: '+' + (names.length - 3) }));
    }
    row.tagBtn.classList.toggle('has-tags', row.tagIds.length > 0);
    row.tagBtn.textContent = row.tagIds.length ? '错因 ' + row.tagIds.length : '错因';
  }

  function tagName(id) {
    var out = id;
    (YW.state.tagGroups || []).forEach(function (g) {
      (g.tags || []).forEach(function (t) { if (t.id === id) out = t.name; });
    });
    return out;
  }

  function onScoreInput(row) {
    var v = YW.parseScore(row.inputEl.value);
    var bad = isNaN(v) || v < 0 || v > row.fullScore;
    row.inputEl.classList.toggle('invalid', bad || row.inputEl.value.trim() === '');
    row.got = isNaN(v) ? null : v;
    row.el.classList.toggle('is-loss', !isNaN(v) && v < row.fullScore);
    updateLive();
  }

  function onScoreBlur(row) {
    if (row.inputEl.value.trim() === '') {
      row.got = 0;
      row.inputEl.value = '0';
      row.got = 0;
      updateLive();
      return;
    }
    var v = YW.parseScore(row.inputEl.value);
    if (isNaN(v)) {
      row.inputEl.value = '0';
      row.got = 0;
    } else {
      // 超分不自动改，保留原样让用户自己看
      row.got = v;
    }
    updateLive();
  }

  function invalidRows() {
    return st.rows.filter(function (r) {
      return r.got == null || isNaN(r.got) || r.got < 0 || r.got > r.fullScore;
    });
  }

  function emptyRows() {
    return st.rows.filter(function (r) { return r.inputEl && r.inputEl.value.trim() === ''; });
  }

  function updateLive() {
    var got = 0, full = 0;
    st.rows.forEach(function (r) {
      got += (typeof r.got === 'number' && !isNaN(r.got)) ? r.got : 0;
      full += r.fullScore;
    });
    YW.$('#live-total').textContent = YW.fmt(got);
    YW.$('#live-full').textContent = '/' + YW.fmt(full);
    YW.$('#live-rate').textContent = full > 0 ? YW.pct(got / full) : '—';

    var warn = YW.$('#live-warn');
    var bad = invalidRows();
    if (bad.length) {
      warn.hidden = false;
      warn.textContent = bad.length + ' 道题分数不对';
    } else {
      warn.hidden = true;
    }
  }

  /* ---------- 错因面板 ---------- */
  function openTagSheet(row) {
    var body = YW.el('div');
    var picked = row.tagIds.slice();

    if (!YW.state.tagGroups.length) {
      body.appendChild(YW.el('p', { class: 'hint', text: '还没有错因词表。去设置页导入 error-tags.json。' }));
    }

    YW.state.tagGroups.forEach(function (g) {
      var cloud = YW.el('div', { class: 'tag-cloud' });
      (g.tags || []).forEach(function (t) {
        var chip = YW.el('button', {
          type: 'button', class: 'tag-chip',
          'aria-pressed': picked.indexOf(t.id) >= 0 ? 'true' : 'false',
          onclick: function () {
            var i = picked.indexOf(t.id);
            if (i >= 0) picked.splice(i, 1); else picked.push(t.id);
            chip.setAttribute('aria-pressed', picked.indexOf(t.id) >= 0 ? 'true' : 'false');
          }
        }, [t.name]);
        cloud.appendChild(chip);
      });
      body.appendChild(YW.el('div', { class: 'tag-group' }, [
        YW.el('h3', { text: g.name }),
        cloud
      ]));
    });

    var note = YW.el('textarea', { class: 'control', rows: '3', placeholder: '补一句自己的话，可选。统计只认标签。' });
    note.value = row.note || '';
    body.appendChild(YW.el('div', { class: 'note-field' }, [
      YW.el('label', { text: '备注（不参与统计）' }),
      note
    ]));

    var done = YW.el('button', {
      type: 'button', class: 'btn primary',
      onclick: function () {
        row.tagIds = picked;
        row.note = note.value.trim();
        paintRowTags(row);
        YW.ui.closeSheet();
      }
    }, ['确定']);
    var clear = YW.el('button', {
      type: 'button', class: 'btn',
      onclick: function () {
        row.tagIds = [];
        row.note = '';
        paintRowTags(row);
        YW.ui.closeSheet();
      }
    }, ['清空']);

    YW.ui.openSheet('第 ' + row.no + ' 题 · ' + (row.label || '错因'), body, [clear, done]);
  }

  /* ---------- 保存 ---------- */
  function nextExamId(date) {
    var base = 'exam-' + date;
    if (!YW.state.exams.some(function (e) { return e.id === base; })) return base;
    var n = 2;
    while (YW.state.exams.some(function (e) { return e.id === base + '-' + n; })) n++;
    return base + '-' + n;
  }

  function autoEssayLevel(tpl) {
    var essay = st.rows.filter(function (r) { return r.dimension === 'xiezuo'; });
    if (!essay.length) return null;
    var got = 0, full = 0;
    essay.forEach(function (r) { got += Number(r.got) || 0; full += r.fullScore; });
    if (full <= 0) return null;
    var scaled = (got / full) * 50;
    if (scaled >= 45) return 1;
    if (scaled >= 40) return 2;
    if (scaled >= 35) return 3;
    if (scaled >= 30) return 4;
    return 5;
  }

  function save() {
    var tpl = currentTemplate();
    if (!tpl) { YW.ui.toast('先选一个模板', 3000); return; }

    var bad = invalidRows();
    if (bad.length) {
      YW.rowsScrollTo(bad[0]);
      YW.ui.toast('第 ' + bad[0].no + ' 题分数超过满分或为负数，先改掉（共 ' + bad.length + ' 处）', 4200);
      return;
    }
    var missing = emptyRows();
    if (missing.length) {
      YW.ui.toast('还有 ' + missing.length + ' 道题没填分数，第 ' + missing[0].no + ' 题空的', 4000);
      YW.rowsScrollTo(missing[0]);
      return;
    }

    var date = YW.$('#entry-date').value || YW.todayISO();
    var name = (YW.$('#entry-name').value || '').trim() || (tpl.name + ' · ' + date);
    var manualLevel = YW.$('#entry-essay-level').value;

    var answers = st.rows.map(function (r) {
      return {
        itemId: r.itemId,
        no: r.no,
        dimension: r.dimension,
        fullScore: r.fullScore,
        gotScore: Number(r.got),
        errorTagIds: r.tagIds.slice(),
        note: r.note || ''
      };
    });

    var id = st.editingExamId || nextExamId(date);
    var exam = {
      id: id,
      date: date,
      name: name,
      templateId: tpl.id,
      templateSnapshot: YW.clone(tpl),   // 必须：历史统计只认自己的快照
      answers: answers,
      essayLevel: manualLevel !== '' ? Number(manualLevel) : autoEssayLevel(tpl),
      paperImageId: st.photoId || null,
      createdAt: Date.now()
    };

    var oldPhoto = st.editingExamId
      ? (YW.state.exams.filter(function (e) { return e.id === st.editingExamId; })[0] || {}).paperImageId
      : null;

    var photoTask = st.photoFile
      ? YW.photos.save(st.photoFile).then(function (pid) { exam.paperImageId = pid; })
      : Promise.resolve();

    photoTask.then(function () {
      return YW.db.put('exams', exam);
    }).then(function () {
      if (oldPhoto && oldPhoto !== exam.paperImageId) return YW.photos.remove(oldPhoto);
    }).then(function () {
      return YW.entry.loadAll();
    }).then(function () {
      var wasEditing = !!st.editingExamId;
      resetForm(tpl);
      YW.ui.toast(wasEditing ? '已更新这次考试' : '已保存：' + name, 3000);
      // 提醒导出备份
      var last = YW.state.settings.lastBackupAt;
      if (!last || YW.daysBetween(last, Date.now()) >= 14) {
        setTimeout(function () {
          YW.ui.toast('数据只存在这台设备上，去设置页导出一份备份', 4200);
        }, 2600);
      }
      YW.analysis.render();
      YW.settings.render();
    }).catch(function (err) {
      console.error(err);
      YW.ui.toast('保存失败：' + (err && err.message ? err.message : '未知错误'), 4200);
    });
  }

  function resetForm(tpl) {
    st.editingExamId = null;
    st.photoId = null;
    st.photoFile = null;
    YW.$('#entry-name').value = '';
    YW.$('#entry-date').value = YW.todayISO();
    YW.$('#entry-essay-level').value = '';
    YW.$('#entry-photo-hint').textContent = '可选，挂一张原卷照片';
    YW.$('#entry-photo-clear').hidden = true;
    var pv = YW.$('#entry-photo-preview');
    pv.hidden = true;
    pv.querySelector('img').removeAttribute('src');
    st.templateId = tpl.id;
    YW.$('#entry-template').value = tpl.id;
    buildRows();
    renderItems();
    syncEssayField();
    updateLive();
    st.builtTemplateId = tpl.id;
  }

  function syncEssayField() {
    var tpl = currentTemplate();
    var full = essayFullOf(tpl);
    var field = YW.$('#essay-level-field');
    field.hidden = full <= 0;
    var hintEl = YW.$('#essay-hint');
    if (full > 0 && full !== 50) {
      if (!hintEl) {
        hintEl = YW.el('p', { class: 'hint', id: 'essay-hint' });
        field.appendChild(hintEl);
      }
      hintEl.textContent = '这份模板作文满分 ' + YW.fmt(full) + ' 分，档位区间按 50 分制折算后对应。';
    } else if (hintEl) {
      hintEl.textContent = '';
    }
  }

  /* ---------- 载入已有考试进行修改 ---------- */
  function loadExam(examId) {
    var exam = YW.state.exams.filter(function (e) { return e.id === examId; })[0];
    if (!exam) return;
    var tpl = exam.templateSnapshot || YW.state.templates.filter(function (t) { return t.id === exam.templateId; })[0];
    if (!tpl) { YW.ui.toast('这条记录没有模板快照，改不了', 3200); return; }

    st.editingExamId = exam.id;
    st.templateId = tpl.id;
    if (!YW.state.templates.some(function (t) { return t.id === tpl.id && t.totalScore === tpl.totalScore; })) {
      // 快照模板可能已从列表删除，临时挂上以便显示
      if (!YW.state.templates.some(function (t) { return t.id === tpl.id; })) YW.state.templates.push(tpl);
    }
    fillTemplateSelect();
    YW.$('#entry-template').value = tpl.id;

    YW.$('#entry-name').value = exam.name;
    YW.$('#entry-date').value = exam.date;
    YW.$('#entry-essay-level').value = exam.essayLevel == null ? '' : String(exam.essayLevel);

    // 先用快照建行，再灌分数
    st.rows = [];
    var items = C.templateItems(tpl);
    items.forEach(function (entry) {
      var ans = (exam.answers || []).filter(function (a) { return a.itemId === entry.item.id; })[0];
      st.rows.push({
        item: entry.item,
        itemId: entry.item.id,
        no: String(entry.item.no),
        dimension: entry.item.dimension,
        fullScore: Number(entry.item.fullScore) || 0,
        type: entry.type,
        label: entry.item.label || '',
        sectionName: entry.sectionName || '',
        got: ans ? Number(ans.gotScore) : Number(entry.item.fullScore) || 0,
        tagIds: ans ? (ans.errorTagIds || []).slice() : [],
        note: ans ? (ans.note || '') : '',
        el: null, inputEl: null, tagBtn: null
      });
    });

    renderItems();
    syncEssayField();
    updateLive();
    st.builtTemplateId = tpl.id;

    st.photoId = exam.paperImageId || null;
    st.photoFile = null;
    if (st.photoId) {
      YW.$('#entry-photo-hint').textContent = '已挂原卷照片';
      YW.$('#entry-photo-clear').hidden = false;
      YW.photos.url(st.photoId).then(function (u) {
        if (!u) return;
        var pv = YW.$('#entry-photo-preview');
        pv.hidden = false;
        pv.querySelector('img').src = u;
      });
    }

    YW.ui.go('entry');
    YW.ui.toast('已载入《' + exam.name + '》，改完再保存会覆盖这一条', 3800);
  }

  function loadAll() {
    return Promise.all([
      YW.db.all('exams'),
      YW.db.getMeta('lastBackupAt', null)
    ]).then(function (res) {
      YW.state.exams = res[0] || [];
      YW.state.settings.lastBackupAt = res[1];
      YW.ui.renderBackupLine();
    });
  }

  function refresh() {
    fillTemplateSelect();
    if (!st.populated) {
      YW.$('#entry-date').value = YW.todayISO();
      st.populated = true;
    }
    // 只有模板换了或还没渲染过才重建，避免切页回来把填了一半的分清空
    if (!st.rows.length || st.builtTemplateId !== st.templateId) {
      buildRows();
      renderItems();
      syncEssayField();
      updateLive();
      st.builtTemplateId = st.templateId;
    }
  }

  function bind() {
    YW.$('#entry-template').addEventListener('change', function (e) {
      st.templateId = e.target.value;
      st.editingExamId = null;
      buildRows();
      renderItems();
      syncEssayField();
      updateLive();
    });

    YW.$('#entry-save').addEventListener('click', save);

    YW.$('#entry-photo-btn').addEventListener('click', function () {
      YW.$('#entry-photo-input').click();
    });

    YW.$('#entry-photo-input').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) { YW.ui.toast('选一张图片', 2600); return; }
      st.photoFile = file;
      YW.$('#entry-photo-hint').textContent = '照片已选，保存时一起压缩存下来';
      YW.$('#entry-photo-clear').hidden = false;
      YW.readFileDataURL(file).then(function (u) {
        var pv = YW.$('#entry-photo-preview');
        pv.hidden = false;
        pv.querySelector('img').src = u;
      });
      e.target.value = '';
    });

    YW.$('#entry-photo-clear').addEventListener('click', function () {
      st.photoFile = null;
      var old = st.photoId;
      st.photoId = null;
      YW.$('#entry-photo-hint').textContent = '可选，挂一张原卷照片';
      YW.$('#entry-photo-clear').hidden = true;
      var pv = YW.$('#entry-photo-preview');
      pv.hidden = true;
      pv.querySelector('img').removeAttribute('src');
      if (old && st.editingExamId) YW.photos.remove(old);
    });
  }

  YW.entry = {
    bind: bind,
    refresh: refresh,
    loadAll: loadAll,
    loadExam: loadExam,
    resetForm: resetForm,
    currentTemplate: currentTemplate
  };

  YW.rowsScrollTo = function (row) {
    if (!row || !row.el) return;
    row.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (row.inputEl) {
      setTimeout(function () {
        try { row.inputEl.focus({ preventScroll: true }); } catch (e) { row.inputEl.focus(); }
        row.inputEl.classList.add('invalid');
      }, 320);
    }
  };
})(window.YW);