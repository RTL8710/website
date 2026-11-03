/* 轻量 Deep Sea 日选择面板：接管 input.dv-native-date，写入 YYYY-MM-DD 并派发 input/change（兼容 Alpine x-model）。
 * 不用 Flatpickr，避免 altInput 二次绑定。
 */
(function () {
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  var pop, titleEl, gridEl, boundInput, viewY, viewM;

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function parseYMD(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }
  function todayYMD() {
    var n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'dv-day-pop';
    pop.hidden = true;
    pop.innerHTML =
      '<div class="dv-day-head">' +
        '<div class="dv-day-title"></div>' +
        '<div class="dv-day-nav">' +
          '<button type="button" data-nav="-1" aria-label="prev">‹</button>' +
          '<button type="button" data-nav="1" aria-label="next">›</button>' +
        '</div>' +
      '</div>' +
      '<div class="dv-day-week">' + WEEK.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="dv-day-grid"></div>' +
      '<div class="dv-day-foot">' +
        '<button type="button" data-act="clear">清除</button>' +
        '<button type="button" data-act="today">今天</button>' +
      '</div>';
    document.body.appendChild(pop);
    titleEl = pop.querySelector('.dv-day-title');
    gridEl = pop.querySelector('.dv-day-grid');
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
        render();
        return;
      }
      var act = t.getAttribute('data-act');
      if (act === 'clear') { commit(''); return; }
      if (act === 'today') {
        var td = todayYMD();
        commit(fmt(td.y, td.m, td.d));
        return;
      }
      var ymd = t.getAttribute('data-ymd');
      if (ymd) commit(ymd);
    });
    document.addEventListener('mousedown', function (e) {
      if (!pop || pop.hidden) return;
      if (pop.contains(e.target)) return;
      if (boundInput && (e.target === boundInput || boundInput.contains(e.target))) return;
      if (boundInput && boundInput.parentElement && boundInput.parentElement.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return pop;
  }

  function commit(val) {
    if (!boundInput) { close(); return; }
    boundInput.value = val || '';
    boundInput.dispatchEvent(new Event('input', { bubbles: true }));
    boundInput.dispatchEvent(new Event('change', { bubbles: true }));
    close();
  }

  function close() {
    if (pop) pop.hidden = true;
    boundInput = null;
  }

  function render() {
    ensurePop();
    titleEl.textContent = viewY + '年' + viewM + '月';
    var sel = parseYMD(boundInput && boundInput.value);
    var td = todayYMD();
    var first = new Date(viewY, viewM - 1, 1);
    var startPad = first.getDay();
    var daysIn = new Date(viewY, viewM, 0).getDate();
    var prevDays = new Date(viewY, viewM - 1, 0).getDate();
    var html = '';
    var i;
    for (i = 0; i < startPad; i++) {
      var pd = prevDays - startPad + i + 1;
      var py = viewM === 1 ? viewY - 1 : viewY;
      var pm = viewM === 1 ? 12 : viewM - 1;
      html += '<button type="button" class="muted" data-ymd="' + fmt(py, pm, pd) + '">' + pd + '</button>';
    }
    for (i = 1; i <= daysIn; i++) {
      var cls = [];
      if (sel && sel.y === viewY && sel.m === viewM && sel.d === i) cls.push('selected');
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

  function place() {
    if (!boundInput || !pop) return;
    var r = boundInput.getBoundingClientRect();
    var w = 292;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var top = r.bottom + 6;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    // 若下方空间不足，翻到上方
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
    var cur = parseYMD(input.value) || todayYMD();
    viewY = cur.y;
    viewM = cur.m;
    render();
    pop.hidden = false;
    place();
  }

  function wrapInput(input) {
    if (input.closest('.dv-date-wrap')) return;
    var wrap = document.createElement('span');
    wrap.className = 'dv-date-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
  }

  function bind(input) {
    if (!input || input._dvDayBound) return;
    input._dvDayBound = true;
    wrapInput(input);
    // 拦截系统日历：用自绘面板
    input.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof input.showPicker === 'function') {
        try { /* ignore native */ } catch (err) {}
      }
      open(input);
    });
    input.addEventListener('mousedown', function (e) {
      // 阻止部分浏览器 mousedown 就弹出系统日历
      if (e.button === 0) {
        e.preventDefault();
      }
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        open(input);
      }
    });
  }

  function scan(root) {
    (root || document).querySelectorAll('input.dv-native-date').forEach(bind);
  }

  window.dvInitDayPickers = scan;
  document.addEventListener('DOMContentLoaded', function () { scan(document); });
  document.addEventListener('alpine:initialized', function () {
    setTimeout(function () { scan(document); }, 0);
  });
  // 晚出现的面板（x-show）
  setInterval(function () { scan(document); }, 2000);
})();
