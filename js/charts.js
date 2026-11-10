/* 原生 SVG 图表，无第三方库
   颜色全部从 CSS 变量读，切深色主题时重绘即可
*/
window.YW = window.YW || {};
(function (YW) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function s(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] == null) return;
      node.setAttribute(k, attrs[k]);
    });
    if (text != null) node.textContent = text;
    return node;
  }

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      if (v && v.trim()) return v.trim();
    } catch (e) {}
    return fallback;
  }

  function pal() {
    return {
      line: cssVar('--c-line', '#2f6b5e'),
      lineSoft: cssVar('--c-line-soft', 'rgba(47,107,94,.10)'),
      grid: cssVar('--c-grid', '#e8e2d5'),
      gridStrong: cssVar('--c-grid-strong', '#cfc6b3'),
      axis: cssVar('--c-axis', '#8b8476'),
      axisText: cssVar('--c-axis-text', '#5d574b'),
      dot: cssVar('--c-dot-bg', '#fffdf7'),
      label: cssVar('--c-label', '#7d766a'),
      rowLabel: cssVar('--c-row-label', '#4a453c'),
      bar: cssVar('--c-bar', '#2f6b5e'),
      barText: cssVar('--c-bar-text', '#332f27'),
      up: cssVar('--c-up', '#a8452a'),
      down: cssVar('--c-down', '#2f6b5e'),
      level: cssVar('--c-level', '#7a5a86'),
      heat0: cssVar('--heat-0', '#8a3a21'),
      heat1: cssVar('--heat-1', '#c87c5c'),
      heat2: cssVar('--heat-2', '#e8f0e8'),
      heatEmpty: cssVar('--heat-empty', '#f5f1e7'),
      heatEmptyText: cssVar('--heat-empty-text', '#a8a294'),
      heatStroke: cssVar('--heat-stroke', '#e6dfcf')
    };
  }

  function hexToRgb(c) {
    var str = String(c).trim();
    if (str.charAt(0) === '#') {
      var h = str.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (h.length !== 6) return null;
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    var m = /rgba?\(([^)]+)\)/.exec(str);
    if (m) {
      var p = m[1].split(',').map(function (x) { return parseFloat(x); });
      return [p[0], p[1], p[2]];
    }
    return null;
  }

  function mix(a, b, k) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * k),
      Math.round(a[1] + (b[1] - a[1]) * k),
      Math.round(a[2] + (b[2] - a[2]) * k)
    ];
  }

  function rgbStr(c) { return 'rgb(' + c.join(',') + ')'; }

  /** 按底色亮度决定字色，浅色格子用深字，深色格子用白字 */
  function textOn(rgb) {
    var lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return lum > 0.6 ? '#1a1a15' : '#fffdf7';
  }

  function emptyState(host, msg) {
    host.innerHTML = '';
    host.appendChild(YW.el('div', { class: 'empty', text: msg }));
  }

  function widthOf(host) {
    var w = host.clientWidth || (host.parentNode && host.parentNode.clientWidth) || 320;
    return Math.max(260, Math.floor(w));
  }

  var registry = [];
  function register(host, fn, args) {
    host.__chart = { fn: fn, args: args };
    var found = registry.filter(function (r) { return r.host === host; })[0];
    if (!found) registry.push({ host: host });
  }
  function redrawAll() {
    registry = registry.filter(function (r) { return document.body.contains(r.host); });
    registry.forEach(function (r) {
      if (r.host.offsetParent === null && !r.host.clientWidth) return;
      if (r.host.__chart) r.host.__chart.fn(r.host, r.host.__chart.args);
    });
  }
  window.addEventListener('resize', YW.debounce(redrawAll, 180));
  window.addEventListener('orientationchange', function () { setTimeout(redrawAll, 260); });

  /* ---------------- 1. 得分率趋势 ---------------- */
  function trend(host, opts) {
    register(host, trend, opts);
    var points = (opts && opts.points) || [];
    if (!points.length) { emptyState(host, '还没有考试记录。录入一次之后，这里会出现第一个点。'); return; }

    var P = pal();
    host.innerHTML = '';
    var W = widthOf(host);
    var n = points.length;
    var H = n > 6 ? 300 : 280;
    var pad = { l: 46, r: 16, t: 18, b: n > 8 ? 52 : 44 };
    var plotW = W - pad.l - pad.r;
    var plotH = H - pad.t - pad.b;

    var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svg.setAttribute('aria-label', '得分率趋势折线图');

    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      var y = pad.t + (1 - t) * plotH;
      svg.appendChild(s('line', {
        x1: pad.l, x2: W - pad.r, y1: y, y2: y,
        stroke: t === 0 ? P.gridStrong : P.grid,
        'stroke-width': 1
      }));
      svg.appendChild(s('text', {
        x: pad.l - 8, y: y + 4, 'text-anchor': 'end',
        'font-size': 11, fill: P.axis
      }, Math.round(t * 100) + '%'));
    });

    var xs = points.map(function (p, i) {
      if (n === 1) return pad.l + plotW / 2;
      return pad.l + (plotW * i) / (n - 1);
    });
    function yOf(v) { return pad.t + (1 - Math.max(0, Math.min(1, v))) * plotH; }

    var areaPts = xs.map(function (x, i) { return x + ',' + yOf(points[i].value); });
    svg.appendChild(s('path', {
      d: 'M' + xs[0] + ',' + (pad.t + plotH) + ' L' + areaPts.join(' L') + ' L' + xs[n - 1] + ',' + (pad.t + plotH) + ' Z',
      fill: P.lineSoft
    }));

    if (n > 1) {
      svg.appendChild(s('polyline', {
        points: areaPts.join(' '),
        fill: 'none', stroke: P.line, 'stroke-width': 2.4,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }

    var tip = YW.el('div', { class: 'tooltip' });
    tip.hidden = true;

    var showEvery = n > 10 ? Math.ceil(n / 8) : 1;

    points.forEach(function (p, i) {
      var x = xs[i], y = yOf(p.value);
      svg.appendChild(s('circle', { cx: x, cy: y, r: 4.6, fill: P.dot, stroke: P.line, 'stroke-width': 2.2 }));

      var hit = s('circle', { cx: x, cy: y, r: Math.max(14, plotW / (n * 2)), fill: 'transparent', style: 'cursor:pointer' });
      hit.addEventListener('pointerenter', function () { showTip(tip, host, p, x, y); });
      hit.addEventListener('pointerdown', function () { showTip(tip, host, p, x, y); });
      hit.addEventListener('pointerleave', function () { if (n > 3) tip.hidden = true; });
      svg.appendChild(hit);

      if (i % showEvery === 0 || i === n - 1) {
        svg.appendChild(s('text', {
          x: x, y: pad.t + plotH + 20,
          'text-anchor': 'middle', 'font-size': 11, fill: P.label
        }, p.label));
      }
    });

    host.appendChild(svg);
    host.appendChild(tip);
  }

  function showTip(tip, host, p, x, y) {
    tip.innerHTML = YW.escapeHTML(p.name) +
      '<br>' + YW.escapeHTML(p.date || '') +
      '<br>' + YW.fmt(p.got) + ' / ' + YW.fmt(p.full) + ' 分 · ' + YW.pct(p.value);
    tip.hidden = false;
    var hw = host.clientWidth;
    var left = Math.max(70, Math.min(hw - 70, x));
    tip.style.left = left + 'px';
    tip.style.top = (y - 12) + 'px';
  }

  /* ---------------- 2. 能力维度雷达 ---------------- */
  function radar(host, opts) {
    register(host, radar, opts);
    var axes = (opts && opts.axes) || [];
    var polygons = (opts && opts.polygons) || [];
    if (!axes.length) { emptyState(host, '还没有可画的维度。'); return; }
    if (!polygons.length) { emptyState(host, '至少要有一次考试，才能画出雷达。'); return; }

    host.__hidden = host.__hidden || {};
    var hidden = host.__hidden;

    function draw() {
      var P = pal();
      host.innerHTML = '';
      var W = widthOf(host);
      var H = Math.max(300, Math.min(380, Math.round(W * 0.72)));
      var cx = W / 2, cy = H / 2 + 4;
      var R = Math.min(W, H) / 2 - 54;
      if (R < 60) R = 60;

      var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.setAttribute('aria-label', '能力维度雷达图');
      var count = axes.length;

      function pt(i, t) {
        var ang = -Math.PI / 2 + (Math.PI * 2 * i) / count;
        return [cx + Math.cos(ang) * R * t, cy + Math.sin(ang) * R * t];
      }

      [0.25, 0.5, 0.75, 1].forEach(function (ring) {
        var pts = [];
        for (var i = 0; i < count; i++) pts.push(pt(i, ring).join(','));
        svg.appendChild(s('polygon', {
          points: pts.join(' '), fill: 'none', stroke: P.grid, 'stroke-width': 1
        }));
      });

      axes.forEach(function (ax, i) {
        var outer = pt(i, 1);
        svg.appendChild(s('line', { x1: cx, y1: cy, x2: outer[0], y2: outer[1], stroke: P.grid, 'stroke-width': 1 }));
        var lp = pt(i, 1.17);
        svg.appendChild(s('text', {
          x: lp[0], y: lp[1] + 4,
          'text-anchor': Math.abs(lp[0] - cx) < 6 ? 'middle' : (lp[0] > cx ? 'start' : 'end'),
          'font-size': 12, fill: P.axisText
        }, ax.label));
      });

      polygons.forEach(function (poly) {
        if (hidden[poly.key]) return;
        var pts = poly.values.map(function (v, i) {
          return pt(i, Math.max(0.02, Math.min(1, v == null ? 0 : v))).join(',');
        });
        svg.appendChild(s('polygon', {
          points: pts.join(' '),
          fill: poly.color, 'fill-opacity': 0.16,
          stroke: poly.color, 'stroke-width': 2
        }));
        poly.values.forEach(function (v, i) {
          if (v == null) return;
          var p = pt(i, Math.max(0.02, Math.min(1, v)));
          svg.appendChild(s('circle', { cx: p[0], cy: p[1], r: 3, fill: poly.color }));
        });
      });

      host.appendChild(svg);
    }

    draw();

    if (opts.legendHost) {
      var lg = opts.legendHost;
      lg.innerHTML = '';
      polygons.forEach(function (poly) {
        var btn = YW.el('button', {
          type: 'button', class: 'legend-item',
          'aria-pressed': hidden[poly.key] ? 'false' : 'true',
          onclick: function () {
            hidden[poly.key] = !hidden[poly.key];
            btn.setAttribute('aria-pressed', hidden[poly.key] ? 'false' : 'true');
            draw();
          }
        }, [
          YW.el('span', { class: 'sw', style: 'background:' + poly.color }),
          document.createTextNode(poly.name)
        ]);
        lg.appendChild(btn);
      });
    }
  }

  /* ---------------- 3. 失分热力图 ---------------- */
  function heat(host, opts) {
    register(host, heat, opts);
    var rows = (opts && opts.rows) || [];
    var cols = (opts && opts.cols) || [];
    if (!rows.length || !cols.length) {
      emptyState(host, '至少录制两次考试，热力图才能看出连续几次的低分。');
      return;
    }

    var P = pal();
    var H0 = hexToRgb(P.heat0), H1 = hexToRgb(P.heat1), H2 = hexToRgb(P.heat2);

    function heatColor(t) {
      if (!H0 || !H1 || !H2) return P.heat1;
      var c = t < 0.55 ? mix(H0, H1, t / 0.55) : mix(H1, H2, (t - 0.55) / 0.45);
      return rgbStr(c);
    }

    host.innerHTML = '';
    var W = widthOf(host);
    var labelW = 78;
    var minCell = 40;
    var cellW = Math.max(minCell, Math.floor((W - labelW - 6) / cols.length));
    var totalW = labelW + cellW * cols.length;
    var rowH = 40, topH = 34;
    var H = topH + rowH * rows.length + 6;

    host.style.overflowX = totalW > W ? 'auto' : 'visible';
    host.style.webkitOverflowScrolling = 'touch';

    var svg = s('svg', {
      width: Math.max(totalW, W), height: H,
      viewBox: '0 0 ' + Math.max(totalW, W) + ' ' + H, role: 'img'
    });
    svg.setAttribute('aria-label', '失分热力图');

    cols.forEach(function (c, i) {
      svg.appendChild(s('text', {
        x: labelW + cellW * i + cellW / 2, y: 20,
        'text-anchor': 'middle', 'font-size': 10.5, fill: P.label
      }, c.short));
    });

    rows.forEach(function (row, ri) {
      var y = topH + ri * rowH;
      svg.appendChild(s('text', {
        x: 0, y: y + rowH / 2 + 4, 'font-size': 12.5, fill: P.rowLabel
      }, row.label));
      cols.forEach(function (c, ci) {
        var v = row.values[ci];
        var x = labelW + ci * cellW;
        var w = cellW - 4;
        var t = v == null ? null : Math.max(0, Math.min(1, v));
        var fillC = t == null ? P.heatEmpty : heatColor(t);
        svg.appendChild(s('rect', {
          x: x, y: y + 4, width: w, height: rowH - 10, rx: 6,
          fill: fillC, stroke: P.heatStroke, 'stroke-width': 0.8
        }));
        var txt = t == null ? P.heatEmptyText : textOn(hexToRgb(fillC) || [128, 128, 128]);
        svg.appendChild(s('text', {
          x: x + w / 2, y: y + rowH / 2 + 4, 'text-anchor': 'middle',
          'font-size': 11.5, 'font-weight': 600, fill: txt
        }, t == null ? '—' : Math.round(t * 100) + '%'));
      });
    });

    host.appendChild(svg);
  }

  /* ---------------- 4. 错因频次 ---------------- */
  function bars(host, opts) {
    register(host, bars, opts);
    var entries = ((opts && opts.entries) || []).slice(0, 8);
    if (!entries.length) { emptyState(host, '还没有标记过错因。录入时点一下就记上了。'); return; }

    var P = pal();
    host.innerHTML = '';
    var W = widthOf(host);
    var labelW = Math.min(120, Math.max(84, Math.round(W * 0.28)));
    var numW = 56;
    var rowH = 36;
    var H = entries.length * rowH + 10;
    var maxCount = entries.reduce(function (m, e) { return Math.max(m, e.count); }, 1);
    var barMax = W - labelW - numW - 8;

    var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svg.setAttribute('aria-label', '错因频次条形图');

    entries.forEach(function (e, i) {
      var y = i * rowH;
      svg.appendChild(s('text', {
        x: 0, y: y + rowH / 2 + 4.5, 'font-size': 12, fill: P.rowLabel
      }, e.name.length > 7 ? e.name.slice(0, 7) + '…' : e.name));

      var bw = Math.max(6, Math.round((e.count / maxCount) * barMax));
      svg.appendChild(s('rect', {
        x: labelW, y: y + rowH / 2 - 8, width: bw, height: 17, rx: 5,
        fill: P.bar, 'fill-opacity': 0.88
      }));

      svg.appendChild(s('text', {
        x: labelW + bw + 8, y: y + rowH / 2 + 5, 'font-size': 12.5,
        'font-weight': 600, fill: P.barText
      }, String(e.count)));

      var delta = (e.recent || 0) - (e.prev || 0);
      if (e.recent || e.prev) {
        var arrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '→');
        var color = delta > 0 ? P.up : (delta < 0 ? P.down : P.axis);
        svg.appendChild(s('text', {
          x: W - 4, y: y + rowH / 2 + 5, 'text-anchor': 'end',
          'font-size': 12, fill: color
        }, arrow + Math.abs(delta)));
      }
    });

    host.appendChild(svg);
  }

  /* ---------------- 5. 作文档位 ---------------- */
  function levels(host, opts) {
    register(host, levels, opts);
    var points = ((opts && opts.points) || []).filter(function (p) { return p.level != null; });
    if (!points.length) { emptyState(host, '还没有填过作文档位。'); return; }

    var P = pal();
    host.innerHTML = '';
    var W = widthOf(host);
    var H = 210;
    var pad = { l: 44, r: 16, t: 16, b: 34 };
    var plotW = W - pad.l - pad.r;
    var plotH = H - pad.t - pad.b;
    var n = points.length;

    var svg = s('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svg.setAttribute('aria-label', '作文档位趋势');

    var names = ['一类', '二类', '三类', '四类', '五类'];
    for (var lv = 1; lv <= 5; lv++) {
      var y = pad.t + ((lv - 1) / 4) * plotH;
      svg.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: P.grid, 'stroke-width': 1 }));
      svg.appendChild(s('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: P.axis }, names[lv - 1]));
    }

    function xOf(i) { return n === 1 ? pad.l + plotW / 2 : pad.l + (plotW * i) / (n - 1); }
    function yOf(lv) { return pad.t + ((lv - 1) / 4) * plotH; }

    var pts = points.map(function (p, i) { return xOf(i) + ',' + yOf(p.level); });
    if (n > 1) {
      svg.appendChild(s('polyline', {
        points: pts.join(' '), fill: 'none', stroke: P.level, 'stroke-width': 2.2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
    }
    points.forEach(function (p, i) {
      svg.appendChild(s('circle', { cx: xOf(i), cy: yOf(p.level), r: 4.6, fill: P.dot, stroke: P.level, 'stroke-width': 2.2 }));
      svg.appendChild(s('text', {
        x: xOf(i), y: pad.t + plotH + 20, 'text-anchor': 'middle', 'font-size': 10.5, fill: P.label
      }, p.label));
    });

    host.appendChild(svg);
  }

  YW.charts = { trend: trend, radar: radar, heat: heat, bars: bars, levels: levels, redrawAll: redrawAll, pal: pal };
})(window.YW);
