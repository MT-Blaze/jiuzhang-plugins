/**
 * ui_model_config.js —— 模型配置页（可整块下架）。
 *
 * 清单单源宿主 registry（models.registry_status）：目录全量 × 三态（就绪/未就绪/暂不可用），
 * 只有就绪条目才进解析下拉（经 applyEngines 注入 ui_intake，前端不再硬编码引擎名）。
 * 本页只读状态＋触发既有动作：YOLO【下载】复用 ui_model.js 的下载通道，
 * 云端视觉/MinerU【去 API 配置指派】跳既有模态；不开新下载通道、不写新状态文件。
 * 整块下架：删本文件、panel_model_config.css、index.html 的 #epModelConfigList 按钮、
 * #edModelConfigModal 模态与那一行 script；下拉静态只剩「自动」，解析照走自动瀑布。
 */
(function (global) {
  "use strict";

  var STATE_LABELS = { ready: "就绪", degraded: "未就绪", blocked: "暂不可用" };

  function create(deps) {
    var dockWarn = deps.dockWarn;
    var hostCall = deps.hostCall;
    var el = deps.el;
    var openModal = deps.openModal;
    var closeModal = deps.closeModal;
    var openAiConfig = deps.openAiConfig;
    var downloadModel = deps.downloadModel;
    var applyEngines = deps.applyEngines;
    var dom = deps.dom;
    var modalEl = dom.modelConfigModalEl;
    var listEl = dom.modelConfigListEl;
    var msgEl = dom.modelConfigMsgEl;
    var refreshEl = dom.modelConfigRefreshEl;
    var closeEl = dom.modelConfigCloseEl;
    var buttonEl = dom.modelConfigBtnEl;

    var entries = [];
    var pollTimer = null;
    var wired = false;

    function say(text) {
      if (msgEl) msgEl.textContent = text || "";
    }

    function render() {
      if (!listEl) return;
      listEl.textContent = "";
      entries.forEach(function (entry) {
        var state = String(entry.state || "");
        var row = el("div", "ep-model-config-row ep-model-config-" + state);
        row.setAttribute("role", "listitem");
        var head = el("div", "ep-model-config-head");
        head.appendChild(el("span", "ep-model-config-name", String(entry.name || entry.id || "")));
        head.appendChild(el("span", "ep-model-config-state", STATE_LABELS[state] || state));
        row.appendChild(head);
        row.appendChild(el("p", "ep-model-config-summary", String(entry.summary || "")));
        row.appendChild(el("p", "ep-model-config-detail", String(entry.detail || "")));
        if (state === "ready" && entry.assigned) {
          row.appendChild(el("p", "ep-model-config-assigned", "当前指派：" + String(entry.assigned)));
        }
        var action = String(entry.action || "");
        if (action === "download") {
          var downloadBtn = el("button", "ep-btn ep-mini-btn ep-model-config-act", "下载");
          downloadBtn.type = "button";
          downloadBtn.addEventListener("click", function () { startDownload(downloadBtn); });
          row.appendChild(downloadBtn);
        } else if (action === "assign") {
          var assignBtn = el("button", "ep-btn ep-mini-btn ep-model-config-act", "去 API 配置指派");
          assignBtn.type = "button";
          assignBtn.addEventListener("click", function () {
            closeModal(modalEl);
            if (typeof openAiConfig === "function") openAiConfig();
          });
          row.appendChild(assignBtn);
        }
        listEl.appendChild(row);
      });
    }

    /** 体检每次现算（D3b）：读失败不动下拉，保住上一次的就绪清单。 */
    function refresh() {
      say("正在体检模型状态…");
      return hostCall("models.registry_status", {}, 15000).then(function (result) {
        entries = (result && Array.isArray(result.entries)) ? result.entries : [];
        render();
        say("");
        if (typeof applyEngines === "function") applyEngines(entries);
        return entries;
      }, function (error) {
        var text = (error && error.message) || "未知原因";
        say("模型状态读取失败：" + text);
        dockWarn("模型配置：读取注册表失败：" + text);
        return entries;
      });
    }

    function stopPolling() {
      if (pollTimer) window.clearInterval(pollTimer);
      pollTimer = null;
    }

    // 下载进度由 ui_model.js 播进底栏；这里只等它落地，再把本页与下拉刷成就绪。
    function watchDownload() {
      if (pollTimer) return;
      var polls = 0;
      pollTimer = window.setInterval(function () {
        polls += 1;
        hostCall("layout.model_status", {}, 15000).then(function (status) {
          var download = (status && status.download) || {};
          if (download.state === "downloading" && polls < 150) return;
          stopPolling();
          refresh();
        }, function () { stopPolling(); });
      }, 4000);
    }

    function startDownload(button) {
      if (typeof downloadModel !== "function") {
        dockWarn("模型配置：下载通道不在（ui_model.js 已下架），请走【API 配置】或联系管理员。");
        return;
      }
      button.disabled = true;
      button.textContent = "下载中…";
      say("下载进度在底栏【运行日志】；就绪后本页与下拉自动更新。");
      downloadModel();
      watchDownload();
    }

    function open() {
      if (!modalEl) return;
      openModal(modalEl);
      refresh();
    }

    function wire() {
      if (wired) return;
      wired = true;
      if (buttonEl) buttonEl.addEventListener("click", open);
      if (refreshEl) refreshEl.addEventListener("click", function () { refresh(); });
      if (closeEl) closeEl.addEventListener("click", function () { closeModal(modalEl); });
      refresh();
    }

    return { open: open, refresh: refresh, wire: wire };
  }

  global.JzoEditorModelConfig = { create: create };
})(window);