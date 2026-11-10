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
      YW.state.tagGroups = YW.clone(YW.fallback.tagGroups);
    }
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
    YW.$('#tabbar').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (!tab) return;
      YW.ui.go(tab.dataset.go);
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
        YW.db.getMeta('lastBackupAt', null)
      ]);
    }).then(function (res) {
      YW.state.templates = res[0] || [];
      YW.state.tagGroups = res[1] || [];
      YW.state.exams = res[2] || [];
      YW.state.mistakes = res[3] || [];
      YW.state.settings.lastBackupAt = res[4];

      // 外部文件优先（内容变化时）
      return Promise.all([
        syncFile('exam-templates.json', 'sync.templates', applyTemplatesDoc, '试卷模板'),
        syncFile('error-tags.json', 'sync.tags', applyTagsDoc, '错因词表')
      ]);
    }).then(function (results) {
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

      // 首次运行：把当前的模板/词表落库
      var writes = [];
      if (YW.state.templates.length) writes.push(YW.db.putMany('templates', YW.state.templates));
      if (YW.state.tagGroups.length) writes.push(YW.db.putMany('tagGroups', YW.state.tagGroups));
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
      renderAll();
      YW.ui.banner('初始化出错：' + (err && err.message ? err.message : '未知错误') + '。可以继续试用，但请检查浏览器是否禁用了本地存储。');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window.YW);