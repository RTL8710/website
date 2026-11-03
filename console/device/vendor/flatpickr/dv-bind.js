/* Flatpickr ↔ Alpine x-model；index.html 在 flatpickr.min.js 之后加载。
 * data-fp="datetime"|"date"；值格式保持 Y-m-dTH:i / Y-m-d（与原 datetime-local/date 一致）。
 * 用户要求：替换丑陋原生日期选择器。
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
  window.dvBindFp = function (el) {
    if (!el || !window.flatpickr || el._flatpickr) return el && el._flatpickr;
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
          instance.altInput.className = (el.className || '') + ' flatpickr-alt';
          instance.altInput.classList.add('form-control');
          if (el.classList.contains('form-control-sm')) instance.altInput.classList.add('form-control-sm');
          instance.altInput.classList.add('dv-fp');
          // altInput 不继承 data-fp；CSS 宽度选择器依赖它
          if (mode) instance.altInput.setAttribute('data-fp', mode);
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
    if (!el) return;
    if (!el._flatpickr) window.dvBindFp(el);
    if (!el._flatpickr) return;
    var next = val || '';
    var cur = el.value || '';
    if (next === cur) return;
    try { el._flatpickr.setDate(next, false); } catch (e) {}
  };
  window.dvInitFlatpickrs = function (root) {
    if (!window.flatpickr) return;
    var scope = root || document;
    scope.querySelectorAll('input.dv-fp[data-fp]').forEach(function (el) {
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
