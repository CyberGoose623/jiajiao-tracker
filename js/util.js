/* 通用工具 */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  YW.$ = function (sel, root) { return (root || document).querySelector(sel); };
  YW.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  YW.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  YW.escapeHTML = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** 去掉多余小数位，2.0 -> 2，2.50 -> 2.5 */
  YW.fmt = function (n) {
    if (n == null || !isFinite(n)) return '—';
    var r = Math.round(n * 100) / 100;
    return String(r);
  };

  YW.pct = function (rate, digits) {
    if (rate == null || !isFinite(rate)) return '—';
    var d = digits == null ? 1 : digits;
    return (rate * 100).toFixed(d) + '%';
  };

  YW.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  };

  YW.todayISO = function () {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  YW.clone = function (obj) { return JSON.parse(JSON.stringify(obj)); };

  YW.debounce = function (fn, wait) {
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 120);
    };
  };

  /** 解析分数字符串；非法返回 NaN。允许 "3" "3.5" ".5" "0" */
  YW.parseScore = function (raw) {
    if (raw == null) return NaN;
    var s = String(raw).trim().replace(/[。．]/g, '.').replace(/\s+/g, '');
    if (s === '') return NaN;
    if (!/^\d*\.?\d+$/.test(s) && !/^\d+\.$/.test(s)) return NaN;
    var n = parseFloat(s);
    return isFinite(n) ? n : NaN;
  };

  YW.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'application/json') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);
  };

  YW.readFileText = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('读取文件失败')); };
      fr.readAsText(file, 'utf-8');
    });
  };

  YW.readFileDataURL = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('读取文件失败')); };
      fr.readAsDataURL(file);
    });
  };

  YW.dataURLtoBlob = function (dataUrl) {
    var parts = String(dataUrl).split(',');
    var mime = /data:([^;]+)/.exec(parts[0]);
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime ? mime[1] : 'image/jpeg' });
  };

  YW.blobToDataURL = function (blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('转换图片失败')); };
      fr.readAsDataURL(blob);
    });
  };

  YW.arrayBuffer = function (buf) {
    return new Promise(function (resolve, reject) {
      crypto.subtle.digest('SHA-256', buf).then(function (h) {
        var b = new Uint8Array(h);
        var s = '';
        for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
        resolve(s.slice(0, 16));
      }).catch(reject);
    });
  };

  YW.daysBetween = function (aMs, bMs) {
    return Math.floor(Math.abs(bMs - aMs) / 86400000);
  };

  YW.formatDate = function (iso) {
    if (!iso) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    return m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
  };
})(window.YW);