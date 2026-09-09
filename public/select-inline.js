/**
 * select-inline.js —— 把系统原生下拉面板替换为应用内置主题下拉
 * 全局事件代理：拦截所有 <select> 的系统弹出，改在 body 上绘制主题化选项面板。
 * 选择后写回原生 select 并派发 change 事件，React 受控组件照常工作。
 * 纯增量注入：不改动任何业务组件代码。
 */
(function () {
  if (window.__csSelectInline) return;
  window.__csSelectInline = true;

  var STYLE_ID = 'cs-select-inline-style';
  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent =
      '.cs-pop{' +
      'position:fixed;z-index:2147483000;background:var(--panel,#ffffff);' +
      'border:1px solid var(--border,#e3e6ee);border-radius:12px;' +
      'box-shadow:var(--shadow-lg,0 8px 30px rgba(30,40,80,.18));' +
      'padding:4px;overflow-y:auto;overscroll-behavior:contain;' +
      'max-height:min(340px,54vh);min-width:140px;' +
      'animation:cs-pop-in .13s cubic-bezier(.2,.8,.3,1);' +
      '} ' +
      '@keyframes cs-pop-in{from{opacity:0;transform:scale(.97) translateY(-4px)}to{opacity:1;transform:none}}' +
      '.cs-pop::-webkit-scrollbar{width:4px}' +
      '.cs-pop::-webkit-scrollbar-thumb{background:var(--border,#e3e6ee);border-radius:2px}' +
      '.cs-pop-item{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:8px;' +
      'cursor:pointer;color:var(--text,#2d3436);font-size:13px;line-height:1.35;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' +
      'user-select:none;-webkit-user-select:none;}' +
      '.cs-pop-item:hover{background:var(--panel2,#f0f2f8)}' +
      '.cs-pop-item.cur{background:var(--accent-soft,rgba(108,92,231,.12));color:var(--accent,#6c5ce7)}' +
      '.cs-pop-item.cur:hover{background:var(--accent-soft,rgba(108,92,231,.12))}' +
      '.cs-pop-item.dis{opacity:.45;pointer-events:none}' +
      '.cs-pop-check{margin-left:auto;flex:0 0 auto;width:18px;text-align:center;font-size:12px;color:var(--accent,#6c5ce7);font-weight:700}' +
      '.cs-pop-group{padding:6px 10px 3px;font-size:11px;color:var(--muted,#7f8c9b);font-weight:600;}' +
      '';
    document.head.appendChild(st);
  }

  var pop = null;
  var curSelect = null;

  function close() {
    if (pop) {
      pop.remove();
      pop = null;
    }
    curSelect = null;
  }

  function buildItem(sel, option) {
    var d = document.createElement('div');
    d.className = 'cs-pop-item' + (option.selected ? ' cur' : '') + (option.disabled ? ' dis' : '');
    var label = option.textContent == null ? '' : option.textContent;
    d.textContent = label;
    var check = document.createElement('span');
    check.className = 'cs-pop-check';
    check.textContent = option.selected ? '✓' : '';
    d.appendChild(check);
    d.addEventListener('pointerup', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (option.disabled) return;
      if (sel.value !== option.value) {
        try {
          var setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          setter.call(sel, option.value);
        } catch (e) {
          sel.value = option.value;
        }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      close();
    });
    return d;
  }

  function open(sel) {
    close();
    if (sel.disabled || sel.multiple) return;
    curSelect = sel;
    var box = document.createElement('div');
    box.className = 'cs-pop';
    var hasGroup = false;
    var children = sel.children;
    for (var i = 0; i < children.length; i++) {
      var ch = children[i];
      if (ch.tagName === 'OPTGROUP') {
        hasGroup = true;
        var g = document.createElement('div');
        g.className = 'cs-pop-group';
        g.textContent = ch.label || '';
        box.appendChild(g);
        for (var j = 0; j < ch.children.length; j++) {
          var o = ch.children[j];
          if (o.tagName === 'OPTION') box.appendChild(buildItem(sel, o));
        }
      } else if (ch.tagName === 'OPTION') {
        box.appendChild(buildItem(sel, ch));
      }
    }
    if (!box.children.length) return;
    document.body.appendChild(box);

    var r = sel.getBoundingClientRect();
    var bw = Math.max(r.width, 150);
    var maxW = window.innerWidth - 16;
    if (bw > maxW) bw = maxW;
    var bh = box.offsetHeight;
    var left = Math.min(Math.max(r.left, 8), window.innerWidth - bw - 8);
    var top = r.bottom + 6;
    if (top + bh > window.innerHeight - 8) {
      top = r.top - bh - 6;
      if (top < 8) top = Math.max(8, r.bottom + 6);
    }
    box.style.width = bw + 'px';
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    // 当前选中项滚入可视
    var cur = box.querySelector('.cs-pop-item.cur');
    if (cur && cur.scrollIntoView) {
      try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
    }
    pop = box;
  }

  /* ---- 手势判定：按下在 select 上且未滑动（排除滚动意图）---- */
  var downSel = null, downX = 0, downY = 0;
  document.addEventListener('pointerdown', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('select') : null;
    if (t && !t.disabled && !t.multiple) {
      downSel = t;
      downX = e.clientX;
      downY = e.clientY;
      // 关键：立即阻止默认激活（桌面 Chrome 在 mousedown 打开原生下拉，
      // 安卓 WebView 在触摸默认动作调起系统选择器），只保留我们的手势判定
      e.preventDefault();
      e.stopPropagation();
    } else {
      downSel = null;
      if (pop && !(e.target && e.target.closest && e.target.closest('.cs-pop'))) close();
    }
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (downSel && Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 10) downSel = null;
  }, true);

  document.addEventListener('pointerup', function (e) {
    if (downSel) {
      var s = downSel;
      downSel = null;
      e.preventDefault();
      e.stopPropagation();
      open(s);
    }
  }, true);

  /* click 捕获兜底：拦截内核在 click 阶段弹出的系统选择器 */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('select') : null;
    if (t && !t.disabled && !t.multiple) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  /* 触摸兜底：touchend preventDefault 阻止合成 click（系统选择器由 click 默认动作调起；
     某些 WebView 内核在触摸序列里直接弹系统选择器，这里双重拦截） */
  document.addEventListener('touchend', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('select') : null;
    if (t && !t.disabled && !t.multiple) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('touchstart', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('select') : null;
    if (t && !t.disabled && !t.multiple) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  /* 滚动 / 缩放窗口 / 切后台时收起
     注意：面板自身滚动（选项多时浏览/scrollIntoView）不应收起，只有页面滚动才收起 */
  document.addEventListener('scroll', function (e) {
    if (!pop) return;
    var t = e.target;
    if (t === pop || (pop.contains && pop.contains(t))) return; // 面板内部滚动
    close();
  }, true);
  window.addEventListener('resize', function () { if (pop) close(); });
  window.addEventListener('orientationchange', function () { if (pop) close(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) close(); });
})();
