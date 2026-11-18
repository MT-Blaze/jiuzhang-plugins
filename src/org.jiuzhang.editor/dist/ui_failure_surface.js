/**
 * ui_failure_surface.js —— ingest 失败显性化（2026-11-18 卡）的插件侧整块：
 * 批次卡徽标 + 失败清单、原卷页徽标、watchRoute 增量过程播报。
 *
 * 可整块下架：删本文件与 failure_surface.css，再删 plugin.js 里三行 deps
 * 与 index.html 里两行引用即可；绿框语义、保批保卷行为一处不碰。
 * 依赖一律由 create(deps) 交进来，模块不认全局、也不碰宿主 DOM。
 */
(function (global) {
  "use strict";

  function create(deps) {
    var state = deps.coreState.state;
    var dock = deps.dock;
    var dockWarn = deps.dockWarn;
    var el = deps.el;
    var publish = deps.publish;
    // 循环引用：openBatch 归 uiBatches、jumpTo 归 uiColumns，组合根用懒包装交进来。
    var openBatch = deps.openBatch;
    var jumpTo = deps.jumpTo;
    var imageBodyEl = deps.dom.imageBodyEl;

    // 防刷屏账：progress 认 seq、failures 认条数，5s 轮询只播增量。
    var seenSeq = {};
    var seenFail = {};

    function failuresOf(route) {
      return (route && Array.isArray(route.failures)) ? route.failures : [];
    }

    /** 「N 份」按文件数：一份卷子两步失败也只算一份。 */
    function fileCount(failures) {
      var names = [];
      failures.forEach(function (entry) {
        var name = String((entry && entry.file) || "");
        if (names.indexOf(name) < 0) names.push(name);
      });
      return names.length;
    }

    /** 失败摘要与底座 progress 的 error 行同一口径，两本账才认得出同一条。 */
    function failureText(entry) {
      return String(entry.file || "") + " " + String(entry.step || "")
        + "失败：" + String(entry.reason || "");
    }

    /** 「看完整诊断」：带 locate 的 region.dock 请宿主认旧账、描边滚到它，不新记一行。 */
    function locateDiagnosis(entry) {
      var text = failureText(entry).slice(0, 360);
      var detail = String(entry.detail || "");
      publish("region.dock", {
        text: "⚠ " + text, level: "warn", topic: "editor.warn", detail: detail,
        locate: { text: text, detail: detail }
      });
    }

    /**
     * watchRoute 每拍交进来的增量播报：
     * 新 failures 带完整现场进【报错诊断】；新 progress 按 level 分流——
     * info/ok 进【运行日志】，warn 进【报错诊断】。error 级过程行与 failures
     * 是底座同一笔记的两面，只播 failures 那面，不重复刷屏。
     */
    function reportRoute(batchId, route) {
      var id = String(batchId || "");
      if (!id || !route) return;
      var failures = failuresOf(route);
      var known = Number(seenFail[id]) || 0;
      if (failures.length > known) {
        failures.slice(known).forEach(function (entry) {
          dockWarn(failureText(entry), String(entry.detail || ""));
        });
        seenFail[id] = failures.length;
      }
      var progress = Array.isArray(route.progress) ? route.progress : [];
      var lastSeq = Number(seenSeq[id]) || 0;
      progress.forEach(function (step) {
        var seq = Number(step && step.seq) || 0;
        if (seq <= lastSeq) return;
        lastSeq = seq;
        var text = String((step && step.text) || "");
        if (!text) return;
        var level = String((step && step.level) || "info");
        if (level === "error") return;
        if (level === "warn") dockWarn(text);
        else dock(text, level === "ok" ? "ok" : "info", "editor.ingest");
      });
      seenSeq[id] = lastSeq;
    }

    /** 定位原卷页：开批次 → 左栏滚到那一页并描边；非整卷批次退到对应题行。 */
    function locatePage(card, pageNo) {
      var id = String((card && card.batch_id) || "");
      if (!id) return;
      Promise.resolve(openBatch(id)).then(function () {
        var cell = state.scanBatch && imageBodyEl
          ? imageBodyEl.querySelector('.ed-page-cell[data-page-index="' + (pageNo - 1) + '"]')
          : null;
        if (cell) {
          cell.scrollIntoView({ block: "start" });
          highlightCell(cell);
          return;
        }
        if (!state.items.length) return;
        var index = 0;
        state.items.forEach(function (item, position) {
          var page = item && item.pageImage;
          if (page && Number(page.page) === pageNo) index = position;
        });
        jumpTo(index);
      });
    }

    function highlightCell(cell) {
      if (imageBodyEl) {
        Array.prototype.forEach.call(
          imageBodyEl.querySelectorAll(".is-fail-located"), function (node) {
            node.classList.remove("is-fail-located");
          });
      }
      cell.classList.add("is-fail-located");
    }

    function failureRow(card, entry) {
      var item = el("div", "ed-fail-item");
      var pageNo = Number(entry.page_no) || 0;
      var head = String(entry.file || "")
        + (pageNo > 0 ? " · 第 " + pageNo + " 页" : "")
        + " · " + String(entry.step || "");
      item.appendChild(el("p", "ed-fail-head", head));
      item.appendChild(el("p", "ed-fail-reason", String(entry.reason || "")));
      var actions = el("div", "ed-fail-actions");
      var locateBtn = el("button", "ed-fail-btn", "定位原卷页");
      locateBtn.type = "button";
      if (pageNo < 1 || (Number(card.page_count) || 0) < 1) {
        locateBtn.disabled = true;
        locateBtn.title = "这一条没有对应的原卷页";
        locateBtn.setAttribute("aria-disabled", "true");
      } else {
        locateBtn.setAttribute("aria-label",
          "定位 " + entry.file + " 第 " + pageNo + " 页原卷");
        locateBtn.addEventListener("click", function () { locatePage(card, pageNo); });
      }
      actions.appendChild(locateBtn);
      var diagBtn = el("button", "ed-fail-btn", "看完整诊断");
      diagBtn.type = "button";
      diagBtn.setAttribute("aria-label",
        "在报错诊断里查看 " + entry.file + " " + entry.step + " 的完整现场");
      diagBtn.addEventListener("click", function () { locateDiagnosis(entry); });
      actions.appendChild(diagBtn);
      item.appendChild(actions);
      return item;
    }

    /** 批次卡徽标：图标+数字（不只靠颜色），点开内联失败清单，不弹窗。 */
    function renderBatchBadge(card, row) {
      var failures = failuresOf(card && card.route);
      if (!failures.length) return;
      var count = fileCount(failures);
      var badge = el("button", "ed-batch-failbadge");
      badge.type = "button";
      badge.setAttribute("aria-expanded", "false");
      badge.setAttribute("aria-label",
        "批次 " + card.batch_id + " 有 " + count + " 份未自动切出，点开失败清单");
      badge.appendChild(el("span", "ed-fail-icon", "⚠"));
      badge.appendChild(el("span", "ed-fail-text", count + " 份未自动切出"));
      var list = el("div", "ed-fail-list");
      list.hidden = true;
      failures.forEach(function (entry) { list.appendChild(failureRow(card, entry)); });
      badge.addEventListener("click", function (event) {
        event.stopPropagation();
        list.hidden = !list.hidden;
        badge.setAttribute("aria-expanded", String(!list.hidden));
      });
      // 清单里的空白处也不许触发整行的「进批次」。
      list.addEventListener("click", function (event) { event.stopPropagation(); });
      row.appendChild(badge);
      row.appendChild(list);
    }

    /** 原卷页徽标：有 failures 的页挂图标+数字；点击 → 报错诊断定位 + 本页描边。
     * page_no=0 是批次级失败（如自动切题整批没切出），它波及每一页，故每页都挂。 */
    function renderPageBadge(page, pageNo, frame, cell) {
      var failures = failuresOf(state.route).filter(function (entry) {
        var entryPage = Number(entry && entry.page_no) || 0;
        return entryPage === pageNo || entryPage === 0;
      });
      if (!failures.length) return;
      var badge = el("button", "ed-page-failbadge");
      badge.type = "button";
      badge.setAttribute("aria-label",
        "原卷第 " + pageNo + " 页有 " + failures.length + " 处失败，点击在报错诊断里定位");
      badge.appendChild(el("span", "ed-fail-icon", "⚠"));
      badge.appendChild(el("span", "ed-fail-text", String(failures.length)));
      badge.addEventListener("click", function (event) {
        event.stopPropagation();
        locateDiagnosis(failures[0]);
        highlightCell(cell);
      });
      frame.appendChild(badge);
    }

    return {
      failureText: failureText,
      failuresOf: failuresOf,
      fileCount: fileCount,
      locateDiagnosis: locateDiagnosis,
      locatePage: locatePage,
      renderBatchBadge: renderBatchBadge,
      renderPageBadge: renderPageBadge,
      reportRoute: reportRoute,
    };
  }

  global.JzoFailureSurface = { create: create };
})(window);