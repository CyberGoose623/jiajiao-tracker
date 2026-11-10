/* 试卷照片：压缩到长边 1600px 以内再存，避免撑爆 IndexedDB */
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var MAX_EDGE = 1600;
  var QUALITY = 0.82;

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('这张图读不出来，换一张试试'));
      };
      img.src = url;
    });
  }

  /** file -> Blob(jpeg)，长边不超过 1600 */
  function compress(file) {
    return loadImage(file).then(function (img) {
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else resolve(file);
        }, 'image/jpeg', QUALITY);
      });
    });
  }

  function save(file) {
    return compress(file).then(function (blob) {
      var id = YW.uid('img');
      return YW.db.put('images', { id: id, blob: blob, createdAt: Date.now() }).then(function () { return id; });
    });
  }

  function url(id) {
    return YW.db.get('images', id).then(function (row) {
      if (!row || !row.blob) return null;
      return URL.createObjectURL(row.blob);
    });
  }

  function remove(id) {
    if (!id) return Promise.resolve();
    return YW.db.del('images', id);
  }

  function exportAll() {
    return YW.db.all('images').then(function (rows) {
      return Promise.all(rows.map(function (r) {
        return YW.blobToDataURL(r.blob).then(function (dataUrl) {
          return { id: r.id, createdAt: r.createdAt, dataUrl: dataUrl };
        });
      }));
    });
  }

  function importAll(list) {
    if (!Array.isArray(list) || !list.length) return Promise.resolve(0);
    return Promise.all(list.map(function (row) {
      if (!row || !row.id || !row.dataUrl) return Promise.resolve(false);
      return YW.db.get('images', row.id).then(function (exists) {
        if (exists) return false;
        var blob;
        try { blob = YW.dataURLtoBlob(row.dataUrl); } catch (e) { return false; }
        return YW.db.put('images', { id: row.id, blob: blob, createdAt: row.createdAt || Date.now() }).then(function () { return true; });
      });
    })).then(function (flags) {
      return flags.filter(Boolean).length;
    });
  }

  YW.photos = { compress: compress, save: save, url: url, remove: remove, exportAll: exportAll, importAll: importAll };
})(window.YW);