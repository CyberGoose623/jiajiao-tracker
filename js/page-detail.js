/* 考试详情 + 错题 */
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

  function photoIdsOf(exam) {
    if (Array.isArray(exam.paperImageIds)) return exam.paperImageIds;
    return exam.paperImageId ? [exam.paperImageId] : [];
  }

  function open(examId) {
    var exam = YW.state.exams.filter(function (e) { return e.id === examId; })[0];
    if (!exam) { YW.ui.toast('找不到这条记录', 2600); return; }

    var opts = { excludeEssay: YW.state.view.excludeEssay };
    var t = C.totals(exam, opts);
    var dims = C.dimensions(exam, opts);
    var tpl = exam.templateSnapshot || {};
    var student = (YW.state.students || []).filter(function (s) { return s.id === exam.studentId; })[0];

    var body = YW.el('div');

    body.appendChild(YW.el('div', { class: 'detail-head' }, [
      YW.el('div', { class: 'detail-title', text: exam.name }),
      YW.el('div', {
        class: 'detail-sub',
        text: (student ? student.name + ' · ' : '') + YW.formatDate(exam.date) + ' · ' + (tpl.name || exam.templateId)
      })
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
        YW.el('div', {
          class: 'v',
          text: (function () {
            var lv = C.essayLevelOf(exam);
            return lv ? C.LEVEL_NAMES[lv] : '—';
          })()
        })
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

    // 试卷照片（可能多张）
    var pids = photoIdsOf(exam);
    if (pids.length) {
      var gallery = YW.el('div', { class: 'detail-gallery' });
      pids.forEach(function (pid, i) {
        var img = YW.el('img', { alt: '试卷照片 ' + (i + 1), class: 'gallery-thumb' });
        gallery.appendChild(img);
        YW.photos.url(pid).then(function (u) {
          if (u) {
            img.src = u;
            img.addEventListener('click', function () { YW.ui.openPhoto(u, '试卷照片 ' + (i + 1) + ' / ' + pids.length); });
          } else {
            img.alt = '照片读不出来';
            img.classList.add('broken');
          }
        });
      });
      body.appendChild(YW.el('div', {}, [
        YW.el('h3', { class: 'detail-h3', text: '试卷照片（' + pids.length + ' 张）' }),
        gallery
      ]));
    } else {
      body.appendChild(YW.el('p', { class: 'hint', style: 'margin-top:12px', text: '这次考试没挂试卷照片。' }));
    }

    // 逐题
    var itemBox = YW.el('div', { style: 'margin-top:16px' });
    itemBox.appendChild(YW.el('h3', { class: 'detail-h3', text: '逐题' }));

    var mistakesOfExam = (YW.state.mistakes || []).filter(function (m) { return m.examId === exam.id; });

    (exam.answers || []).forEach(function (a) {
      var lost = Number(a.gotScore) < Number(a.fullScore);
      var tags = (a.errorTagIds || []).map(tagName);
      var mrec = mistakesOfExam.filter(function (m) { return m.itemId === a.itemId; })[0];

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
        }, [mrec ? '改错题' : '记错题']));
      }

      var mid = YW.el('div', {}, [
        YW.el('div', { style: 'font-size:14px', text: (a.no || '') + ' · ' + findLabel(exam, a.itemId) }),
        tags.length ? YW.el('div', { class: 'item-tags', style: 'margin-top:4px' },
          tags.map(function (n) { return YW.el('span', { class: 'tag-pill', text: n }); })) : null,
        a.note ? YW.el('div', { class: 'hint', style: 'margin-top:4px', text: '备注：' + a.note }) : null,
        mrec && mrec.mastered ? YW.el('div', { class: 'hint', style: 'margin-top:4px', text: '错题已标记掌握' }) : null
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
        var pids = photoIdsOf(exam);
        YW.db.del('exams', exam.id).then(function () {
          YW.state.exams = YW.state.exams.filter(function (e) { return e.id !== exam.id; });
          // 这条考试的错题也一起清掉
          var rel = YW.state.mistakes.filter(function (m) { return m.examId === exam.id; });
          YW.state.mistakes = YW.state.mistakes.filter(function (m) { return m.examId !== exam.id; });
          return Promise.all(rel.map(function (m) { return YW.db.del('mistakes', m.id); }))
            .then(function () {
              return Promise.all(pids.map(function (pid) { return YW.photos.remove(pid).catch(function () {}); }));
            });
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

  /* ---------- 错题 ---------- */
  function openMistakeForm(exam, ans) {
    var existing = (YW.state.mistakes || []).filter(function (m) {
      return m.examId === exam.id && m.itemId === ans.itemId;
    })[0];

    var label = findLabel(exam, ans.itemId) || '';
    var q = YW.el('textarea', { class: 'control', rows: '2', placeholder: '题干或题号摘要' });
    q.value = existing ? existing.question : ('第 ' + ans.no + ' 题 · ' + label);

    var mine = YW.el('textarea', { class: 'control', rows: '2', placeholder: '我答了什么' });
    mine.value = existing ? existing.myAnswer : '';

    var right = YW.el('textarea', { class: 'control', rows: '2', placeholder: '应该怎么答' });
    right.value = existing ? existing.correctAnswer : '';

    var fix = YW.el('textarea', { class: 'control', rows: '2', placeholder: '下次遇到这种题先做什么' });
    fix.value = existing ? existing.howToFix : '';

    var mastered = YW.el('input', { type: 'checkbox' });
    mastered.checked = !!(existing && existing.mastered);

    var body = YW.el('div', {}, [
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '题干摘要' }), q]),
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '我的答案' }), mine]),
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '正确答案' }), right]),
      YW.el('div', { class: 'tag-group' }, [YW.el('h3', { text: '怎么改' }), fix]),
      YW.el('label', { class: 'check-line' }, [mastered, YW.el('span', { text: '这条已经掌握了' })]),
      YW.el('p', {
        class: 'hint',
        text: '错因标签：' + ((ans.errorTagIds || []).map(tagName).join('、') || '没标') +
          '。标签在录入页那道题上改。'
      })
    ]);

    var saveBtn = YW.el('button', {
      type: 'button', class: 'btn primary',
      onclick: function () {
        var rec = Object.assign(existing || {
          id: YW.uid('err'),
          examId: exam.id,
          studentId: exam.studentId || null,
          itemId: ans.itemId,
          auto: false,
          resolved: false,
          createdAt: Date.now()
        }, {
          no: ans.no,
          label: label,
          question: q.value.trim(),
          myAnswer: mine.value.trim(),
          correctAnswer: right.value.trim(),
          errorTagIds: (ans.errorTagIds || []).slice(),
          howToFix: fix.value.trim(),
          mastered: !!mastered.checked
        });

        YW.db.put('mistakes', rec).then(function () {
          var idx = YW.state.mistakes.findIndex(function (m) { return m.id === rec.id; });
          if (idx >= 0) YW.state.mistakes[idx] = rec;
          else YW.state.mistakes.push(rec);
          YW.ui.closeSheet();
          YW.settings.render();
          YW.ui.toast('已存进错题本', 2400);
        }).catch(function (err) {
          YW.ui.toast('保存失败：' + (err && err.message ? err.message : '未知'), 3200);
        });
      }
    }, [existing ? '保存' : '存进错题本']);

    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
    YW.ui.openSheet(existing ? '改错题' : '记错题', body, [cancel, saveBtn]);
  }

  YW.detail = { open: open, openMistakeForm: openMistakeForm };
})(window.YW);