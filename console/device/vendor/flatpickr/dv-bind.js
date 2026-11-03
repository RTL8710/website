/* Flatpickr ↔ Alpine x-model；index.html 在 flatpickr.min.js 之后加载。
 * data-fp="datetime"|"date"；值格式保持 Y-m-dTH:i / Y-m-d（与原 datetime-local/date 一致）。
 * 用户要求：替换丑陋原生日期选择器。
 *
 * 铁律：altInput 禁止带 dv-fp / data-fp —— 否则 dvInitFlatpickrs 会再绑一次，
 * 嵌套实例导致时间轴日期空白、◀▶ 翻天不刷新。
 */
(function () {
  function langCode() {
    try {
      var l = localStorage.getItem('dv_lang') || document.documentElement.lang || 'en';
      return String(l).slice(0, 2).toLowerCase();
    } catch (e) { return 'en'; }
  }
  function localeOf() {
    var code = langCode();
    var map = { zh: 'zh', ja: 'ja', de: 'de', fr: 'fr', es: 'es' };
    var key = map[code];
    if (key && window.flatpickr && flatpickr.l10ns && flatpickr.l10ns[key]) return flatpickr.l10ns[key];
    return 'default';
  }
  function isAltInput(el) {
    return !!(el && (el.classList.contains('flatpickr-alt') || el.classList.contains('dv-fp-alt')));
  }
  function paintAlt(instance) {
    if (!instance || !instance.altInput) return;
    try {
      if (instance.selectedDates && instance.selectedDates[0]) {
        instance.altInput.value = instance.formatDate(instance.selectedDates[0], instance.config.altFormat);
      } else {
        instance.altInput.value = instance.input && instance.input.value
          ? instance.formatDate(instance.parseDate(instance.input.value, instance.config.dateFormat), instance.config.altFormat) || ''
          : '';
      }
    } catch (e) { /* ignore */ }
  }
  window.dvBindFp = function (el) {
    if (!el || !window.flatpickr) return null;
    if (isAltInput(el)) return el._flatpickr || null;
    if (el._flatpickr) return el._flatpickr;
    var mode = el.getAttribute('data-fp') || 'datetime';
    var enableTime = mode !== 'date';
    var fp = flatpickr(el, {
      enableTime: enableTime,
      time_24hr: true,
      minuteIncrement: 1,
      dateFormat: enableTime ? 'Y-m-d\\TH:i' : 'Y-m-d',
      altInput: true,
      altFormat: enableTime ? 'Y-m-d H:i' : 'Y-m-d',
      allowInput: true,
      disableMobile: true,
      animate: true,
      locale: localeOf(),
      onReady: function (selectedDates, dateStr, instance) {
        if (instance.altInput) {
          // 不要拷贝 el.className（含 dv-fp/data-fp），否则会被二次初始化
          var sm = el.classList.contains('form-control-sm');
          instance.altInput.className = 'form-control' + (sm ? ' form-control-sm' : '') + ' flatpickr-alt dv-fp-alt';
          instance.altInput.setAttribute('data-fp-mode', mode);
          instance.altInput.removeAttribute('data-fp');
          instance.altInput.classList.remove('dv-fp');
          paintAlt(instance);
        }
      },
      onChange: function (dates, str) {
        el.value = str || '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    return fp;
  };
  window.dvFpSync = function (el, val) {
    if (!el || isAltInput(el)) return;
    if (!el._flatpickr) window.dvBindFp(el);
    if (!el._flatpickr) return;
    var next = val || '';
    var cur = el.value || '';
    if (next === cur) {
      // 值相同也可能 alt 被清空（二次 init 后），强制重绘
      paintAlt(el._flatpickr);
      return;
    }
    try {
      if (next) el._flatpickr.setDate(next, false);
      else el._flatpickr.clear(false);
    } catch (e) { /* ignore */ }
    paintAlt(el._flatpickr);
  };
  window.dvInitFlatpickrs = function (root) {
    if (!window.flatpickr) return;
    var scope = root || document;
    scope.querySelectorAll('input.dv-fp[data-fp]').forEach(function (el) {
      if (isAltInput(el)) return;
      window.dvBindFp(el);
    });
  };
  document.addEventListener('DOMContentLoaded', function () {
    window.dvInitFlatpickrs(document);
  });
  document.addEventListener('alpine:initialized', function () {
    setTimeout(function () { window.dvInitFlatpickrs(document); }, 0);
  });
})();
