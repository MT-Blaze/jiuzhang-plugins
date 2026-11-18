/**
 * ui_modal.js —— plugin.js 的「弹窗」小节抽出来的独立模块
 * （PLUGIN_SPEC §2.8.1：任何插件 JS 单文件不超过 800 行）。
 *
 * 依赖一律由 create(deps) 交进来，模块不认全局、也不碰宿主 DOM。
 * 2026-11-19 起兼管两只配置内联视图的开合（openView/closeView）：
 * 它们不再是模态——不进焦点圈、不吃 Esc，画布主区域整屏切换、返回还原状态。
 */
(function (global) {
  "use strict";

  function create(deps) {
    var coreState = deps.coreState;
    var panel = coreState.panel;
    var state = coreState.state;
    var setMode = deps.setMode;
    var dom = deps.dom;
    var delModalEl = dom.delModalEl;
    var batchPurgeModalEl = dom.batchPurgeModalEl;
    var poolDelModalEl = dom.poolDelModalEl;
    var aiOverwriteModalEl = dom.aiOverwriteModalEl;
    var modelModalEl = dom.modelModalEl;

  // ---------- 弹窗：彻底删除（焦点圈住、Esc 可关、关掉还焦） ----------
  // 查重对比浮层不在这套里：它按军令 #23 一颗按钮都不放（画布里只许有题目内容），
  // 没有可圈住的焦点，开合由 ui_dup.js 自己管。
  // aiConfigModalEl 与 modelConfigModalEl 已改画布内联视图：不再进这份名单，
  // 焦点不圈、Esc 不关，开合走下面的 openView/closeView。
  var modalRestoreFocus = null;

  function openModalNode() {
    if (delModalEl && !delModalEl.hidden) return delModalEl;
    if (batchPurgeModalEl && !batchPurgeModalEl.hidden) return batchPurgeModalEl;
    // 重题池的【删除】同样走二次确认（军令 #32 · 判据 5.4）：不加进这一串，
    // 焦点圈不住、Esc 也关不掉，等于把红按钮的确认样式做成两套。
    if (poolDelModalEl && !poolDelModalEl.hidden) return poolDelModalEl;
    // 覆盖确认（终极军令 任务三）仍是真模态：要圈得住焦点、Esc 能关。
    if (aiOverwriteModalEl && !aiOverwriteModalEl.hidden) return aiOverwriteModalEl;
    // 本地模型下载选择（按需下载）：Esc 能关、焦点圈得住。
    if (modelModalEl && !modelModalEl.hidden) return modelModalEl;
    return null;
  }

  function openModal(node) {
    if (!node) return;
    modalRestoreFocus = document.activeElement;
    node.hidden = false;
    var first = node.querySelector("button");
    if (first && typeof first.focus === "function") first.focus();
  }

  function closeModal(node) {
    if (!node || node.hidden) return;
    node.hidden = true;
    if (modalRestoreFocus && typeof modalRestoreFocus.focus === "function") {
      modalRestoreFocus.focus();
    }
    modalRestoreFocus = null;
  }

  // ---------- 配置内联视图：画布主区域整屏切换（2026-11-19，不再做弹窗） ----------
  // 打开＝setMode 进配置屏（批次/三栏/池屏全隐，状态原封不动）；返回＝还原先前屏、
  // 滚动位置与触发按钮焦点。两视图互斥由 setMode 保证；从一视图跳另一视图时
  // 不重新记账，返回仍落回最初的批次屏。
  var viewReturn = null;

  function configViewNode(mode) {
    if (mode === "ai_config") return dom.aiConfigModalEl;
    if (mode === "model_config") return dom.modelConfigModalEl;
    return null;
  }

  function scrollableNodes() {
    return [dom.batchesEl, dom.batchListEl && dom.batchListEl.parentNode,
      dom.imageBodyEl, dom.sourceBodyEl, dom.renderBodyEl,
      dom.originalBodyEl, dom.poolCanvasEl];
  }

  function openView(mode) {
    var node = configViewNode(mode);
    if (!node || !setMode) return;
    if (!viewReturn) {
      var scrolls = [];
      scrollableNodes().forEach(function (item) {
        if (item) scrolls.push([item, item.scrollTop]);
      });
      var trigger = document.activeElement;
      if (!trigger || trigger === document.body) {
        trigger = mode === "ai_config" ? dom.aiConfigListEl : dom.modelConfigBtnEl;
      }
      viewReturn = { mode: state.mode, scrolls: scrolls, trigger: trigger };
    }
    setMode(mode);
    var title = node.querySelector(".ed-config-view-title");
    if (title && typeof title.focus === "function") title.focus();
  }

  function closeView() {
    var back = viewReturn;
    viewReturn = null;
    if (!back || !setMode) return;
    // 已被别的路径（宿主激活等）切出配置屏时只清账，不再二次切换。
    if (!configViewNode(state.mode)) return;
    setMode(back.mode);
    back.scrolls.forEach(function (pair) { pair[0].scrollTop = pair[1]; });
    var trigger = back.trigger;
    if (trigger && trigger.offsetParent !== null && typeof trigger.focus === "function") {
      trigger.focus();
    }
  }

  /** 折叠表单的通用开关：同步 hidden、aria-expanded 与按钮文案，展开时聚焦首个输入框。 */
  function setSwitcher(formId, buttonId, open, offText, onText) {
    var form = document.getElementById(formId);
    var button = document.getElementById(buttonId);
    if (form) form.hidden = !open;
    if (button) {
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? onText : offText;
    }
    var first = open && form && form.querySelector("input, select, textarea");
    if (first) first.focus();
  }

  /** 点按钮开合表单：展开时先回调 onOpen（清空旧值），再交给 setSwitcher 聚焦。 */
  function bindSwitcher(formId, buttonId, offText, onText, onOpen) {
    var button = document.getElementById(buttonId);
    if (!button) return;
    button.addEventListener("click", function () {
      var form = document.getElementById(formId);
      var open = !!(form && form.hidden);
      if (open && onOpen) onOpen();
      setSwitcher(formId, buttonId, open, offText, onText);
    });
  }

  document.addEventListener("keydown", function (event) {
    var node = openModalNode();
    if (!node) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal(node);
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = node.querySelectorAll("button");
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

    return {
      bindSwitcher: bindSwitcher,
      closeModal: closeModal,
      closeView: closeView,
      modalRestoreFocus: modalRestoreFocus,
      openModal: openModal,
      openModalNode: openModalNode,
      openView: openView,
      setSwitcher: setSwitcher,
    };
  }

  global.JzoEditorModal = { create: create };
})(window);
