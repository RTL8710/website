/* Deep Sea 日/时面板：接管 .dv-native-date / .dv-native-dt，写入值并派发 input/change（Alpine x-model）。
 * 外观跟 html[data-theme] 的 --accent / --bg-* 变量走。
 */
(function () {
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var pop, titleEl, gridEl, timeEl, footEl, boundInput, viewY, viewM, selD, selH, selMin, mode;

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function parseVal(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], h: m[4] != null ? +m[4] : 0, min: m[5] != null ? +m[5] : 0 };
  }
  function nowParts() {
    var n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), h: n.getHours(), min: n.getMinutes() };
  }
  function isDt(input) {
    return !!(input && (input.classList.contains('dv-native-dt') || input.getAttribute('type') === 'datetime-local'));
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'dv-day-pop';
    pop.hidden = true;
    pop.innerHTML =
      '<div class="dv-day-body">' +
        '<div class="dv-day-cal">' +
          '<div class="dv-day-head">' +
            '<div class="dv-day-title"></div>' +
            '<div class="dv-day-nav">' +
              '<button type="button" data-nav="-1" aria-label="prev">‹</button>' +
              '<button type="button" data-nav="1" aria-label="next">›</button>' +
            '</div>' +
          '</div>' +
          '<div class="dv-day-week">' + WEEK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
          '<div class="dv-day-grid"></div>' +
        '</div>' +
        '<div class="dv-day-time" hidden>' +
          '<div class="dv-day-time-cols">' +
            '<div class="dv-day-time-col" data-col="h"></div>' +
            '<div class="dv-day-time-col" data-col="min"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dv-day-foot">' +
        '<button type="button" data-act="clear">清除</button>' +
        '<div class="dv-day-foot-r">' +
          '<button type="button" data-act="today">今天</button>' +
          '<button type="button" data-act="ok" class="dv-day-ok" hidden>确定</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(pop);
    titleEl = pop.querySelector('.dv-day-title');
    gridEl = pop.querySelector('.dv-day-grid');
    timeEl = pop.querySelector('.dv-day-time');
    footEl = pop.querySelector('.dv-day-foot');

    pop.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      var nav = t.getAttribute('data-nav');
      if (nav) {
        viewM += (+nav);
        if (viewM < 1) { viewM = 12; viewY--; }
        if (viewM > 12) { viewM = 1; viewY++; }
        renderGrid();
        return;
      }
      var act = t.getAttribute('data-act');
      if (act === 'clear') { commit(''); return; }
      if (act === 'today') {
        var td = nowParts();
        viewY = td.y; viewM = td.m; selD = td.d;
        if (mode === 'dt') { selH = td.h; selMin = td.min; }
        if (mode === 'dt') { renderAll(); commit(currentValue(), false); }
        else commit(fmt(td.y, td.m, td.d));
        return;
      }
      if (act === 'ok') { commit(currentValue()); return; }
      var ymd = t.getAttribute('data-ymd');
      if (ymd) {
        var p = parseVal(ymd);
        selD = p.d; viewY = p.y; viewM = p.m;
        if (mode === 'date') commit(fmt(viewY, viewM, selD));
        else { renderAll(); }
        return;
      }
      var hv = t.getAttribute('data-h');
      if (hv != null) { selH = +hv; renderTime(); return; }
      var mv = t.getAttribute('data-min');
      if (mv != null) { selMin = +mv; renderTime(); return; }
    });

    document.addEventListener('mousedown', function (e) {
      if (!pop || pop.hidden) return;
      if (pop.contains(e.target)) return;
      if (boundInput && (e.target === boundInput || (boundInput.parentElement && boundInput.parentElement.contains(e.target)))) return;
      // datetime：点外侧也提交当前选择
      if (mode === 'dt' && boundInput) commit(currentValue());
      else close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && mode === 'dt' && pop && !pop.hidden) commit(currentValue());
    });
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return pop;
  }

  function currentValue() {
    if (selD == null) return '';
    var day = fmt(viewY, viewM, selD);
    if (mode !== 'dt') return day;
    return day + 'T' + pad(selH || 0) + ':' + pad(selMin || 0);
  }

  function commit(val, doClose) {
    if (doClose === undefined) doClose = true;
    if (!boundInput) { close(); return; }
    boundInput.value = val || '';
    boundInput.dispatchEvent(new Event('input', { bubbles: true }));
    boundInput.dispatchEvent(new Event('change', { bubbles: true }));
    if (doClose) close();
  }

  function close() {
    if (pop) pop.hidden = true;
    boundInput = null;
  }

  function renderGrid() {
    titleEl.textContent = viewY + '年' + viewM + '月';
    var td = nowParts();
    var first = new Date(viewY, viewM - 1, 1);
    var startPad = first.getDay();
    var daysIn = new Date(viewY, viewM, 0).getDate();
    var prevDays = new Date(viewY, viewM - 1, 0).getDate();
    var html = '', i;
    for (i = 0; i < startPad; i++) {
      var pd = prevDays - startPad + i + 1;
      var py = viewM === 1 ? viewY - 1 : viewY;
      var pm = viewM === 1 ? 12 : viewM - 1;
      html += '<button type="button" class="muted" data-ymd="' + fmt(py, pm, pd) + '">' + pd + '</button>';
    }
    for (i = 1; i <= daysIn; i++) {
      var cls = [];
      if (selD === i) cls.push('selected');
      if (td.y === viewY && td.m === viewM && td.d === i) cls.push('today');
      html += '<button type="button" class="' + cls.join(' ') + '" data-ymd="' + fmt(viewY, viewM, i) + '">' + i + '</button>';
    }
    var filled = startPad + daysIn;
    var trail = (7 - (filled % 7)) % 7;
    for (i = 1; i <= trail; i++) {
      var ny = viewM === 12 ? viewY + 1 : viewY;
      var nm = viewM === 12 ? 1 : viewM + 1;
      html += '<button type="button" class="muted" data-ymd="' + fmt(ny, nm, i) + '">' + i + '</button>';
    }
    gridEl.innerHTML = html;
  }

  function renderTime() {
    if (mode !== 'dt') return;
    var hCol = timeEl.querySelector('[data-col="h"]');
    var mCol = timeEl.querySelector('[data-col="min"]');
    var hi = '', mi = '', i;
    for (i = 0; i < 24; i++) {
      hi += '<button type="button" data-h="' + i + '" class="' + (selH === i ? 'selected' : '') + '">' + pad(i) + '</button>';
    }
    for (i = 0; i < 60; i++) {
      mi += '<button type="button" data-min="' + i + '" class="' + (selMin === i ? 'selected' : '') + '">' + pad(i) + '</button>';
    }
    hCol.innerHTML = hi;
    mCol.innerHTML = mi;
    // 滚到选中项
    requestAnimationFrame(function () {
      var hs = hCol.querySelector('.selected');
      var ms = mCol.querySelector('.selected');
      if (hs) hs.scrollIntoView({ block: 'center' });
      if (ms) ms.scrollIntoView({ block: 'center' });
    });
  }

  function renderAll() {
    pop.classList.toggle('has-time', mode === 'dt');
    timeEl.hidden = mode !== 'dt';
    var okBtn = pop.querySelector('[data-act="ok"]');
    if (okBtn) okBtn.hidden = mode !== 'dt';
    var todayBtn = pop.querySelector('[data-act="today"]');
    if (todayBtn) todayBtn.textContent = mode === 'dt' ? '现在' : '今天';
    renderGrid();
    renderTime();
  }

  function place() {
    if (!boundInput || !pop) return;
    var r = boundInput.getBoundingClientRect();
    var w = mode === 'dt' ? 420 : 292;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    pop.style.width = w + 'px';
    pop.style.left = left + 'px';
    pop.style.top = (r.bottom + 6) + 'px';
    requestAnimationFrame(function () {
      var h = pop.offsetHeight || 320;
      if (r.bottom + 6 + h > window.innerHeight - 8 && r.top > h + 8) {
        pop.style.top = (r.top - h - 6) + 'px';
      }
    });
  }

  function open(input) {
    ensurePop();
    boundInput = input;
    mode = isDt(input) ? 'dt' : 'date';
    var cur = parseVal(input.value) || nowParts();
    viewY = cur.y; viewM = cur.m; selD = cur.d;
    selH = cur.h; selMin = cur.min;
    renderAll();
    pop.hidden = false;
    place();
  }

  function wrapInput(input) {
    if (input.closest('.dv-date-wrap')) return;
    var wrap = document.createElement('span');
    wrap.className = 'dv-date-wrap' + (isDt(input) ? ' is-dt' : '');
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  function bind(input) {
    if (!input || input._dvDayBound) return;
    input._dvDayBound = true;
    wrapInput(input);
    input.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      open(input);
    });
    input.addEventListener('mousedown', function (e) {
      if (e.button === 0) e.preventDefault();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        open(input);
      }
    });
  }

  function scan(root) {
    var scope = root || document;
    scope.querySelectorAll('input.dv-native-date, input.dv-native-dt').forEach(bind);
  }

  window.dvInitDayPickers = scan;
  document.addEventListener('DOMContentLoaded', function () { scan(document); });
  document.addEventListener('alpine:initialized', function () {
    setTimeout(function () { scan(document); }, 0);
  });
})();
