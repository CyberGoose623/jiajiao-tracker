/* 界面通用：导航、提示、抽屉、编辑弹层、备份 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var toastTimer = null;

  YW.state = {
    templates: [],
    tagGroups: [],
    exams: [],
    mistakes: [],
    students: [],
    currentStudentId: null,
    settings: {
      lastBackupAt: null
    },
    view: {
      page: 'entry',
      excludeEssay: false,
      range: 0,
      trendDim: '',
      templateId: ''
    },
    bannerSuppressed: false
  };

  YW.ui = {
    /* ---------- 主题 ---------- */
    themeMode: function () {
      try { return localStorage.getItem('yuwen-theme') || 'auto'; } catch (e) { return 'auto'; }
    },

    isDark: function () {
      return document.documentElement.getAttribute('data-theme') === 'dark';
    },

    applyTheme: function (mode) {
      var m = mode || 'auto';
      var sysDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var dark = m === 'dark' || (m === 'auto' && sysDark);

      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('yuwen-theme', m); } catch (e) {}

      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#101210' : '#2f6b5e');
      var bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (bar) bar.setAttribute('content', dark ? 'black-translucent' : 'default');

      YW.ui.paintThemeButtons();
      // 图表颜色来自 CSS 变量，切完主题要重画
      if (YW.charts) YW.charts.redrawAll();
    },

    paintThemeButtons: function () {
      var mode = YW.ui.themeMode();
      var seg = YW.$('#theme-seg');
      if (!seg) return;
      YW.$$('.seg-btn', seg).forEach(function (b) {
        var on = b.dataset.themeMode === mode;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var hint = YW.$('#theme-hint');
      if (hint) {
        hint.textContent = mode === 'auto'
          ? '跟随系统时，iPad 切到深色模式会自动跟着变。现在系统是' + (YW.ui.isDark() ? '深色' : '浅色') + '。'
          : (mode === 'dark' ? '固定深色，不看系统设置。' : '固定浅色，不看系统设置。');
      }
    },

    bindTheme: function () {
      var seg = YW.$('#theme-seg');
      if (seg) {
        seg.addEventListener('click', function (e) {
          var btn = e.target.closest('.seg-btn');
          if (!btn) return;
          YW.ui.applyTheme(btn.dataset.themeMode);
        });
      }

      // 系统主题变了，只有在"跟随系统"时才跟着动
      if (window.matchMedia) {
        var mq = window.matchMedia('(prefers-color-scheme: dark)');
        var onChange = function () {
          if (YW.ui.themeMode() === 'auto') YW.ui.applyTheme('auto');
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
      }

      // 首屏脚本已经定过色，这里只把按钮状态和 meta 对齐
      YW.ui.applyTheme(YW.ui.themeMode());
    },

    /* ---------- 学生 ---------- */
    currentStudent: function () {
      var list = YW.state.students || [];
      return list.filter(function (s) { return s.id === YW.state.currentStudentId; })[0] || list[0] || null;
    },

    examsOfCurrentStudent: function () {
      return YW.calc.byStudent(YW.state.exams, YW.state.currentStudentId);
    },

    templatesOfCurrentStudent: function () {
      var ids = YW.calc.templatesOfStudent(YW.state.exams, YW.state.currentStudentId);
      // 该学生用过的排前面，其余按模板列表顺序跟上
      var used = ids.map(function (id) {
        return YW.state.templates.filter(function (t) { return t.id === id; })[0];
      }).filter(Boolean);
      var rest = YW.state.templates.filter(function (t) { return ids.indexOf(t.id) < 0; });
      return used.concat(rest);
    },

    renderStudentBar: function () {
      var s = YW.ui.currentStudent();
      var nameEl = YW.$('#student-bar-name');
      var subEl = YW.$('#student-bar-sub');
      if (!nameEl) return;
      if (!s) {
        nameEl.textContent = '还没有学生';
        subEl.textContent = '';
        return;
      }
      nameEl.textContent = s.name;
      var n = YW.calc.byStudent(YW.state.exams, s.id).length;
      subEl.textContent = n ? n + ' 次考试' : '还没有记录';
      YW.analysis.render();
    },

    switchStudent: function (id) {
      if (!YW.state.students.some(function (s) { return s.id === id; })) return;
      YW.state.currentStudentId = id;
      YW.state.view.templateId = '';
      YW.db.setMeta('currentStudentId', id);
      YW.ui.closeSheet();
      YW.ui.renderStudentBar();
      YW.entry.refresh();
      YW.analysis.render();
      YW.settings.render();
    },

    openStudentPicker: function () {
      var body = YW.el('div');
      var list = YW.state.students || [];

      if (!list.length) {
        body.appendChild(YW.el('p', { class: 'hint', text: '还没有学生。' }));
      }

      list.forEach(function (s) {
        var n = YW.calc.byStudent(YW.state.exams, s.id).length;
        var on = s.id === YW.state.currentStudentId;
        body.appendChild(YW.el('button', {
          type: 'button',
          class: 'student-row' + (on ? ' is-on' : ''),
          onclick: function () { YW.ui.switchStudent(s.id); }
        }, [
          YW.el('span', { class: 'student-name', text: s.name }),
          YW.el('span', { class: 'student-meta', text: n + ' 次考试' }),
          on ? YW.el('span', { class: 'student-check', text: '当前' }) : null
        ]));
      });

      var add = YW.el('button', {
        type: 'button', class: 'btn primary block',
        onclick: function () { YW.ui.closeSheet(); YW.ui.openStudentForm(null); }
      }, ['新建学生']);
      var foot = YW.el('div', { style: 'width:100%' }, [add]);

      YW.ui.openSheet('选择学生', body, [foot]);
    },

    openStudentForm: function (student) {
      var editing = !!student;
      var nameInput = YW.el('input', {
        class: 'control', type: 'text', value: student ? student.name : '',
        placeholder: '学生姓名或代号', autocomplete: 'off'
      });
      var err = YW.el('p', { class: 'hint', style: 'color:#a8452a' });
      var body = YW.el('div', {}, [
        YW.el('div', { class: 'field' }, [
          YW.el('label', { text: '名字' }),
          nameInput
        ]),
        err
      ]);

      var saveBtn = YW.el('button', {
        type: 'button', class: 'btn primary',
        onclick: function () {
          var name = nameInput.value.trim();
          if (!name) { err.textContent = '名字不能空着'; return; }

          if (editing) {
            student.name = name;
            YW.db.put('students', student).then(function () {
              YW.ui.closeSheet();
              YW.ui.renderStudentBar();
              YW.settings.render();
              YW.ui.toast('已改名', 2200);
            });
            return;
          }

          var rec = { id: YW.uid('stu'), name: name, createdAt: Date.now() };
          YW.state.students.push(rec);
          // 先同步切过去，UI 不能等落库
          YW.state.currentStudentId = rec.id;
          YW.state.view.templateId = '';
          YW.ui.closeSheet();
          YW.ui.renderStudentBar();
          YW.entry.refresh();
          YW.analysis.render();
          YW.settings.render();

          YW.db.put('students', rec).then(function () {
            return YW.db.setMeta('currentStudentId', rec.id);
          }).then(function () {
            YW.ui.toast('已新建 ' + name + '，当前已切到这个学生', 3000);
          }).catch(function (err) {
            YW.ui.toast('学生已加上，但保存出错：' + (err && err.message ? err.message : '未知'), 3600);
          });
        }
      }, [editing ? '保存' : '新建并切换']);

      var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
      YW.ui.openSheet(editing ? '改学生名字' : '新建学生', body, [cancel, saveBtn]);
      setTimeout(function () { nameInput.focus(); }, 150);
    },

    go: function (page) {
      YW.state.view.page = page;
      YW.$$('.page').forEach(function (p) { p.hidden = p.dataset.page !== page; });
      YW.$$('.tab').forEach(function (t) {
        var on = t.dataset.go === page;
        t.classList.toggle('is-on', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var scroller = YW.$('#scroller');
      if (scroller) scroller.scrollTop = 0;
      if (page === 'analysis' && YW.analysis) YW.analysis.render();
      if (page === 'settings' && YW.settings && YW.settings.render) YW.settings.render();
      if (page === 'entry' && YW.entry && YW.entry.refresh) YW.entry.refresh();
    },

    toast: function (msg, ms) {
      var t = YW.$('#toast');
      if (!t) return;
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
    },

    banner: function (msg, opts) {
      var b = YW.$('#banner');
      var txt = YW.$('#banner-text');
      if (!b || !txt) return;
      if (!msg) { b.hidden = true; return; }
      txt.textContent = msg;
      b.hidden = false;
      YW.$('#banner-close').onclick = function () { b.hidden = true; };
    },

    /* ---------- 抽屉 ---------- */
    openSheet: function (title, bodyNode, footNodes) {
      var bd = YW.$('#sheet-backdrop');
      YW.$('#sheet-title').textContent = title;
      var body = YW.$('#sheet-body');
      var foot = YW.$('#sheet-foot');
      body.innerHTML = '';
      if (bodyNode) body.appendChild(bodyNode);
      foot.innerHTML = '';
      (footNodes || []).forEach(function (n) { foot.appendChild(n); });
      bd.hidden = false;
      document.body.style.overflow = 'hidden';
      YW.$('#sheet-close').onclick = YW.ui.closeSheet;
      bd.onclick = function (e) { if (e.target === bd) YW.ui.closeSheet(); };
    },

    closeSheet: function () {
      YW.$('#sheet-backdrop').hidden = true;
      document.body.style.overflow = '';
    },

    openPhoto: function (url, title) {
      var img = YW.el('img', { src: url, alt: title || '试卷照片', class: 'photo-full' });
      YW.ui.openSheet(title || '试卷照片', YW.el('div', { class: 'photo-full-wrap' }, [img]), []);
    },

    /* 带文本框的确认弹层：用于导出前命名等 */
    prompt: function (title, message, defaultValue, onConfirm) {
      var input = YW.el('input', { class: 'control', type: 'text', value: defaultValue || '' });
      var wrap = YW.el('div', {}, [
        YW.el('p', { class: 'hint', text: message || '' }),
        YW.el('div', { class: 'field', style: 'margin-top:10px' }, [input])
      ]);
      var ok = YW.el('button', {
        type: 'button', class: 'btn primary',
        onclick: function () { YW.ui.closeSheet(); onConfirm(input.value); }
      }, ['确定']);
      var cancel = YW.el('button', { type: 'button', class: 'btn', onclick: YW.ui.closeSheet }, ['取消']);
      YW.ui.openSheet(title, wrap, [cancel, ok]);
      setTimeout(function () { input.focus(); }, 120);
    },

    /* ---------- 备份提醒 ---------- */
    renderBackupLine: function () {
      var line = YW.$('#backup-line');
      if (!line) return;
      var last = YW.state.settings.lastBackupAt;
      if (!last) {
        line.textContent = '还没有备份过，建议现在导出一份。';
        line.classList.add('stale');
        return;
      }
      var days = YW.daysBetween(last, Date.now());
      var when = new Date(last);
      var str = when.getFullYear() + '-' + String(when.getMonth() + 1).padStart(2, '0') + '-' + String(when.getDate()).padStart(2, '0');
      if (days >= 14) {
        line.textContent = '上次备份 ' + str + '，已经 ' + days + ' 天了。';
        line.classList.add('stale');
      } else {
        line.textContent = '上次备份 ' + str + '（' + days + ' 天前）。';
        line.classList.remove('stale');
      }
    },

    /* ---------- 全量备份导出 ---------- */
    exportAll: function (withPhotos) {
      var s = YW.state;
      var payload = {
        schemaVersion: 2,
        kind: 'yuwen-tracker-backup',
        exportedAt: new Date().toISOString(),
        students: s.students,
        templates: s.templates,
        tagGroups: s.tagGroups,
        exams: s.exams,
        mistakes: s.mistakes
      };
      var p = withPhotos
        ? YW.photos.exportAll().then(function (imgs) { payload.images = imgs; })
        : Promise.resolve();

      return p.then(function () {
        var name = '语文数据-备份-' + YW.todayISO() + '.json';
        YW.download(name, JSON.stringify(payload, null, 2));
        var now = Date.now();
        YW.state.settings.lastBackupAt = now;
        return YW.db.setMeta('lastBackupAt', now).then(function () {
          YW.ui.renderBackupLine();
          YW.ui.toast('已导出 ' + name);
        });
      }).catch(function (err) {
        YW.ui.toast('导出失败：' + (err && err.message ? err.message : '未知错误'), 4000);
      });
    },

    /* ---------- 全量备份导入（按 id 去重合并） ---------- */
    importAll: function (raw) {
      var data;
      try { data = JSON.parse(raw); } catch (e) {
        YW.ui.toast('这个文件不是有效 JSON', 3200); return Promise.resolve();
      }
      if (!data || !Array.isArray(data.exams) && !Array.isArray(data.templates)) {
        YW.ui.toast('文件里没找到考试记录或模板', 3200); return Promise.resolve();
      }

      var added = { students: 0, templates: 0, tagGroups: 0, tagMerged: 0, exams: 0, mistakes: 0, images: 0 };
      var s = YW.state;

      // 学生：同 id 跳过
      (data.students || []).forEach(function (st) {
        if (!st || !st.id) return;
        if (s.students.some(function (x) { return x.id === st.id; })) return;
        s.students.push(st); added.students++;
      });

      // 模板：同 id 跳过（保留本地）
      (data.templates || []).forEach(function (t) {
        if (!t || !t.id) return;
        if (s.templates.some(function (x) { return x.id === t.id; })) return;
        s.templates.push(t); added.templates++;
      });

      // 错因：同组 id 合并标签
      (data.tagGroups || []).forEach(function (g) {
        if (!g || !g.id) return;
        var local = s.tagGroups.filter(function (x) { return x.id === g.id; })[0];
        if (!local) { s.tagGroups.push(g); added.tagGroups++; return; }
        (g.tags || []).forEach(function (t) {
          if (!t || !t.id) return;
          if (local.tags.some(function (x) { return x.id === t.id; })) return;
          local.tags.push(t); added.tagMerged++;
        });
      });

      (data.exams || []).forEach(function (e) {
        if (!e || !e.id) return;
        if (s.exams.some(function (x) { return x.id === e.id; })) return;
        s.exams.push(e); added.exams++;
      });

      (data.mistakes || []).forEach(function (m) {
        if (!m || !m.id) return;
        if (s.mistakes.some(function (x) { return x.id === m.id; })) return;
        s.mistakes.push(m); added.mistakes++;
      });

      var tasks = [
        YW.db.putMany('templates', s.templates),
        YW.db.putMany('tagGroups', s.tagGroups),
        YW.db.putMany('exams', s.exams),
        YW.db.putMany('mistakes', s.mistakes)
      ];
      if (Array.isArray(data.images) && data.images.length) {
        tasks.push(YW.photos.importAll(data.images).then(function (n) { added.images = n; }));
      }

      return Promise.all(tasks).then(function () {
        YW.entry.refresh();
        YW.analysis.render();
        YW.settings.render();
        var msg = '导入完成：考试 ' + added.exams + ' 条，模板 ' + added.templates + ' 个，错因组 ' + added.tagGroups +
          ' 个' + (added.tagMerged ? '（合并标签 ' + added.tagMerged + ' 个）' : '') +
          '，错题 ' + added.mistakes + ' 条' + (added.images ? '，照片 ' + added.images + ' 张' : '') + '。';
        YW.ui.toast(msg, 4200);
      }).catch(function (err) {
        YW.ui.toast('导入出错：' + (err && err.message ? err.message : '未知错误'), 4200);
      });
    }
  };
})(window.YW);