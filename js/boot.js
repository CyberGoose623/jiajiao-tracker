/* 启动流程 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  function hash(str) {
    var h = 5381, i = str.length;
    while (i) h = (h * 33) ^ str.charCodeAt(--i);
    return (h >>> 0).toString(16) + '-' + str.length;
  }

  function fetchText(path) {
    return fetch(path, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error(path + ' 读取失败（HTTP ' + res.status + '）');
      return res.text();
    });
  }

  /**
   * 外部 JSON 与本地库的同步：
   * 文件内容变了才覆盖本地（这样你改文件刷新就生效），
   * 文件没变就保留应用里改过的版本。
   */
  function syncFile(path, metaKey, applyDoc, describe) {
    return fetchText(path).then(function (text) {
      var h = hash(text);
      return YW.db.getMeta(metaKey, null).then(function (saved) {
        if (saved === h) return { changed: false, hash: h };
        var doc;
        try { doc = JSON.parse(text); } catch (e) {
          throw new Error(path + ' 不是有效 JSON：' + e.message);
        }
        var problem = applyDoc(doc);
        if (problem) throw new Error(path + ' 内容不合格：' + problem);
        return YW.db.setMeta(metaKey, h).then(function () {
          return { changed: true, hash: h };
        });
      });
    }).then(function (r) {
      return { ok: true, changed: r.changed, path: path, label: describe };
    }).catch(function (err) {
      return { ok: false, path: path, label: describe, error: err };
    });
  }

  function applyTemplatesDoc(doc) {
    var list = Array.isArray(doc) ? doc : doc.templates;
    if (!Array.isArray(list) || !list.length) return '没有 templates 数组';
    for (var i = 0; i < list.length; i++) {
      var v = YW.calc.validateTemplate(list[i]);
      if (!v.ok) return (list[i] && list[i].name ? list[i].name + ' ' : '') + v.errors.slice(0, 2).join('；');
    }
    YW.state.templates = list;
    return null;
  }

  function applyTagsDoc(doc) {
    var groups = Array.isArray(doc) ? doc : doc.groups;
    if (!Array.isArray(groups) || !groups.length) return '没有 groups 数组';
    // 兼容 v1：没有 subject 的组一律归到"语文"
    groups = groups.map(function (g) {
      return Object.assign({}, g, { subject: g.subject || '语文' });
    });
    var v = YW.calc.validateTags({ groups: groups });
    if (!v.ok) return v.errors.slice(0, 2).join('；');
    YW.state.tagGroups = groups;
    return null;
  }

  function useFallback() {
    if (!YW.state.templates.length && YW.fallback && YW.fallback.templates) {
      YW.state.templates = YW.clone(YW.fallback.templates);
    }
    if (!YW.state.tagGroups.length && YW.fallback && YW.fallback.tagGroups) {
      YW.state.tagGroups = YW.clone(YW.fallback.tagGroups).map(function (g) {
        return Object.assign({}, g, { subject: g.subject || '语文' });
      });
    }
  }

  /**
   * 老数据迁移：
   * - 没有学生的，建一个默认学生
   * - 考试没有 studentId 的，挂到默认学生
   * - paperImageId（单张）改成 paperImageIds（数组）
   */
  function migrate(exams, mistakes, students) {
    var changed = false;

    if (!students.length) {
      students.push({
        id: 'stu-default',
        name: '学生 1',
        createdAt: Date.now()
      });
      changed = true;
    }
    var defaultId = students[0].id;

    exams.forEach(function (e) {
      if (!e.studentId) { e.studentId = defaultId; changed = true; }
      if (!Array.isArray(e.paperImageIds)) {
        e.paperImageIds = e.paperImageId ? [e.paperImageId] : [];
        changed = true;
      }
    });

    // 记录引用的模板如果已经不在列表里（改过 id、换过文件），
    // 用记录自带的快照补回列表，否则这些考试在分析页里选不到、等于看不见
    var known = {};
    (YW.state.templates || []).forEach(function (t) { known[t.id] = true; });
    exams.forEach(function (e) {
      if (!e.templateId || known[e.templateId]) return;
      if (!e.templateSnapshot || !e.templateSnapshot.sections) return;
      var snap = YW.clone(e.templateSnapshot);
      snap.name = (snap.name || e.templateId) + '（历史）';
      if (!snap.subject) snap.subject = '语文';
      YW.state.templates.push(snap);
      known[e.templateId] = true;
      changed = true;
    });

    mistakes.forEach(function (m) {
      if (m.studentId === undefined) {
        var exam = exams.filter(function (e) { return e.id === m.examId; })[0];
        m.studentId = exam ? exam.studentId : defaultId;
        changed = true;
      }
      if (m.mastered === undefined) { m.mastered = false; changed = true; }
      if (m.resolved === undefined) { m.resolved = false; changed = true; }
    });

    return { changed: changed, defaultId: defaultId };
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(function (err) {
        console.warn('[SW] 注册失败，离线功能不可用：', err && err.message);
      });
    });
  }

  function bindGlobal() {
    YW.ui.bindTheme();

    YW.$('#tabbar').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (!tab) return;
      YW.ui.go(tab.dataset.go);
    });

    // 顶部学生切换
    YW.$('#student-bar').addEventListener('click', function () {
      YW.ui.openStudentPicker();
    });

    // iOS：输入框获得焦点时，确保不被键盘挡住
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      setTimeout(function () {
        var rect = t.getBoundingClientRect();
        var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        if (rect.bottom > vh - 90 || rect.top < 70) {
          t.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }, 260);
    });

    // 阻止双指/双击缩放（Safari 对 user-scalable=no 不完全遵守）
    var lastTouch = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouch < 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });

    // 防止整页被拖动（iOS 橡皮筋）
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
  }

  function renderAll() {
    YW.ui.renderStudentBar();
    YW.entry.refresh();
    YW.analysis.render();
    YW.settings.render();
  }

  function start() {
    registerSW();
    bindGlobal();
    YW.entry.bind();
    YW.analysis.bind();
    YW.settings.bind();

    var dbReady = YW.db.init();

    dbReady.then(function (ok) {
      if (!ok) {
        YW.ui.banner('这台浏览器不允许本地数据库（多为双击 index.html 打开时）。现在可以试用，但刷新后数据会丢。要长期用，请放到 GitHub Pages 或本地起一个 http 服务。');
      }
      return Promise.all([
        YW.db.all('templates'),
        YW.db.all('tagGroups'),
        YW.db.all('exams'),
        YW.db.all('mistakes'),
        YW.db.all('students'),
        YW.db.getMeta('lastBackupAt', null),
        YW.db.getMeta('currentStudentId', null)
      ]);
    }).then(function (res) {
      YW.state.templates = res[0] || [];
      YW.state.tagGroups = res[1] || [];
      YW.state.exams = res[2] || [];
      YW.state.mistakes = res[3] || [];
      YW.state.students = res[4] || [];
      YW.state.settings.lastBackupAt = res[5];

      var savedStudentId = res[6];

      // 外部文件优先（内容变化时）
      return Promise.all([
        syncFile('exam-templates.json', 'sync.templates', applyTemplatesDoc, '试卷模板'),
        syncFile('error-tags.json', 'sync.tags', applyTagsDoc, '错因词表')
      ]).then(function (results) {
        return { results: results, savedStudentId: savedStudentId };
      });
    }).then(function (ctx) {
      var results = ctx.results;
      var failed = results.filter(function (r) { return !r.ok; });
      var changed = results.filter(function (r) { return r.ok && r.changed; });

      if (failed.length) {
        useFallback();
        var why = failed.map(function (r) { return r.label; }).join('、');
        var isFileProtocol = location.protocol === 'file:';
        YW.ui.banner(
          isFileProtocol
            ? '浏览器不允许本地页面读取 ' + why + ' 文件（file:// 限制）。已改用应用内保存的数据' +
              (YW.state.templates.length ? '。' : '和内置预置模板。') +
              ' 放到 GitHub Pages 后这一条会自动消失。'
            : '读取 ' + why + ' 文件失败，已改用应用内保存的数据。检查文件是否在仓库根目录、JSON 格式是否正确。'
        );
      } else if (changed.length) {
        YW.ui.toast('已从文件更新：' + changed.map(function (r) { return r.label; }).join('、'), 3000);
      }

      // 迁移旧数据
      var mig = migrate(YW.state.exams, YW.state.mistakes, YW.state.students);
      var defaultId = mig.defaultId;

      // 恢复上次选中的学生，失效就取第一个
      var current = ctx.savedStudentId;
      var valid = YW.state.students.some(function (s) { return s.id === current; });
      YW.state.currentStudentId = valid ? current : defaultId;

      var writes = [
        YW.db.putMany('students', YW.state.students),
        YW.db.setMeta('currentStudentId', YW.state.currentStudentId)
      ];
      if (YW.state.templates.length) writes.push(YW.db.putMany('templates', YW.state.templates));
      if (YW.state.tagGroups.length) writes.push(YW.db.putMany('tagGroups', YW.state.tagGroups));
      if (mig.changed) {
        writes.push(YW.db.putMany('exams', YW.state.exams));
        writes.push(YW.db.putMany('mistakes', YW.state.mistakes));
      }
      return Promise.all(writes);
    }).then(function () {
      if (!YW.state.templates.length) {
        YW.ui.banner('一个模板都没有，没法录入。去设置页导入 exam-templates.json，或检查仓库根目录里的文件。');
      }
      renderAll();
      YW.ui.renderBackupLine();

      // 备份提醒
      var last = YW.state.settings.lastBackupAt;
      if (YW.state.exams.length && (!last || YW.daysBetween(last, Date.now()) >= 14)) {
        var days = last ? YW.daysBetween(last, Date.now()) : null;
        YW.ui.toast(days == null ? '还没备份过，去设置页导出一份' : '已经 ' + days + ' 天没备份了，Safari 会清本地数据', 4200);
      }
    }).catch(function (err) {
      console.error('[启动失败]', err);
      useFallback();
      if (!YW.state.students.length) {
        YW.state.students = [{ id: 'stu-default', name: '学生 1', createdAt: Date.now() }];
      }
      YW.state.currentStudentId = YW.state.students[0].id;
      renderAll();
      YW.ui.banner('初始化出错：' + (err && err.message ? err.message : '未知错误') + '。可以继续试用，但请检查浏览器是否禁用了本地存储。');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // 给测试用
  YW.boot = { migrate: migrate };
})(window.YW);