/* 计算规则
   1) 得分率 = 得分 / 满分，永远按满分加权求和，不对小题得分率取平均
   2) 跨考试比较只用得分率
   3) 排除作文视图：丢掉 xiezuo 维度后整体重算
*/
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var DIMENSIONS = [
    { key: 'jilei', name: '积累和运用', short: '积累' },
    { key: 'mingzhu', name: '名著阅读', short: '名著' },
    { key: 'wenyan', name: '文言文阅读', short: '文言' },
    { key: 'xiandai', name: '现代文阅读', short: '现代文' },
    { key: 'gushi', name: '古代诗歌鉴赏', short: '古诗' },
    { key: 'xiezuo', name: '写作', short: '写作' },
    { key: 'shuxie', name: '书写/卷面', short: '书写' }
  ];

  var RADAR_DIMS = ['jilei', 'mingzhu', 'wenyan', 'xiandai', 'gushi', 'xiezuo'];

  var TYPE_NAMES = { choice: '选择', blank: '填空', written: '主观', essay: '作文' };

  var LEVEL_NAMES = { 1: '一类', 2: '二类', 3: '三类', 4: '四类', 5: '五类' };
  var LEVEL_RANGES = { 1: '45-50', 2: '40-44', 3: '35-39', 4: '30-34', 5: '29 以下' };

  function dimName(key) {
    for (var i = 0; i < DIMENSIONS.length; i++) if (DIMENSIONS[i].key === key) return DIMENSIONS[i].name;
    return key || '未分类';
  }
  function dimShort(key) {
    for (var i = 0; i < DIMENSIONS.length; i++) if (DIMENSIONS[i].key === key) return DIMENSIONS[i].short;
    return key || '未分类';
  }

  /** 是否是作文类条目（答案不带 type，只认维度） */
  function isEssayAnswer(a) { return a && a.dimension === 'xiezuo'; }

  /** 取一次考试参与统计的答题条目 */
  function answersOf(exam, opts) {
    var excludeEssay = !!(opts && opts.excludeEssay);
    var list = (exam && exam.answers) || [];
    if (!excludeEssay) return list;
    return list.filter(function (a) { return !isEssayAnswer(a); });
  }

  /** 总分与得分率 */
  function totals(exam, opts) {
    var list = answersOf(exam, opts);
    var got = 0, full = 0;
    list.forEach(function (a) {
      got += Number(a.gotScore) || 0;
      full += Number(a.fullScore) || 0;
    });
    return { got: got, full: full, rate: full > 0 ? got / full : null };
  }

  /** 维度聚合：Σ得分 / Σ满分 */
  function dimensions(exam, opts) {
    var list = answersOf(exam, opts);
    var map = {};
    list.forEach(function (a) {
      var k = a.dimension || 'other';
      if (!map[k]) map[k] = { key: k, got: 0, full: 0, count: 0 };
      map[k].got += Number(a.gotScore) || 0;
      map[k].full += Number(a.fullScore) || 0;
      map[k].count += 1;
    });
    return Object.keys(map).map(function (k) {
      var d = map[k];
      d.rate = d.full > 0 ? d.got / d.full : null;
      return d;
    });
  }

  function dimRate(exam, dimKey, opts) {
    var ds = dimensions(exam, opts);
    for (var i = 0; i < ds.length; i++) if (ds[i].key === dimKey) return ds[i].rate;
    return null;
  }

  /** 考试按日期升序 */
  function sortExams(exams) {
    return (exams || []).slice().sort(function (a, b) {
      if (a.date === b.date) return (a.createdAt || 0) - (b.createdAt || 0);
      return a.date < b.date ? -1 : 1;
    });
  }

  /** 取最近 N 次（N=0 表示全部），返回升序 */
  function recent(exams, n) {
    var sorted = sortExams(exams);
    if (!n || n <= 0 || n >= sorted.length) return sorted;
    return sorted.slice(sorted.length - n);
  }

  /** 作文档位：优先记录里的 essayLevel，没有就按作文题得分率折算 */
  function essayLevelOf(exam) {
    if (!exam) return null;
    if (exam.essayLevel != null && exam.essayLevel >= 1 && exam.essayLevel <= 5) return Number(exam.essayLevel);
    var essay = (exam.answers || []).filter(function (a) { return a.dimension === 'xiezuo'; });
    if (!essay.length) return null;
    var got = 0, full = 0;
    essay.forEach(function (a) { got += Number(a.gotScore) || 0; full += Number(a.fullScore) || 0; });
    if (full <= 0) return null;
    var scaled = got / full * 50;
    if (scaled >= 45) return 1;
    if (scaled >= 40) return 2;
    if (scaled >= 35) return 3;
    if (scaled >= 30) return 4;
    return 5;
  }

  /** 错因频次：全部考试统计；同时算出最近两次 / 前两次的对比 */
  function tagStats(exams, opts) {
    var sorted = sortExams(exams);
    var tagName = {};
    (YW.state.tagGroups || []).forEach(function (g) {
      (g.tags || []).forEach(function (t) { tagName[t.id] = t.name; });
    });

    var counts = {};
    function bump(tagId, weight) {
      if (!counts[tagId]) counts[tagId] = { id: tagId, name: tagName[tagId] || tagId, count: 0, recent: 0, prev: 0 };
      counts[tagId].count += weight;
    }

    var lastTwo = sorted.slice(-2).map(function (e) { return e.id; });
    var prevTwo = sorted.slice(-4, -2).map(function (e) { return e.id; });

    sorted.forEach(function (exam) {
      answersOf(exam, opts).forEach(function (a) {
        var tags = a.errorTagIds || [];
        if (!tags.length) return;
        tags.forEach(function (tid) {
          bump(tid, 1);
          if (lastTwo.indexOf(exam.id) >= 0) counts[tid].recent += 1;
          else if (prevTwo.indexOf(exam.id) >= 0) counts[tid].prev += 1;
        });
      });
    });

    return Object.keys(counts).map(function (k) { return counts[k]; })
      .sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return String(a.name).localeCompare(String(b.name), 'zh');
      });
  }

  /** 模板所有小题（带所属 section / type） */
  function templateItems(tpl) {
    var out = [];
    if (!tpl || !tpl.sections) return out;
    tpl.sections.forEach(function (sec) {
      (sec.items || []).forEach(function (it) {
        out.push({
          item: it,
          sectionId: sec.id,
          sectionName: sec.name,
          type: it.type || 'written',
          isEssay: it.type === 'essay'
        });
      });
    });
    return out;
  }

  /** 校验模板结构，返回 {ok, errors[]} */
  function validateTemplate(tpl) {
    var errors = [];
    if (!tpl || typeof tpl !== 'object') return { ok: false, errors: ['模板不是对象'] };
    if (!tpl.id) errors.push('缺少 id');
    if (!tpl.name) errors.push('缺少 name');
    if (typeof tpl.totalScore !== 'number') errors.push('totalScore 必须是数字');
    if (!Array.isArray(tpl.sections) || !tpl.sections.length) errors.push('sections 必须是非空数组');
    var sum = 0;
    (tpl.sections || []).forEach(function (sec, si) {
      (sec.items || []).forEach(function (it, ii) {
        var where = '第 ' + (si + 1) + ' 节第 ' + (ii + 1) + ' 项';
        if (!it.id) errors.push(where + '缺 id');
        if (it.no == null || it.no === '') errors.push(where + '缺 no');
        if (typeof it.fullScore !== 'number' || it.fullScore <= 0) errors.push(where + ' fullScore 必须是正数');
        if (!it.dimension) errors.push(where + '缺 dimension');
        else if (DIMENSIONS.map(function (d) { return d.key; }).indexOf(it.dimension) < 0) errors.push(where + ' dimension 不在枚举里：' + it.dimension);
        sum += Number(it.fullScore) || 0;
      });
    });
    return { ok: errors.length === 0, errors: errors, sum: sum };
  }

  function validateTags(doc) {
    var errors = [];
    if (!doc || typeof doc !== 'object') return { ok: false, errors: ['词表不是对象'] };
    if (!Array.isArray(doc.groups)) return { ok: false, errors: ['groups 必须是数组'] };
    doc.groups.forEach(function (g, gi) {
      if (!g.id) errors.push('第 ' + (gi + 1) + ' 组缺 id');
      if (!g.name) errors.push('第 ' + (gi + 1) + ' 组缺 name');
      if (!Array.isArray(g.tags)) errors.push('第 ' + (gi + 1) + ' 组 tags 必须是数组');
      (g.tags || []).forEach(function (t, ti) {
        if (!t.id) errors.push('第 ' + (gi + 1) + ' 组第 ' + (ti + 1) + ' 个标签缺 id');
        if (!t.name) errors.push('第 ' + (gi + 1) + ' 组第 ' + (ti + 1) + ' 个标签缺 name');
      });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  YW.calc = {
    DIMENSIONS: DIMENSIONS,
    RADAR_DIMS: RADAR_DIMS,
    TYPE_NAMES: TYPE_NAMES,
    LEVEL_NAMES: LEVEL_NAMES,
    LEVEL_RANGES: LEVEL_RANGES,
    pct: YW.pct,
    fmt: YW.fmt,
    dimName: dimName,
    dimShort: dimShort,
    answersOf: answersOf,
    totals: totals,
    dimensions: dimensions,
    dimRate: dimRate,
    sortExams: sortExams,
    recent: recent,
    essayLevelOf: essayLevelOf,
    tagStats: tagStats,
    templateItems: templateItems,
    validateTemplate: validateTemplate,
    validateTags: validateTags
  };
})(window.YW);