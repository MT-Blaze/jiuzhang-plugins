/**
 * ui_batch_return.js —— 批次卡片上的【重新识别】整批打回（2.20.0 卡§2，可整块下架）。
 *
 * 点击→确认（摆明未入库作废/已入库留库的账）→宿主把原卷＋元数据原样交回→
 * 落文件收集框，老师用收集框旁识别下拉选链路（7 链路＋自动）再点【开始解析】。
 * 下架：删 index.html 同行 script 引用＋plugin.js 的创建行后半与 :291 包裹后半，
 * 或给 .btn-return-batch 加 display:none，核心渲染一处不用改。
 */
(function (global) {
  "use strict";

  function create(deps) {
    var coreState = deps.coreState;
    var dock = deps.dock;
    var dockWarn = deps.dockWarn;
    var dom = deps.dom;
    var el = deps.el;
    var errorDetail = deps.errorDetail;
    var hostCall = deps.hostCall;
    var basketAdd = deps.basketAdd;
    var publishSelection = deps.publishSelection;
    var publishView = deps.publishView;
    var refreshBatches = deps.refreshBatches;
    var setMode = deps.setMode;
    var state = coreState.state;

    /** data_url → File：沙箱 CSP 拦 data:/blob: 的 img 与 fetch，atob 自己解字节。
     * 元数据与纯图标记挂在 File 上，ui_intake 的 fileEntry 原样递进宿主。 */
    function dataUrlToFile(info, meta, textLayer) {
      var url = String((info && info.data_url) || "");
      var comma = url.indexOf(",");
      if (comma < 0) return null;
      var mime = (url.slice(0, comma).match(/data:([^;,]+)/) || [])[1]
        || "application/octet-stream";
      var raw = window.atob(url.slice(comma + 1));
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
      var file = new File([bytes], String((info && info.name) || "原卷.pdf"), { type: mime });
      if (meta && typeof meta === "object") file.jzoMeta = meta;
      if (textLayer === false) file.jzoPureImage = true;
      return file;
    }

    function focusBasket() {
      var basketEl = dom && dom.basketEl;
      var goEl = dom && dom.basketGoEl;
      if (basketEl && typeof basketEl.scrollIntoView === "function") {
        basketEl.scrollIntoView({ block: "nearest" });
      }
      if (goEl && typeof goEl.focus === "function") goEl.focus();
    }

    function renderReturnBatchButton(card, row) {
      // 没有原卷副本的批次（API 种进来的）打回无源，不摆一颗死按钮。
      if (!String(card.source_backup || "")) return;
      var batchId = String(card.batch_id || "");
      var button = el("button", "btn-return-batch", "重新识别");
      button.type = "button";
      button.setAttribute("aria-label", "批次 " + batchId + " 整批打回重新识别");
      button.title = "整批打回文件收集框：原卷＋元数据原样，选链路后重新入库";
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        var discarded = Number(card.pending_count || 0);
        var kept = Number(card.approved_count || 0);
        var message = "确认把批次 " + batchId + " 整批打回文件收集框？\n"
          + "原卷「" + (card.source_name || batchId) + "」与批次元数据原样回到收集框，"
          + "选识别链路后点【开始解析】重新入库。\n"
          + discarded + " 道未入库题随批作废；" + kept + " 道已入库题留库不动。";
        if (!window.confirm(message)) return;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.textContent = "打回中…";
        hostCall("pending.return_batch", { batch_id: batchId }).then(function (result) {
          var files = [];
          ((result && result.files) || []).forEach(function (info) {
            var file = dataUrlToFile(info, result.meta, result.text_layer);
            if (file) files.push(file);
          });
          if (!files.length) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.textContent = "重新识别";
            dockWarn("批次 " + batchId + " 打回失败：原卷字节没解出来。");
            return;
          }
          basketAdd(files);
          dock("批次 " + batchId + " 已打回收集框：原卷 " + files.length
            + " 份＋元数据原样。选识别链路后点【开始解析】；"
            + (result.discarded || 0) + " 道未入库已作废，"
            + (result.kept || 0) + " 道已入库留库。");
          if (String(state.batchId || "") === batchId) {
            state.batchId = "";
            state.items = [];
            state.pageImages = [];
            state.scanBatch = false;
            setMode("list");
            publishView("list");
            publishSelection();
          }
          refreshBatches();
          focusBasket();
        }, function (error) {
          button.disabled = false;
          button.removeAttribute("aria-busy");
          button.textContent = "重新识别";
          dockWarn("批次 " + batchId + " 打回失败：" + ((error && error.message) || "未知原因"),
            errorDetail(error));
        });
      });
      row.appendChild(button);
    }

    return { renderReturnBatchButton: renderReturnBatchButton };
  }

  global.JzoEditorBatchReturn = { create: create };
})(window);