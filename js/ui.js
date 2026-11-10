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
    settings: {
      lastBackupAt: null
    },
    view: {
      page: 'entry',
      excludeEssay: false,
      range: 0,
      trendDim: ''
    },
    bannerSuppressed: false
  };

  YW.ui = {
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
        schemaVersion: 1,
        kind: 'yuwen-tracker-backup',
        exportedAt: new Date().toISOString(),
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

      var added = { templates: 0, tagGroups: 0, tagMerged: 0, exams: 0, mistakes: 0, images: 0 };
      var s = YW.state;

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