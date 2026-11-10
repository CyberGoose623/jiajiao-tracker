/* IndexedDB 封装
   主数据一律走 IndexedDB；若浏览器不允许（例如 Chrome 下 file:// 双击打开），
   降级到内存存储并在界面上明确告警，绝不静默丢数据。
*/
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var DB_NAME = 'yuwen-tracker';
  var DB_VER = 1;
  var STORES = ['exams', 'mistakes', 'templates', 'tagGroups', 'meta', 'images'];

  var dbPromise = null;
  var degraded = false;
  var mem = null;

  function memStore() {
    if (!mem) {
      mem = {};
      STORES.forEach(function (s) { mem[s] = new Map(); });
    }
    return mem;
  }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req;
      try {
        req = indexedDB.open(DB_NAME, DB_VER);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('exams')) db.createObjectStore('exams', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('mistakes')) db.createObjectStore('mistakes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('templates')) db.createObjectStore('templates', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('tagGroups')) db.createObjectStore('tagGroups', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB 打开失败')); };
      req.onblocked = function () { reject(new Error('IndexedDB 被其他标签页占用')); };
    }).catch(function (err) {
      degraded = true;
      try { console.warn('[存储] IndexedDB 不可用，已降级为内存存储：', err && err.message); } catch (e) {}
      throw err;
    });
    return dbPromise;
  }

  function withStore(name, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(name, mode);
        var store = tx.objectStore(name);
        var out;
        try { out = fn(store); } catch (e) { reject(e); return; }
        tx.oncomplete = function () { resolve(out && out.__value !== undefined ? out.__value : out); };
        tx.onerror = function () { reject(tx.error || new Error('数据库事务失败')); };
        tx.onabort = function () { reject(tx.error || new Error('数据库事务中止')); };
      });
    });
  }

  function wrap(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  /**
   * 统一执行：优先 IndexedDB，异常时降级内存。
   * op(idbFn, memFn)
   */
  function run(idbFn, memFn) {
    if (degraded) return Promise.resolve().then(memFn);
    return Promise.resolve()
      .then(idbFn)
      .catch(function (err) {
        if (!degraded) throw err;
        return memFn();
      });
  }

  YW.db = {
    isDegraded: function () { return degraded; },

    init: function () {
      return open().then(function () { return !degraded; }).catch(function () { return false; });
    },

    all: function (name) {
      return run(
        function () { return withStore(name, 'readonly', function (s) { return wrap(s.getAll()); }); },
        function () { return Array.from(memStore()[name].values()); }
      );
    },

    get: function (name, key) {
      return run(
        function () { return withStore(name, 'readonly', function (s) { return wrap(s.get(key)); }); },
        function () { return memStore()[name].get(key); }
      );
    },

    put: function (name, value) {
      return run(
        function () { return withStore(name, 'readwrite', function (s) { s.put(value); return value; }); },
        function () { memStore()[name].set(value.id !== undefined ? value.id : value.key, value); return value; }
      );
    },

    putMany: function (name, values) {
      if (!values || !values.length) return Promise.resolve([]);
      return run(
        function () {
          return withStore(name, 'readwrite', function (s) {
            values.forEach(function (v) { s.put(v); });
            return values;
          });
        },
        function () {
          var m = memStore()[name];
          values.forEach(function (v) { m.set(v.id !== undefined ? v.id : v.key, v); });
          return values;
        }
      );
    },

    del: function (name, key) {
      return run(
        function () { return withStore(name, 'readwrite', function (s) { s.delete(key); return key; }); },
        function () { memStore()[name].delete(key); return key; }
      );
    },

    clear: function (name) {
      return run(
        function () { return withStore(name, 'readwrite', function (s) { s.clear(); return true; }); },
        function () { memStore()[name].clear(); return true; }
      );
    },

    /* meta 是 kv 表，主键 key */
    getMeta: function (key, fallback) {
      return YW.db.get('meta', key).then(function (row) {
        return row && row.value !== undefined ? row.value : fallback;
      });
    },

    setMeta: function (key, value) {
      return YW.db.put('meta', { key: key, value: value });
    }
  };
})(window.YW);