/* 考试详情 + 错题本 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var C = YW.calc;

  function tagName(id) {
    var out = id;
    (YW.state.tagGroups || []).forEach(function (g) {
      (g.tags || []).forEach(function (t) { if (t.id === id) out = t.name; });
    });
    return out;
  }

  function open(examId) {
    var exam = YW.state.exams.filter(function (e) { return e.id === examId; })[0];
    if (!exam) { YW.ui.toast('找不到这条记录', 2600); return; }

    var opts = { excludeEssay: YW.state.view.excludeEssay };
    var t = C.totals(exam, opts);
    var dims = C.dimensions(exam, opts);
    var tpl = exam.templateSnapshot || {};

    var body = YW.el('div');

    body.appendChild(YW.el('div', { class: 'detail-head' }, [
      YW.el('div', { class: 'detail-title', text: exam.name }),
      YW.el('div', { class: 'detail-sub', text: YW.formatDate(exam.date) + ' · ' + (tpl.name || exam.templateId) })
    ]));

    body.appendChild(YW.el('div', { class: 'detail-scores' }, [
      YW.el('div', {}, [
        YW.el('div', { class: 'k', text: opts.excludeEssay ? '得分（排除作文）' : '得分' }),
        YW.el('div', { class: 'v', text: YW.fmt(t.got) + ' / ' + YW.fmt(t.full) })
      ]),
      YW.el('div', {}, [
        YW.el('div', { class: 'k', text: '得分率' }),
        YW.el('div', { class: 'v', text: C.pct(t.rate) })
      ]),
      YW.el('div', {}, [
        YW.el('div', { class: 'k', text: '作文档位' }),
        YW.el('div', { class: 'v', text: (function () {
          var lv = C.essayLevelOf(exam);
          return lv ? C.LEVEL_NAMES[lv] : '—';
        })() })
      ])
    ]));

    // 维度
    var dimTable = YW.el('div', { class: 'dim-table' });
    var order = C.DIMENSIONS.map(function (d) { return d.key; });
    dims.sort(function (a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
    dims.forEach(function (d) {
      if (opts.excludeEssay && d.key === 'xiezuo') return;
      var pct = d.full > 0 ? d.got / d.full : 0;
      dimTable.appendChild(YW.el('div', { class: 'dim-line' }, [
        YW.el('span', { text: C.dimName(d.key) }),
        YW.el('div', { class: 'dim-bar' }, [
          YW.el('i', { class: pct < 0.6 ? 'low' : '', style: 'width:' + Math.round(pct * 100) + '%' })
        ]),
        YW.el('span', { class: 'dim-num', text: YW.pct(pct, 0) })
      ]));
    });
    body.appendChild(dimTable);

    // 照片
    if (exam.paperImageId) {
      var img = YW.el('img', { class: 'detail-photo', alt: '试卷照片' });
      YW.photos.url(exam.paperImageId).then(function (u) {
        if (u) img.src = u;
        else img.alt = '照片读不出来';
      });
      body.appendChild(img);
    }

    // 逐题
    var itemBox = YW.el('div', { style: 'margin-top:16px' });
    itemBox.appendChild(YW.el('h3', { style: 'font-size:13px;color:#7d766a;margin-bottom:6px', text: '逐题' }));

    (exam.answers || []).forEach(function (a) {
      var lost = Number(a.gotScore) < Number(a.fullScore);
      var tags = (a.errorTagIds || []).map(tagName);

      var right = YW.el('div', { class: 'detail-item-acts' }, [
        YW.el('span', {
          class: 'dim-num' + (lost ? ' lost' : ''),
          text: YW.fmt(a.gotScore) + '/' + YW.fmt(a.fullScore)
        })
      ]);

      if (lost) {
        right.appendChild(YW.el('button', {
          type: 'button', class: 'mini-btn warn',
          onclick: function () { openMistakeForm(exam, a); }
        }, ['记错题']));
      }

      var mid = YW.el('div', {}, [
        YW.el('div', { style: 'font-size:14px', text: (a.no || '') + ' · ' + ((exam.templateSnapshot ? findLabel(exam, a.itemId) : '') || '') }),
        tags.length ? YW.el('div', { class: 'item-tags', style: 'margin-top:4px' },
          tags.map(function (n) { return YW.el('span', { class: 'tag-pill', text: n }); })) : null,
        a.note ? YW.el('div', { class: 'hint', style: 'margin-top:4px', text: '备注：' + a.note }) : null
      ]);

      itemBox.appendChild(YW.el('div', { class: 'detail-item' }, [
        YW.el('div', { class: 'no', text: String(a.no || '') }),
        mid,
        right
      ]));
    });
    body.appendChild(itemBox);

    var editBtn = YW.el('button', {
      type: 'button', class: 'btn',
      onclick: function () { YW.ui.closeSheet(); YW.entry.loadExam(exam.id); }
    }, ['修改分数']);
    var delBtn = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () { confirmDelete(exam); }
    }, ['删除']);

    YW.ui.openSheet('考试详情', body, [delBtn, editBtn]);
  }

  function findLabel(exam, itemId) {
    var snap = exam.templateSnapshot;
    if (!snap || !snap.sections) return '';
    for (var i = 0; i < snap.sections.length; i++) {
      var items = snap.sections[i].items || [];
      for (var j = 0; j < items.length; j++) {
        if (items[j].id === itemId) return items[j].label || '';
      }
    }
    return '';
  }

  function confirmDelete(exam) {
    var body = YW.el('div', {}, [
      YW.el('p', { text: '删除《' + exam.name + '》？这条考试的逐题记录和错因会一起没了。' }),
      YW.el('p', { class: 'hint', style: 'margin-top:8px', text: '导出过备份的话还能找回来。' })
    ]);
    var ok = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () {
        YW.db.del('exams', exam.id).then(function () {
          var img = exam.paperImageId;
          YW.state.exams = YW.state.exams.filter(function (e) { return e.id !== exam.id; });
          var p = img ? YW.photos.remove(img) : Promise.resolve();
          return p;
        }).then(function () {
          YW.ui.closeSheet();
          YW.analysis.render();
          YW.settings.render();
          YW.entry.refresh();
          YW.ui.toast('已删除', 2400);
        }).catch(function (err) {
          YW.ui.toast('删除失败：' + (err && err.message ? err.message : '未知'), 3200);
        });
      }
    }, ['确认删除']);
    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['算了']);
    YW.ui.openSheet('删除考试', body, [cancel, ok]);
  }

  /* ---------- 错题本 ---------- */
  function openMistakeForm(exam, ans) {
    var label = findLabel(exam, ans.itemId) || '';
    var q = YW.el('textarea', { class: 'control', rows: '2', placeholder: '题干或题号摘要' });
    q.value = '第 ' + ans.no + ' 题 · ' + label;
    var mine = YW.el('textarea', { class: 'control', rows: '2', placeholder: '我答了什么' });
    var right = YW.el('textarea', { class: 'control', rows: '2', placeholder: '应该怎么答' });
    var fix = YW.el('textarea', { class: 'control', rows: '2', placeholder: '下次遇到这种题先做什么' });

    var body = YW.el('div', {}, [
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '题干摘要' }), q]),
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '我的答案' }), mine]),
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '正确答案' }), right]),
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '怎么改' }), fix]),
      YW.el('p', { class: 'hint', text: '错因标签：' + ((ans.errorTagIds || []).map(tagName).join('、') || '没标') })
    ]);

    var saveBtn = YW.el('button', {
      type: 'button', class: 'btn primary',
      onclick: function () {
        var rec = {
          id: YW.uid('err'),
          examId: exam.id,
          itemId: ans.itemId,
          question: q.value.trim(),
          myAnswer: mine.value.trim(),
          correctAnswer: right.value.trim(),
          errorTagIds: (ans.errorTagIds || []).slice(),
          howToFix: fix.value.trim(),
          createdAt: Date.now()
        };
        YW.db.put('mistakes', rec).then(function () {
          YW.state.mistakes.push(rec);
          YW.ui.closeSheet();
          YW.settings.render();
          YW.ui.toast('已记进错题本', 2400);
        }).catch(function (err) {
          YW.ui.toast('保存失败：' + (err && err.message ? err.message : '未知'), 3200);
        });
      }
    }, ['存进错题本']);

    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
    YW.ui.openSheet('记错题', body, [cancel, saveBtn]);
  }

  YW.detail = { open: open, openMistakeForm: openMistakeForm };
})(window.YW);