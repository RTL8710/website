/*
 * 图片占位兜底：当截图素材(app-shots/ manual-shots/ footage/ 等)尚未上传时，
 * 把加载失败的 <img> 换成一张同色系的占位图，保持页面整洁而不是显示裂图。
 * 素材补齐后放回对应目录即可自动显示真实图片，无需改动页面。
 */
(function () {
  function esc(s) {
    return String(s).replace(/[<>&]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c];
    });
  }

  function placeholder(label) {
    label = (label || "示例截图").trim().slice(0, 24);
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#12203a"/><stop offset="1" stop-color="#080d16"/>' +
      "</linearGradient></defs>" +
      '<rect width="640" height="420" fill="url(#g)"/>' +
      '<rect x="1.5" y="1.5" width="637" height="417" rx="10" fill="none" stroke="#22d3ee" stroke-opacity="0.25"/>' +
      '<g transform="translate(320,168)" fill="none" stroke="#22d3ee" stroke-width="3" stroke-opacity="0.8">' +
      '<rect x="-46" y="-34" width="92" height="68" rx="8"/>' +
      '<circle cx="0" cy="0" r="20"/><circle cx="30" cy="-20" r="3" fill="#22d3ee"/></g>' +
      '<text x="320" y="250" fill="#cfe3ee" font-family="PingFang SC,Segoe UI,sans-serif" font-size="21" font-weight="600" text-anchor="middle">' +
      esc(label) +
      "</text>" +
      '<text x="320" y="282" fill="#64748b" font-family="PingFang SC,Segoe UI,sans-serif" font-size="14" text-anchor="middle">示例截图 · 素材补齐后自动显示</text>' +
      "</svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function fix(img) {
    if (img.dataset.ph) return;
    img.dataset.ph = "1";
    img.src = placeholder(img.getAttribute("alt"));
  }

  function scan() {
    var imgs = document.querySelectorAll("img");
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (img.dataset.ph) continue;
      if (img.complete && img.naturalWidth === 0) {
        fix(img);
      } else {
        img.addEventListener("error", function () {
          fix(this);
        });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();
