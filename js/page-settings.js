/* 设置页 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var C = YW.calc;

  function render() {
    renderStudents();
    renderOverview();
    renderTemplates();
    renderTags();
    YW.ui.renderBackupLine();
    YW.$('#mistake-count').textContent = '当前学生 ' +
      (YW.state.mistakes.filter(function (m) {
        return m.studentId === YW.state.currentStudentId;
      }).length) + ' 条';
    YW.$('#about-line').textContent =
      '纯前端 · 无后端 · 数据只在本机（IndexedDB）' +
      (YW.db.isDegraded() ? ' · 当前是内存模式，重启会丢' : '');
  }

  /* ---------- 学生 ---------- */
  function renderStudents() {
    var host = YW.$('#student-list');
    if (!host) return;
    host.innerHTML = '';

    (YW.state.students || []).forEach(function (s) {
      var n = C.byStudent(YW.state.exams, s.id).length;
      var on = s.id === YW.state.currentStudentId;
      host.appendChild(YW.el('div', { class: 'manage-row' }, [
        YW.el('div', { class: 'manage-main' }, [
          YW.el('div', { class: 'manage-name', text: s.name + (on ? '（当前）' : '') }),
          YW.el('div', { class: 'manage-meta', text: n + ' 次考试' })
        ]),
        YW.el('button', {
          type: 'button', class: 'mini-btn',
          onclick: function () { YW.ui.openStudentForm(s); }
        }, ['改名']),
        YW.el('button', {
          type: 'button', class: 'mini-btn',
          onclick: function () { confirmDeleteStudent(s); }
        }, ['删除'])
      ]));
    });

    if (!YW.state.students.length) {
      host.appendChild(YW.el('p', { class: 'hint', text: '还没有学生。' }));
    }
  }

  function confirmDeleteStudent(s) {
    var n = C.byStudent(YW.state.exams, s.id).length;
    var body = YW.el('div', {}, [
      YW.el('p', { text: '删除学生「' + s.name + '」？' }),
      YW.el('p', {
        class: 'hint',
        style: 'margin-top:8px',
        text: n ? '这个学生名下有 ' + n + ' 次考试记录，删学生会把记录一起删掉。想留记录就别删。' : '这个学生没有考试记录。'
      })
    ]);
    var ok = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () {
        var exams = C.byStudent(YW.state.exams, s.id);
        var relMistakes = YW.state.mistakes.filter(function (m) { return m.studentId === s.id; });
        YW.state.students = YW.state.students.filter(function (x) { return x.id !== s.id; });
        YW.state.exams = YW.state.exams.filter(function (e) { return e.studentId !== s.id; });
        YW.state.mistakes = YW.state.mistakes.filter(function (m) { return m.studentId !== s.id; });

        Promise.all([
          YW.db.del('students', s.id),
          YW.db.putMany('exams', YW.state.exams),
          YW.db.putMany('mistakes', YW.state.mistakes),
          Promise.all(relMistakes.map(function (m) { return YW.db.del('mistakes', m.id); })),
          Promise.all(exams.map(function (e) {
            return (e.paperImageIds || []).map(function (pid) { return YW.photos.remove(pid).catch(function () {}); });
          }))
        ]).then(function () {
          if (!YW.state.students.length) {
            var rec = { id: 'stu-default', name: '学生 1', createdAt: Date.now() };
            YW.state.students = [rec];
            YW.state.currentStudentId = rec.id;
            return YW.db.put('students', rec);
          }
          if (YW.state.currentStudentId === s.id) {
            YW.state.currentStudentId = YW.state.students[0].id;
          }
          return Promise.resolve();
        }).then(function () {
          return YW.db.setMeta('currentStudentId', YW.state.currentStudentId);
        }).then(function () {
          YW.ui.closeSheet();
          YW.ui.renderStudentBar();
          YW.entry.refresh();
          YW.analysis.render();
          render();
          YW.ui.toast('已删除学生', 2400);
        });
      }
    }, ['确认删除']);
    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['算了']);
    YW.ui.openSheet('删除学生', body, [cancel, ok]);
  }

  function renderOverview() {
    var host = YW.$('#overview-list');
    if (!host) return;
    var mine = C.byStudent(YW.state.exams, YW.state.currentStudentId);
    var newest = C.sortExams(mine).slice(-1)[0];
    var cells = [
      { k: '学生数', v: String(YW.state.students.length) },
      { k: '当前学生考试', v: String(mine.length) },
      { k: '试卷模板', v: String(YW.state.templates.length) },
      { k: '错因标签', v: String(countTags()) },
      { k: '最近一次', v: newest ? newest.date.slice(5) : '—' }
    ];
    host.innerHTML = cells.map(function (c) {
      return '<li><div class="k">' + YW.escapeHTML(c.k) + '</div><div class="v">' + YW.escapeHTML(c.v) + '</div></li>';
    }).join('');
  }

  function countTags() {
    return (YW.state.tagGroups || []).reduce(function (a, g) { return a + (g.tags || []).length; }, 0);
  }

  /* ---------- 模板列表 ---------- */
  function renderTemplates() {
    var host = YW.$('#template-list');
    if (!host) return;
    host.innerHTML = '';
    YW.$('#tpl-count').textContent = '共 ' + YW.state.templates.length + ' 个';

    YW.state.templates.forEach(function (t) {
      var items = C.templateItems(t).length;
      var sum = C.templateItems(t).reduce(function (a, e) { return a + (Number(e.item.fullScore) || 0); }, 0);
      var mismatch = sum !== t.totalScore;
      host.appendChild(YW.el('div', { class: 'manage-row' }, [
        YW.el('div', { class: 'manage-main' }, [
          YW.el('div', { class: 'manage-name', text: t.name }),
          YW.el('div', {
            class: 'manage-meta',
            text: (t.subject || '未分科目') + ' · ' + items + ' 道题 · ' +
              (mismatch ? '满分合计 ' + YW.fmt(sum) + '，标题写 ' + YW.fmt(t.totalScore) : '总分 ' + YW.fmt(t.totalScore))
          })
        ]),
        YW.el('button', {
          type: 'button', class: 'mini-btn',
          onclick: function () { openTemplateForm(t); }
        }, ['编辑']),
        YW.el('button', {
          type: 'button', class: 'mini-btn',
          onclick: function () { confirmDeleteTemplate(t); }
        }, ['删除'])
      ]));
    });

    if (!YW.state.templates.length) {
      host.appendChild(YW.el('p', { class: 'hint', text: '还没有模板。' }));
    }
  }

  /* ---------- 删除模板 ---------- */
  function confirmDeleteTemplate(tpl) {
    var n = YW.state.exams.filter(function (e) { return e.templateId === tpl.id; }).length;
    var isDefault = tpl.id === 'tpl-xa-g7-yuwen';

    var body = YW.el('div', {}, [
      YW.el('p', { text: '删除模板「' + tpl.name + '」？' }),
      YW.el('p', {
        class: 'hint',
        style: 'margin-top:8px',
        text: n
          ? '这个模板下有 ' + n + ' 次考试记录。删模板不会删记录，但那些记录在分析页会归到一个自动补的「历史」模板里，还看得见。'
          : '这个模板还没有考试记录，删了不影响任何数据。'
      }),
      isDefault
        ? YW.el('p', {
            class: 'hint',
            style: 'margin-top:8px;color:#a8452a',
            text: '注意：这是仓库自带的默认模板。删掉之后刷新页面，它会从 exam-templates.json 重新回来。想永久去掉，得改那个文件。'
          })
        : null
    ]);

    var ok = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () {
        YW.state.templates = YW.state.templates.filter(function (x) { return x.id !== tpl.id; });
        YW.db.putMany('templates', YW.state.templates).then(function () {
          // 当前选中的模板被删了，重选一个
          if (YW.state.view.templateId === tpl.id) YW.state.view.templateId = '';
          if (YW.entry.state && YW.entry.state.templateId === tpl.id) {
            YW.entry.state.templateId = '';
            YW.entry.state.builtTemplateId = null;
          }
          YW.ui.closeSheet();
          YW.entry.refresh();
          YW.analysis.render();
          render();
          YW.ui.toast('模板已删除', 2600);
        }).catch(function (err) {
          YW.ui.toast('删除失败：' + (err && err.message ? err.message : '未知'), 3200);
        });
      }
    }, ['确认删除']);
    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['算了']);
    YW.ui.openSheet('删除模板', body, [cancel, ok]);
  }

  /* ---------- 模板表单编辑器 ---------- */
  function openTemplateForm(tpl) {
    var editing = !!tpl;
    var work = editing
      ? YW.clone(tpl)
      : {
          id: YW.uid('tpl'),
          name: '西安-初中-语文',
          subject: '语文',
          totalScore: 0,
          duration: 120,
          note: '',
          sections: [{ id: YW.uid('sec'), name: '一、题目', items: [] }]
        };

    if (!work.subject) work.subject = '语文';
    if (!Array.isArray(work.sections) || !work.sections.length) {
      work.sections = [{ id: YW.uid('sec'), name: '一、题目', items: [] }];
    }

    var bodyHost = YW.el('div');
    var errBox = YW.el('p', { class: 'hint', style: 'color:#a8452a' });

    function sumOf() {
      var s = 0;
      work.sections.forEach(function (sec) {
        (sec.items || []).forEach(function (it) { s += Number(it.fullScore) || 0; });
      });
      return s;
    }

    function rerender() {
      bodyHost.innerHTML = '';

      var nameInput = YW.el('input', { class: 'control', type: 'text', value: work.name });
      nameInput.addEventListener('input', function () { work.name = nameInput.value; });

      var subjectInput = YW.el('input', { class: 'control', type: 'text', value: work.subject, placeholder: '语文' });
      subjectInput.addEventListener('input', function () { work.subject = subjectInput.value.trim(); });

      var durInput = YW.el('input', { class: 'control', type: 'text', inputmode: 'numeric', value: String(work.duration || '') });
      durInput.addEventListener('input', function () { work.duration = Number(durInput.value) || 0; });

      var noteInput = YW.el('input', { class: 'control', type: 'text', value: work.note || '' });
      noteInput.addEventListener('input', function () { work.note = noteInput.value; });

      bodyHost.appendChild(YW.el('div', { class: 'field-grid' }, [
        YW.el('div', { class: 'field' }, [YW.el('label', { text: '模板名' }), nameInput]),
        YW.el('div', { class: 'field' }, [YW.el('label', { text: '科目' }), subjectInput]),
        YW.el('div', { class: 'field' }, [YW.el('label', { text: '考试时长（分钟）' }), durInput])
      ]));
      bodyHost.appendChild(YW.el('div', { class: 'field' }, [YW.el('label', { text: '备注' }), noteInput]));

      var sum = sumOf();
      bodyHost.appendChild(YW.el('div', { class: 'sum-line' }, [
        YW.el('span', { text: '小题满分合计' }),
        YW.el('strong', { text: YW.fmt(sum) }),
        sum !== work.totalScore
          ? YW.el('button', {
              type: 'button', class: 'mini-btn',
              onclick: function () { work.totalScore = sum; rerender(); }
            }, ['把总分设成 ' + YW.fmt(sum)])
          : YW.el('span', { class: 'hint', text: '与总分一致' })
      ]));

      work.sections.forEach(function (sec, si) {
        var secName = YW.el('input', { class: 'control', type: 'text', value: sec.name || '' });
        secName.addEventListener('input', function () { sec.name = secName.value; });

        var itemBox = YW.el('div', { class: 'edit-items' });

        (sec.items || []).forEach(function (it, ii) {
          var noIn = YW.el('input', { class: 'control tiny', type: 'text', value: it.no || '', 'aria-label': '题号' });
          noIn.addEventListener('input', function () { it.no = noIn.value; });

          var labelIn = YW.el('input', { class: 'control tiny grow', type: 'text', value: it.label || '', 'aria-label': '考什么' });
          labelIn.addEventListener('input', function () { it.label = labelIn.value; });

          var scoreIn = YW.el('input', { class: 'control tiny', type: 'text', inputmode: 'decimal', value: YW.fmt(it.fullScore), 'aria-label': '满分' });
          scoreIn.addEventListener('input', function () {
            var v = YW.parseScore(scoreIn.value);
            it.fullScore = isNaN(v) ? 0 : v;
          });

          var dimSel = YW.el('select', { class: 'control tiny', 'aria-label': '维度' });
          C.DIMENSIONS.forEach(function (d) {
            var opt = YW.el('option', { value: d.key }, [d.short]);
            dimSel.appendChild(opt);
          });
          dimSel.value = it.dimension || 'jilei';
          dimSel.addEventListener('change', function () { it.dimension = dimSel.value; });

          var typeSel = YW.el('select', { class: 'control tiny', 'aria-label': '题型' });
          [['choice', '选择'], ['blank', '填空'], ['written', '主观'], ['essay', '作文']].forEach(function (pair) {
            typeSel.appendChild(YW.el('option', { value: pair[0] }, [pair[1]]));
          });
          typeSel.value = it.type || 'written';
          typeSel.addEventListener('change', function () { it.type = typeSel.value; });

          itemBox.appendChild(YW.el('div', { class: 'edit-item' }, [
            noIn, labelIn, scoreIn, dimSel, typeSel,
            YW.el('button', {
              type: 'button', class: 'mini-btn', 'aria-label': '删除这道题',
              onclick: function () {
                sec.items.splice(ii, 1);
                rerender();
              }
            }, ['删'])
          ]));
        });

        bodyHost.appendChild(YW.el('div', { class: 'edit-section' }, [
          YW.el('div', { class: 'edit-section-head' }, [
            secName,
            YW.el('button', {
              type: 'button', class: 'mini-btn',
              onclick: function () {
                work.sections.splice(si, 1);
                if (!work.sections.length) {
                  work.sections.push({ id: YW.uid('sec'), name: '一、题目', items: [] });
                }
                rerender();
              }
            }, ['删本节'])
          ]),
          itemBox,
          YW.el('button', {
            type: 'button', class: 'btn ghost small block',
            onclick: function () {
              if (!sec.items) sec.items = [];
              sec.items.push({
                id: YW.uid('i'),
                no: String(sec.items.length + 1),
                fullScore: 2,
                dimension: 'jilei',
                type: 'written',
                label: ''
              });
              rerender();
            }
          }, ['+ 加一道题'])
        ]));
      });

      bodyHost.appendChild(YW.el('button', {
        type: 'button', class: 'btn ghost block',
        onclick: function () {
          work.sections.push({ id: YW.uid('sec'), name: '新的部分', items: [] });
          rerender();
        }
      }, ['+ 加一个部分']));

      bodyHost.appendChild(errBox);
    }

    rerender();

    var saveBtn = YW.el('button', {
      type: 'button', class: 'btn primary',
      onclick: function () {
        var errs = [];
        if (!work.name.trim()) errs.push('模板名不能空');
        if (!work.subject) errs.push('科目不能空');
        var itemIds = {};
        work.sections.forEach(function (sec) {
          if (!sec.name.trim()) errs.push('有个部分没写名字');
          (sec.items || []).forEach(function (it) {
            if (!String(it.no || '').trim()) errs.push('有题目没填题号');
            if (!(Number(it.fullScore) > 0)) errs.push('第 ' + (it.no || '?') + ' 题满分必须是正数');
            if (itemIds[it.id]) errs.push('小题 id 重复：' + it.id);
            itemIds[it.id] = true;
          });
        });
        work.totalScore = sumOf();
        if (!work.totalScore) errs.push('还没加任何题目');

        if (errs.length) {
          errBox.textContent = errs.slice(0, 3).join('；');
          return;
        }

        var idx = YW.state.templates.findIndex(function (t) { return t.id === work.id; });
        if (idx >= 0) YW.state.templates[idx] = work;
        else YW.state.templates.push(work);

        YW.db.putMany('templates', YW.state.templates).then(function () {
          YW.ui.closeSheet();
          YW.entry.refresh();
          YW.analysis.render();
          render();
          YW.ui.toast(editing ? '模板已保存' : '已新建模板：' + work.name, 3000);
        }).catch(function (err) {
          YW.ui.toast('保存失败：' + (err && err.message ? err.message : '未知'), 3200);
        });
      }
    }, ['保存模板']);

    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
    YW.ui.openSheet(editing ? '编辑模板' : '新建模板', bodyHost, [cancel, saveBtn]);
  }

  /* ---------- 错因词表 ---------- */
  function renderTags() {
    var host = YW.$('#tag-list');
    if (!host) return;
    host.innerHTML = '';
    YW.$('#tag-count').textContent = '共 ' + countTags() + ' 个标签';

    var subjects = {};
    (YW.state.tagGroups || []).forEach(function (g) {
      var s = g.subject || '语文';
      if (!subjects[s]) subjects[s] = [];
      subjects[s].push(g);
    });

    Object.keys(subjects).forEach(function (subj) {
      var box = YW.el('div', { class: 'subject-block' }, [
        YW.el('div', { class: 'subject-head' }, [
          YW.el('span', { class: 'subject-name', text: subj }),
          YW.el('span', { class: 'subject-acts' }, [
            YW.el('button', {
              type: 'button', class: 'mini-btn',
              onclick: function () { openTagForm(subj, null); }
            }, ['加分组']),
            YW.el('button', {
              type: 'button', class: 'mini-btn',
              onclick: function () { confirmDeleteSubject(subj); }
            }, ['删整科'])
          ])
        ])
      ]);
      subjects[subj].forEach(function (g) {
        box.appendChild(YW.el('div', { class: 'manage-row' }, [
          YW.el('div', { class: 'manage-main' }, [
            YW.el('div', { class: 'manage-name', text: g.name }),
            YW.el('div', { class: 'manage-meta', text: (g.tags || []).length + ' 个标签：' + (g.tags || []).map(function (t) { return t.name; }).join('、') })
          ]),
          YW.el('button', {
            type: 'button', class: 'mini-btn',
            onclick: function () { openTagForm(subj, g); }
          }, ['编辑']),
          YW.el('button', {
            type: 'button', class: 'mini-btn',
            onclick: function () { confirmDeleteTagGroup(g); }
          }, ['删除'])
        ]));
      });
      host.appendChild(box);
    });

    if (!Object.keys(subjects).length) {
      host.appendChild(YW.el('p', { class: 'hint', text: '还没有错因标签。' }));
    }
  }

  function openTagForm(subject, group) {
    var editing = !!group;
    var work = editing
      ? YW.clone(group)
      : { id: YW.uid('g'), subject: subject, name: '', tags: [] };
    if (!work.subject) work.subject = subject;

    var bodyHost = YW.el('div');
    var errBox = YW.el('p', { class: 'hint', style: 'color:#a8452a' });

    function rerender() {
      bodyHost.innerHTML = '';

      var nameInput = YW.el('input', { class: 'control', type: 'text', value: work.name || '', placeholder: '分组名，如 文言文' });
      nameInput.addEventListener('input', function () { work.name = nameInput.value; });

      var subjInput = YW.el('input', { class: 'control', type: 'text', value: work.subject || subject, placeholder: '科目，如 语文' });
      subjInput.addEventListener('input', function () { work.subject = subjInput.value.trim(); });

      bodyHost.appendChild(YW.el('div', { class: 'field-grid' }, [
        YW.el('div', { class: 'field' }, [YW.el('label', { text: '分组名' }), nameInput]),
        YW.el('div', { class: 'field' }, [YW.el('label', { text: '属于哪个科目' }), subjInput])
      ]));

      var cloud = YW.el('div', { class: 'tag-cloud' });
      work.tags.forEach(function (t, ti) {
        cloud.appendChild(YW.el('span', { class: 'tag-chip editing' }, [
          document.createTextNode(t.name),
          YW.el('button', {
            type: 'button', class: 'chip-del', 'aria-label': '删除 ' + t.name,
            onclick: function () {
              work.tags.splice(ti, 1);
              rerender();
            }
          }, ['×'])
        ]));
      });
      bodyHost.appendChild(YW.el('div', { class: 'tag-group' }, [
        YW.el('h3', { text: '标签（点 × 删掉）' }),
        cloud
      ]));

      var newInput = YW.el('input', { class: 'control', type: 'text', placeholder: '新标签名，如 虚词用法不清' });
      var addBtn = YW.el('button', {
        type: 'button', class: 'btn',
        onclick: function () {
          var n = newInput.value.trim();
          if (!n) return;
          if (work.tags.some(function (t) { return t.name === n; })) {
            errBox.textContent = '已经有叫「' + n + '」的标签了';
            return;
          }
          work.tags.push({ id: YW.uid('t'), name: n });
          newInput.value = '';
          rerender();
        }
      }, ['加上']);
      bodyHost.appendChild(YW.el('div', { class: 'add-row' }, [newInput, addBtn]));
      bodyHost.appendChild(errBox);
    }

    rerender();

    var saveBtn = YW.el('button', {
      type: 'button', class: 'btn primary',
      onclick: function () {
        if (!work.name.trim()) { errBox.textContent = '分组名不能空'; return; }
        if (!work.tags.length) { errBox.textContent = '至少要有一个标签'; return; }

        var idx = YW.state.tagGroups.findIndex(function (g) { return g.id === work.id; });
        if (idx >= 0) YW.state.tagGroups[idx] = work;
        else YW.state.tagGroups.push(work);

        YW.db.putMany('tagGroups', YW.state.tagGroups).then(function () {
          YW.ui.closeSheet();
          YW.entry.refresh();
          YW.analysis.render();
          render();
          YW.ui.toast(editing ? '分组已保存' : '已新建分组', 2600);
        });
      }
    }, ['保存']);

    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
    YW.ui.openSheet(editing ? '编辑错因分组' : '新建错因分组', bodyHost, [cancel, saveBtn]);
  }

  /* ---------- 删除错因 ---------- */
  function countTagUsage(tagIds) {
    var n = 0;
    (YW.state.exams || []).forEach(function (e) {
      (e.answers || []).forEach(function (a) {
        if ((a.errorTagIds || []).some(function (id) { return tagIds.indexOf(id) >= 0; })) n++;
      });
    });
    return n;
  }

  function confirmDeleteTagGroup(g) {
    var ids = (g.tags || []).map(function (t) { return t.id; });
    var used = countTagUsage(ids);

    var body = YW.el('div', {}, [
      YW.el('p', { text: '删除分组「' + g.name + '」和里面 ' + ids.length + ' 个标签？' }),
      YW.el('p', {
        class: 'hint',
        style: 'margin-top:8px',
        text: used
          ? '有 ' + used + ' 道题用过这些标签。考试记录不会删，但那些题上的错因标签会变成失效 id，统计里不再显示。'
          : '还没有题目用过这些标签，删了不影响任何数据。'
      })
    ]);

    var ok = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () {
        YW.state.tagGroups = YW.state.tagGroups.filter(function (x) { return x.id !== g.id; });
        YW.db.putMany('tagGroups', YW.state.tagGroups).then(function () {
          YW.ui.closeSheet();
          YW.entry.refresh();
          YW.analysis.render();
          render();
          YW.ui.toast('分组已删除', 2600);
        }).catch(function (err) {
          YW.ui.toast('删除失败：' + (err && err.message ? err.message : '未知'), 3200);
        });
      }
    }, ['确认删除']);
    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['算了']);
    YW.ui.openSheet('删除错因分组', body, [cancel, ok]);
  }

  function confirmDeleteSubject(subj) {
    var groups = YW.state.tagGroups.filter(function (g) { return (g.subject || '语文') === subj; });
    var ids = [];
    groups.forEach(function (g) { (g.tags || []).forEach(function (t) { ids.push(t.id); }); });
    var used = countTagUsage(ids);

    var body = YW.el('div', {}, [
      YW.el('p', { text: '删除「' + subj + '」这一科的全部错因？' }),
      YW.el('p', {
        class: 'hint',
        style: 'margin-top:8px',
        text: '会删掉 ' + groups.length + ' 个分组、' + ids.length + ' 个标签。' +
          (used ? '有 ' + used + ' 道题用过这些标签，考试记录不删，但标签会失效。' : '还没有题目用过。')
      }),
      YW.el('p', {
        class: 'hint',
        style: 'margin-top:8px',
        text: '模板不用一起删。想连模板一起去，去上面「试卷模板」里删。'
      })
    ]);

    var ok = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () {
        YW.state.tagGroups = YW.state.tagGroups.filter(function (g) {
          return (g.subject || '语文') !== subj;
        });
        YW.db.putMany('tagGroups', YW.state.tagGroups).then(function () {
          YW.ui.closeSheet();
          YW.entry.refresh();
          YW.analysis.render();
          render();
          YW.ui.toast('已删除「' + subj + '」的错因', 2800);
        }).catch(function (err) {
          YW.ui.toast('删除失败：' + (err && err.message ? err.message : '未知'), 3200);
        });
      }
    }, ['确认删除']);
    var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['算了']);
    YW.ui.openSheet('删除一科错因', body, [cancel, ok]);
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
    var list = YW.state.mistakes.filter(function (m) {
      return m.studentId === YW.state.currentStudentId && !m.resolved;
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    var body = YW.el('div');

    if (!list.length) {
      body.appendChild(YW.el('p', { class: 'hint', text: '还没有错题。录完一次考试，失分的题会自动记进来。' }));
    }

    var open = list.filter(function (m) { return !m.mastered; });
    var done = list.filter(function (m) { return m.mastered; });

    function card(m) {
      var exam = YW.state.exams.filter(function (e) { return e.id === m.examId; })[0];
      var tags = tagNames(m.errorTagIds);
      return YW.el('div', { class: 'mistake-card' + (m.mastered ? ' is-mastered' : '') }, [
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
          }, ['看原卷']) : null,
          YW.el('button', {
            type: 'button', class: 'mini-btn',
            onclick: function () { toggleMastered(m, viewMistakes); }
          }, [m.mastered ? '取消已掌握' : '标记已掌握'])
        ])
      ]);
    }

    open.forEach(function (m) { body.appendChild(card(m)); });

    if (done.length) {
      body.appendChild(YW.el('h3', { class: 'detail-h3', style: 'margin-top:16px', text: '已掌握（' + done.length + '）' }));
      done.forEach(function (m) { body.appendChild(card(m)); });
    }

    YW.ui.openSheet('错题本（' + list.length + ' 条）', body, []);
  }

  function toggleMastered(m, rerenderFn) {
    m.mastered = !m.mastered;
    YW.db.put('mistakes', m).then(function () {
      YW.ui.closeSheet();
      if (rerenderFn) rerenderFn();
      render();
    });
  }

  function exportMistakes() {
    var list = YW.state.mistakes.filter(function (m) {
      return m.studentId === YW.state.currentStudentId;
    });
    var student = YW.ui.currentStudent();
    var doc = {
      schemaVersion: 2,
      kind: 'yuwen-mistakes',
      student: student ? student.name : '',
      exportedAt: new Date().toISOString(),
      mistakes: list
    };
    var safeName = (student ? student.name : '错题本').replace(/[\\/:*?"<>|]/g, '');
    YW.download(safeName + '-错题本-' + YW.todayISO() + '.json', JSON.stringify(doc, null, 2));
    YW.ui.toast('已导出 ' + list.length + ' 条错题');
  }

  function clearMistakes() {
    var list = YW.state.mistakes.filter(function (m) { return m.studentId === YW.state.currentStudentId; });
    var body = YW.el('div', {}, [
      YW.el('p', { text: '清空当前学生的错题本？共 ' + list.length + ' 条，考试记录不受影响。' })
    ]);
    var ok = YW.el('button', {
      type: 'button', class: 'btn danger',
      onclick: function () {
        YW.state.mistakes = YW.state.mistakes.filter(function (m) { return m.studentId !== YW.state.currentStudentId; });
        Promise.all([
          YW.db.putMany('mistakes', YW.state.mistakes),
          Promise.all(list.map(function (m) { return YW.db.del('mistakes', m.id); }))
        ]).then(function () {
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
    YW.$('#btn-student-add').addEventListener('click', function () {
      YW.ui.openStudentForm(null);
    });

    YW.$('#btn-export-all').addEventListener('click', function () {
      YW.ui.exportAll(YW.$('#backup-with-photos').checked);
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

    YW.$('#btn-tpl-new').addEventListener('click', function () { openTemplateForm(null); });
    YW.$('#btn-tpl-export').addEventListener('click', function () {
      var doc = { schemaVersion: 2, templates: YW.state.templates };
      YW.download('exam-templates.json', JSON.stringify(doc, null, 2));
      YW.ui.toast('已导出 exam-templates.json');
    });
    YW.$('#btn-tpl-import').addEventListener('click', function () { YW.$('#tpl-import-input').click(); });
    YW.$('#tpl-import-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      YW.readFileText(f).then(importTemplates);
    });

    YW.$('#btn-tag-export').addEventListener('click', function () {
      var doc = { schemaVersion: 2, groups: YW.state.tagGroups };
      YW.download('error-tags.json', JSON.stringify(doc, null, 2));
      YW.ui.toast('已导出 error-tags.json');
    });
    YW.$('#btn-tag-import').addEventListener('click', function () { YW.$('#tag-import-input').click(); });
    YW.$('#tag-import-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      YW.readFileText(f).then(importTags);
    });

    YW.$('#btn-mistake-view').addEventListener('click', viewMistakes);
    YW.$('#btn-mistake-export').addEventListener('click', exportMistakes);
    YW.$('#btn-mistake-clear').addEventListener('click', clearMistakes);
  }

  /* ---------- 导入 ---------- */
  function importTemplates(raw) {
    var doc;
    try { doc = JSON.parse(raw); } catch (e) { YW.ui.toast('不是有效 JSON', 3200); return; }
    var list = Array.isArray(doc) ? doc : doc.templates;
    if (!Array.isArray(list)) { YW.ui.toast('文件里没有 templates 数组', 3200); return; }

    var okList = [], problems = [];
    list.forEach(function (t) {
      var v = C.validateTemplate(t);
      if (v.ok) {
        if (!t.subject) t.subject = '语文';
        okList.push(t);
      } else {
        problems.push((t && t.name ? t.name : '未命名') + '：' + v.errors.slice(0, 2).join('；'));
      }
    });

    if (!okList.length) {
      YW.ui.toast('模板都不合格：' + problems[0], 5000);
      return;
    }

    okList.forEach(function (t) {
      var i = YW.state.templates.findIndex(function (x) { return x.id === t.id; });
      if (i >= 0) YW.state.templates[i] = t;
      else YW.state.templates.push(t);
    });

    YW.db.putMany('templates', YW.state.templates).then(function () {
      YW.entry.refresh();
      YW.analysis.render();
      render();
      YW.ui.toast('已导入 ' + okList.length + ' 个模板' + (problems.length ? '，' + problems.length + ' 个有问题被跳过' : ''), 4000);
    });
  }

  function importTags(raw) {
    var doc;
    try { doc = JSON.parse(raw); } catch (e) { YW.ui.toast('不是有效 JSON', 3200); return; }
    var groups = Array.isArray(doc) ? doc : doc.groups;
    if (!Array.isArray(groups)) { YW.ui.toast('文件里没有 groups 数组', 3200); return; }

    groups = groups.map(function (g) { return Object.assign({}, g, { subject: g.subject || '语文' }); });
    var v = C.validateTags({ groups: groups });
    if (!v.ok) { YW.ui.toast('词表不合格：' + v.errors[0], 4200); return; }

    YW.state.tagGroups = groups;
    YW.db.putMany('tagGroups', groups).then(function () {
      YW.entry.refresh();
      YW.analysis.render();
      render();
      YW.ui.toast('词表已更新', 2600);
    });
  }

  YW.settings = {
    bind: bind,
    render: render,
    openTemplateForm: openTemplateForm,
    openTagForm: openTagForm,
    viewMistakes: viewMistakes
  };
})(window.YW);