/* 分析页 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var C = YW.calc;

  function shortLabel(exam, idx) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(exam.date || '');
    if (m) return Number(m[2]) + '/' + Number(m[3]);
    return '#' + (idx + 1);
  }

  /** 当前学生 + 当前模板下的考试（按日期升序） */
  function scopedExams() {
    var mine = C.byStudent(YW.state.exams, YW.state.currentStudentId);
    var tplId = YW.state.view.templateId;
    if (!tplId) return [];
    return C.sortExams(C.byTemplate(mine, tplId));
  }

  function currentTemplate() {
    return YW.state.templates.filter(function (t) { return t.id === YW.state.view.templateId; })[0] || null;
  }

  function fillTemplateSelect() {
    var sel = YW.$('#analysis-template');
    var prev = YW.state.view.templateId;
    sel.innerHTML = '';

    var list = YW.ui.templatesOfCurrentStudent();
    if (!list.length) {
      sel.appendChild(YW.el('option', { value: '' }, ['这个学生还没有模板']));
      YW.state.view.templateId = '';
      return;
    }

    var usedIds = C.templatesOfStudent(YW.state.exams, YW.state.currentStudentId);
    var usedGroup = [], restGroup = [];
    list.forEach(function (t) {
      (usedIds.indexOf(t.id) >= 0 ? usedGroup : restGroup).push(t);
    });

    function addGroup(label, arr) {
      if (!arr.length) return;
      var og = document.createElement('optgroup');
      og.label = label;
      arr.forEach(function (t) {
        og.appendChild(YW.el('option', { value: t.id }, [t.name]));
      });
      sel.appendChild(og);
    }
    addGroup('这个学生用过的', usedGroup);
    addGroup('其他模板', restGroup);

    var keep = prev && list.some(function (t) { return t.id === prev; });
    YW.state.view.templateId = keep ? prev : list[0].id;
    sel.value = YW.state.view.templateId;
  }

  function renderStrip(exams, opts, tpl) {
    var host = YW.$('#analysis-strip');
    host.innerHTML = '';
    if (!exams.length) return;

    var last = exams[exams.length - 1];
    var t = C.totals(last, opts);
    var prev = exams.length > 1 ? C.totals(exams[exams.length - 2], opts) : null;
    var delta = prev && prev.rate != null && t.rate != null ? t.rate - prev.rate : null;

    var cells = [
      { k: '最近一次', v: C.pct(t.rate), sub: last.name },
      { k: '得分', v: YW.fmt(t.got) + ' / ' + YW.fmt(t.full), sub: '' },
      {
        k: '比上一次',
        v: delta == null ? '—' : (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + 'pt',
        sub: delta == null ? '' : (delta >= 0 ? '有进步' : '退了一点')
      },
      { k: '考试次数', v: String(exams.length), sub: opts && opts.excludeEssay ? '已排除作文' : (C.subjectOf(tpl) || '') }
    ];

    host.innerHTML = cells.map(function (c) {
      return '<div class="stat-cell"><div class="k">' + YW.escapeHTML(c.k) + '</div>' +
        '<div class="v">' + YW.escapeHTML(String(c.v)) + '</div>' +
        (c.sub ? '<div class="sub">' + YW.escapeHTML(c.sub) + '</div>' : '') + '</div>';
    }).join('');
  }

  function fillDimSelect() {
    var sel = YW.$('#trend-dim');
    if (sel.dataset.filled === '1') return;
    sel.dataset.filled = '1';
    sel.appendChild(YW.el('option', { value: '' }, ['总体']));
    C.DIMENSIONS.forEach(function (d) {
      sel.appendChild(YW.el('option', { value: d.key }, [d.name]));
    });
  }

  function renderTrend(exams, opts) {
    var dim = YW.state.view.trendDim;
    var points = exams.map(function (e, i) {
      var t = dim ? { got: 0, full: 0, rate: C.dimRate(e, dim, opts) } : C.totals(e, opts);
      if (dim) {
        var ds = C.dimensions(e, opts).filter(function (d) { return d.key === dim; })[0];
        if (ds) { t.got = ds.got; t.full = ds.full; } else { t.got = 0; t.full = 0; }
      }
      return {
        name: e.name,
        date: e.date,
        label: shortLabel(e, i),
        got: t.got,
        full: t.full,
        value: t.rate,
        examId: e.id
      };
    }).filter(function (p) { return p.value != null; });

    YW.charts.trend(YW.$('#chart-trend'), { points: points });
  }

  function renderRadar(exams, opts) {
    var sub = YW.$('#radar-sub');
    if (exams.length < 1) {
      YW.charts.radar(YW.$('#chart-radar'), { axes: [], polygons: [], legendHost: YW.$('#radar-legend') });
      sub.textContent = '';
      return;
    }

    var pick = [];
    var first = exams[0];
    var last = exams[exams.length - 1];
    var prev = exams.length >= 2 ? exams[exams.length - 2] : null;

    var colors = { first: '#8c9db0', prev: '#c08b5a', last: '#2f6b5e' };

    if (exams.length === 1) {
      pick.push({ key: 'last', name: '最近一次', color: colors.last, exam: last });
    } else if (exams.length === 2) {
      pick.push({ key: 'last', name: '最近一次', color: colors.last, exam: last });
      pick.push({ key: 'first', name: '第一次', color: colors.first, exam: first });
    } else {
      pick.push({ key: 'last', name: '最近一次', color: colors.last, exam: last });
      pick.push({ key: 'prev', name: '上一次', color: colors.prev, exam: prev });
      pick.push({ key: 'first', name: '第一次', color: colors.first, exam: first });
    }

    var axes = C.RADAR_DIMS.map(function (k) {
      return { key: k, label: C.dimShort(k) };
    }).filter(function (ax) {
      return !(opts && opts.excludeEssay) || ax.key !== 'xiezuo';
    });

    var polygons = pick.map(function (p) {
      var dims = C.dimensions(p.exam, opts);
      var byKey = {};
      dims.forEach(function (d) { byKey[d.key] = d; });
      return {
        key: p.key,
        name: p.name + '（' + shortLabel(p.exam, exams.indexOf(p.exam)) + '）',
        color: p.color,
        values: axes.map(function (ax) {
          var d = byKey[ax.key];
          return d && d.full > 0 ? d.got / d.full : null;
        })
      };
    });

    YW.charts.radar(YW.$('#chart-radar'), {
      axes: axes,
      polygons: polygons,
      legendHost: YW.$('#radar-legend')
    });

    sub.textContent = '“第一次”取范围内最早一次';
  }

  function renderHeat(exams, opts) {
    var dims = C.DIMENSIONS.filter(function (d) {
      return !(opts && opts.excludeEssay) || d.key !== 'xiezuo';
    });

    var cols = exams.map(function (e, i) { return { short: shortLabel(e, i), exam: e }; });

    var rows = dims.map(function (d) {
      return {
        key: d.key,
        label: d.name,
        values: exams.map(function (e) {
          var ds = C.dimensions(e, opts).filter(function (x) { return x.key === d.key; })[0];
          if (!ds || !ds.full) return null;
          return ds.got / ds.full;
        })
      };
    }).filter(function (r) {
      return r.values.some(function (v) { return v != null; });
    });

    YW.charts.heat(YW.$('#chart-heat'), { rows: rows, cols: cols });
  }

  function renderTags(exams, opts, tpl) {
    var groups = C.tagGroupsFor(tpl, YW.state.tagGroups);
    var stats = C.tagStats(exams, Object.assign({ tagGroups: groups }, opts)).slice(0, 8);
    YW.charts.bars(YW.$('#chart-tags'), { entries: stats });
  }

  function renderLevels(exams) {
    var pts = exams.map(function (e, i) {
      return { label: shortLabel(e, i), level: C.essayLevelOf(e), name: e.name };
    });
    YW.charts.levels(YW.$('#chart-level'), { points: pts });
  }

  function renderExamList(exams, opts) {
    var host = YW.$('#exam-list');
    host.innerHTML = '';
    var sorted = exams.slice().reverse();

    if (!sorted.length) {
      host.appendChild(YW.el('div', { class: 'empty', text: '这个学生在这份模板下还没有考试记录。' }));
      YW.$('#records-count').textContent = '';
      return;
    }
    YW.$('#records-count').textContent = '共 ' + sorted.length + ' 次';

    sorted.forEach(function (e) {
      var t = C.totals(e, opts);
      host.appendChild(YW.el('button', {
        type: 'button', class: 'exam-row',
        onclick: function () { YW.detail.open(e.id); }
      }, [
        YW.el('div', { class: 'exam-main' }, [
          YW.el('div', { class: 'exam-name', text: e.name }),
          YW.el('div', {
            class: 'exam-meta',
            text: YW.formatDate(e.date) + ' · ' + YW.fmt(t.got) + '/' + YW.fmt(t.full) + ' 分'
          })
        ]),
        YW.el('div', { class: 'exam-rate' + (t.rate != null && t.rate < 0.6 ? ' low' : ''), text: C.pct(t.rate) })
      ]));
    });
  }

  function render() {
    var view = YW.state.view;
    var opts = { excludeEssay: view.excludeEssay };

    // 学生或模板为空时先兜住
    if (!YW.state.students.length) return;
    fillTemplateSelect();

    document.querySelectorAll('#seg-essay .seg-btn').forEach(function (b) {
      var on = (b.dataset.exclude === '1') === !!view.excludeEssay;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    YW.$('#range-select').value = String(view.range || 0);

    fillDimSelect();
    YW.$('#trend-dim').value = view.trendDim || '';

    var tpl = currentTemplate();
    var all = scopedExams();
    var exams = C.recent(all, view.range);

    var scopeEl = YW.$('#analysis-scope');
    if (scopeEl) {
      var s = YW.ui.currentStudent();
      scopeEl.textContent = (s ? s.name : '—') + ' · ' + (tpl ? tpl.name : '没有模板') +
        (opts.excludeEssay ? ' · 已排除作文' : '');
    }

    renderStrip(exams, opts, tpl);
    renderTrend(exams, opts);
    renderRadar(exams, opts);
    renderHeat(exams, opts);
    renderTags(exams, opts, tpl);
    renderLevels(exams);
    renderExamList(exams, opts);
  }

  function bind() {
    YW.$('#seg-essay').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) return;
      YW.state.view.excludeEssay = btn.dataset.exclude === '1';
      render();
    });

    YW.$('#range-select').addEventListener('change', function (e) {
      YW.state.view.range = Number(e.target.value) || 0;
      render();
    });

    YW.$('#trend-dim').addEventListener('change', function (e) {
      YW.state.view.trendDim = e.target.value;
      render();
    });

    YW.$('#analysis-template').addEventListener('change', function (e) {
      YW.state.view.templateId = e.target.value;
      render();
    });
  }

  YW.analysis = { bind: bind, render: render, scopedExams: scopedExams };
})(window.YW);