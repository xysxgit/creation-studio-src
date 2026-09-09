/* ============================================================
   创作助手 · 图标渲染统一（theme-overrides.js）
   问题：部分 emoji 字符（🏷🗑🕒📄 等）在没有显式 VS16 时
   会掉进单色文本字体，在彩色背景上几乎不可见，且与彩色
   emoji（🎲🤖）风格割裂。
   方案：扫描所有按钮内短短的图标文本节点，为缺失的 emoji
   码点补 U+FE0F（强制彩色呈现）。不触碰正文可编辑区域。
   ============================================================ */
(function () {
  if (window.__czIconNormalize) return;
  window.__czIconNormalize = true;

  function isEmojiCp(cp) {
    return (
      (cp >= 0x1f000 && cp <= 0x1faff) || // 主 emoji 区（含代理对合成的码点）
      (cp >= 0x2600 && cp <= 0x27bf) ||   // 杂项符号与装饰符号
      (cp >= 0x2b00 && cp <= 0x2bff)      // ⬆⬇⬛ 等箭头/几何符号
    );
  }

  function fixString(s) {
    var cps = Array.from(s); // 按码点切分，避免拆散代理对
    var out = "", changed = false;
    for (var j = 0; j < cps.length; j++) {
      var ch = cps[j];
      var cp = ch.codePointAt(0);
      out += ch;
      if (isEmojiCp(cp)) {
        var next = cps[j + 1];
        var nextCp = next ? next.codePointAt(0) : 0;
        if (nextCp === 0xfe0f || nextCp === 0xfe0e) continue; // 已有显式变体选择符
        out += "\uFE0F";
        changed = true;
      }
    }
    return changed ? out : null;
  }

  function shouldSkip(el) {
    // 不进入正文编辑区与用户内容
    var n = el;
    while (n && n !== document.body) {
      if (n.nodeType === 1) {
        var cl = (typeof n.className === "string" ? n.className : "");
        if (cl.indexOf("ProseMirror") >= 0) return true;
        if (n.isContentEditable) return true;
        var tag = n.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SCRIPT" || tag === "STYLE" || tag === "CODE" || tag === "PRE") return true;
      }
      n = n.parentNode;
    }
    return false;
  }

  function processRoot(root) {
    var buttons;
    if (root.nodeType === 1 && root.tagName === "BUTTON") buttons = [root];
    else buttons = root.querySelectorAll ? root.querySelectorAll("button") : [];
    for (var b = 0; b < buttons.length; b++) {
      var btn = buttons[b];
      if (shouldSkip(btn)) continue;
      var walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null, false);
      var nodes = [], tn;
      while ((tn = walker.nextNode())) {
        if (tn.nodeValue && tn.nodeValue.length <= 24) nodes.push(tn);
      }
      for (var k = 0; k < nodes.length; k++) {
        var fixed = fixString(nodes[k].nodeValue);
        if (fixed) nodes[k].nodeValue = fixed;
      }
    }
  }

  var pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () {
      pending = false;
      try { processRoot(document.body); } catch (e) { /* 忽略 */ }
    });
  }

  function start() {
    processRoot(document.body);
    var mo = new MutationObserver(function (muts) { schedule(); });
    mo.observe(document.body, { childList: true, subtree: true, characterData: false });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

/* ============================================================
   主题切换器 + 交互守卫 + 图片缩放查看
   ============================================================ */
(function () {
  if (window.__czExtras) return;
  window.__czExtras = true;

  /* ---------- 1) 护眼主题切换器（已并入「设置 → 外观」） ----------
     原为独立悬浮 🎨 按钮 + 弹层（cz-theme-pop）。现该功能已重构成 React 的 AppSettings.czTheme，
     由设置面板「🎨 外观 → 护眼主题」驱动，data-cztheme 由 src/App.tsx 效果与应用设置接管。
     此处不再注入悬浮按钮/弹层，仅保留历史注释以说明来源。 */

  /* ---------- 2) 切换便签/图片后 0.7s 内拦截双击误入编辑 ---------- */
  var lastTypeToggle = 0;

  /* ---------- 3) 图片卡：捏合缩放 / 双击放大 ---------- */
  var ZMIN = 1, ZMAX = 5;
  function getImgEl(target) {
    var wrap = target && target.closest ? target.closest(".card-image-wrap") : null;
    return wrap ? wrap.querySelector("img") : null;
  }
  function setT(img, s, tx, ty) {
    img.style.transformOrigin = "center center";
    img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
  }
  var pointers = new Map(); // imgEl -> Map(pointerId -> {x,y})
  var scales = new WeakMap();

  document.addEventListener("pointerdown", function (e) {
    var img = getImgEl(e.target);
    if (!img) return;
    var m = pointers.get(img) || new Map();
    m.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pointers.set(img, m);
    if (m.size === 2) e.stopPropagation(); // 双指时不触发卡片拖拽
  }, true);

  document.addEventListener("pointermove", function (e) {
    var img = getImgEl(e.target);
    if (!img) return;
    var m = pointers.get(img);
    if (!m || !m.has(e.pointerId)) return;
    var prev = m.get(e.pointerId);
    var s = scales.get(img) || 1;

    if (m.size >= 2) {
      m.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var pts = [...m.values()];
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      var pd = img.__czPinchDist || d;
      var ns = Math.min(ZMAX, Math.max(ZMIN, (scales.get(img) || 1) * (d / pd)));
      img.__czPinchDist = d;
      scales.set(img, ns);
      setT(img, ns, img.__czTx || 0, img.__czTy || 0);
      e.stopPropagation();
    } else if (s > 1) {
      var tx = (img.__czTx || 0) + (e.clientX - prev.x);
      var ty = (img.__czTy || 0) + (e.clientY - prev.y);
      img.__czTx = tx; img.__czTy = ty;
      m.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setT(img, s, tx, ty);
      e.stopPropagation();
    }
  }, true);

  function endPointer(e) {
    var img = getImgEl(e.target);
    if (!img) return;
    var m = pointers.get(img);
    if (m) { m.delete(e.pointerId); img.__czPinchDist = undefined; }
  }
  document.addEventListener("pointerup", endPointer, true);
  document.addEventListener("pointercancel", endPointer, true);

  // 双击/双触：放大 ↔ 复位
  var lastTap = 0;
  document.addEventListener("pointerup", function (e) {
    var img = getImgEl(e.target);
    if (!img) return;
    var now = Date.now();
    if (now - lastTap < 320) {
      lastTap = 0;
      var s = scales.get(img) || 1;
      if (s > 1) { scales.set(img, 1); img.__czTx = 0; img.__czTy = 0; setT(img, 1, 0, 0); }
      else { scales.set(img, 2.5); setT(img, 2.5, 0, 0); }
      e.stopPropagation();
    } else {
      lastTap = now;
    }
  }, true);

  /* ---------- 启动 ---------- */
  function start() {
    // 护眼主题已并入「设置 → 外观」，由 React 的 AppSettings.czTheme 驱动 data-cztheme，
    // 这里不再注入悬浮 🎨 按钮，仅保留 2) 误双击拦截 与 3) 图片缩放 等交互守卫。
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // 拦截"切换卡片类型"后的误双击
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest('button[title*="切换为图片卡"], button[title*="切换为便签卡"]');
    if (b) lastTypeToggle = Date.now();
  }, true);
  document.addEventListener("dblclick", function (e) {
    if (Date.now() - lastTypeToggle < 700) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
})();

/* ---------- 桌面鼠标事件合帧：松开时冲刷挂起的 move ---------- */
(function () {
  if (window.__czFlushGate) return;
  window.__czFlushGate = true;
  window.addEventListener("pointerup", function () {
    var g = window.__czG;
    if (g && g.r) {
      cancelAnimationFrame(g.r);
      g.r = 0;
      var p = g.p;
      g.p = null;
      if (p && g.f) { try { g.f(p); } catch (e) {} }
    }
  }, true);
})();

/* ---------- 选中卡片尺寸徽标（缩放/拖动时显示 宽 × 高） ---------- */
(function () {
  if (window.__czSizeBadge) return;
  window.__czSizeBadge = true;
  var badge = null, hideTimer = 0;
  function ensure() {
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "cz-size-badge";
      // 挂到画布容器内（而非 body），使徽标被画布 overflow:hidden 裁剪并受其层叠上下文约束，
      // 彻底避免它串到顶栏 / 侧栏 / 右侧面板 / 状态栏等页面上层。
      var wrap = document.querySelector(".canvas-wrap");
      (wrap || document.body).appendChild(badge);
    }
    return badge;
  }
  function update(card) {
    var w = parseFloat(card.style.width), h = parseFloat(card.style.height);
    if (!(w > 0 && h > 0)) return;
    var b = ensure();
    b.textContent = Math.round(w) + " × " + Math.round(h);
    var r = card.getBoundingClientRect();
    var wrap = document.querySelector(".canvas-wrap");
    var wr = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 };
    // 用画布内相对坐标定位（徽标为画布子元素，position:absolute）
    b.style.left = Math.min(Math.max(r.left - wr.left + r.width / 2, 40), (wrap ? wr.width : window.innerWidth) - 40) + "px";
    b.style.top = Math.max(6, r.top - wr.top - 30) + "px";
    b.style.opacity = "1";
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (badge) badge.style.opacity = "0"; }, 900);
  }
  var pending = false;
  function scan() {
    pending = false;
    // 有全屏覆盖层（弹窗/全屏编辑器/写作模式/娱乐场等）时，不显示画布卡片尺寸徽标，
    // 避免该 fixed 徽标串到其他页面上层（卡片尺寸窗口会在其他页面显示的问题）。
    if (document.querySelector(".modal-mask, .fullscreen-editor")) {
      if (badge) badge.style.opacity = "0";
      return;
    }
    var card = document.querySelector(".card.selected");
    if (card && card.style.width) update(card);
    else { clearTimeout(hideTimer); if (badge) badge.style.opacity = "0"; } /* 选中框消失 → 尺寸立即隐藏，与框同步 */
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(scan);
  }
  function start() {
    new MutationObserver(schedule).observe(document.body, {
      attributes: true, attributeFilter: ["style", "class"], subtree: true,
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

/* ============================================================
   统一交互反馈（2026-09）：轻点触觉 / 长按视觉
   · tap：短按抬起（<350ms 且几乎未移动）→ 轻震 8ms
   · .cz-press：按住 250ms 未移动 → 元素加按压态（长按功能前的确认视觉）
   · window.__czHaptic：统一 API（tap / longPress / enabled），后续代码可直接调用
   · 排除：画布卡片 / 画布空白（拖拽与业务长按自管）、输入框、禁用态
   ============================================================ */
(function () {
  if (window.__czFeedback) return;
  window.__czFeedback = true;

  var NAV = navigator;
  function vib(ms) {
    try { if (window.__czHaptic && window.__czHaptic.enabled !== false && NAV.vibrate) NAV.vibrate(ms); } catch (e) { /* ignore */ }
  }
  window.__czHaptic = {
    enabled: true,
    tap: function () { vib(8); },
    longPress: function () { vib(24); },
  };

  /* 可点击目标（统一反馈范围；画布卡片/空白由业务逻辑负责） */
  function isInteractive(el) {
    if (!el || !el.closest) return false;
    var t = el.closest("button, [role='button'], .btn, .clickable, .sec-item, .page-item, .outline-item, .tpl-item, .tab-btn, .tl-item, .cal-day-item, .cal-add-btn, .cal-nav-btn, .hub-tabs button, .sb-tabs button, .tabs button, .welcome-book-face, .ai-quick, .menu-item, .modal .list-item");
    if (!t) return false;
    if (t.disabled || t.closest(":disabled")) return false;
    // 输入类元素交给系统（打字、拖选文本不需要震动）
    if (el.closest("input, textarea, select, [contenteditable='true']")) return false;
    return t;
  }

  var pd = null; // {x, y, t, el, pressTimer, moved, wasPress}
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return; // 仅触屏
    var target = isInteractive(e.target);
    if (!target) return;
    pd = { x: e.clientX, y: e.clientY, t: Date.now(), el: target, moved: false, wasPress: false };
    pd.pressTimer = setTimeout(function () {
      if (!pd || pd.moved) return;
      pd.wasPress = true;
      pd.el.classList.add("cz-press");
    }, 250);
  }, true);

  function endPointer(e) {
    if (!pd) return;
    clearTimeout(pd.pressTimer);
    var dx = Math.abs(e.clientX - pd.x), dy = Math.abs(e.clientY - pd.y);
    if (pd.wasPress && dx < 12 && dy < 12) {
      // 长按过 → 给一次明确的长按确认（菜单/功能弹起时一并感知）
      pd.el.classList.remove("cz-press");
      pd.el.classList.add("cz-longpress");
      setTimeout((function (el) { return function () { el.classList.remove("cz-longpress"); }; })(pd.el), 380);
    } else {
      pd.el.classList.remove("cz-press");
      // 短按轻点 → 轻震（拖动/滑动不震）
      var dt = Date.now() - pd.t;
      if (dt < 350 && dx < 10 && dy < 10) { vib(8); }
    }
    pd = null;
  }
  document.addEventListener("pointerup", endPointer, true);
  document.addEventListener("pointercancel", endPointer, true);
  document.addEventListener("pointermove", function (e) {
    if (!pd) return;
    if (Math.abs(e.clientX - pd.x) > 10 || Math.abs(e.clientY - pd.y) > 10) {
      pd.moved = true;
      pd.el.classList.remove("cz-press");
    }
  }, true);
})();

