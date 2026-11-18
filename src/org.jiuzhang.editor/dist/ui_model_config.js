/**
 * ui_model_config.js —— 模型配置页（可整块下架）。
 *
 * 清单单源宿主 registry（models.registry_status）：目录全量 × 三态＋硬件快照＋显存档位表。
 * 本页：逐条大白话使用说明；【启用/停用】与默认选择经 models.prefs_save 代笔进
 * 插件目录 model_prefs.toml（插件财产，carried 语义，不落宿主 data/）；
 * MinerU【安装本地 MinerU】经 models.mineru_install 一键装进隔离环境，进度轮询
 * models.mineru_status；YOLO【下载】复用 ui_model.js 通道；云端【去 API 配置指派】。
 * 停用＝下拉不显示＋自动跳过，不卸载；只有就绪且启用的条目进下拉（applyEngines）。
 * 2026-11-19 起本页是画布内联视图（不做弹窗）：开合走 openView/closeView 整屏切换，
 * 批次列表期间隐藏、返回原样恢复；数据驱动渲染一行不改。
 * 整块下架：删本文件、panel_model_config.css、index.html 的 #epModelConfigList 按钮、
 * #edModelConfigModal 视图段与那一行 script；下拉静态只剩「自动」，解析照走自动瀑布。
 */
(function (global) {
  "use strict";

  var STATE_LABELS = { ready: "就绪", degraded: "未就绪", blocked: "暂不可用" };

  function create(deps) {
    var dockWarn = deps.dockWarn;
    var hostCall = deps.hostCall;
    var el = deps.el;
    var state = deps.coreState.state;
    var openView = deps.openView;
    var closeView = deps.closeView;
    var openAiConfig = deps.openAiConfig;
    var downloadModel = deps.downloadModel;
    var applyEngines = deps.applyEngines;
    var dom = deps.dom;
    var viewEl = dom.modelConfigModalEl;
    var listEl = dom.modelConfigListEl;
    var msgEl = dom.modelConfigMsgEl;
    var refreshEl = dom.modelConfigRefreshEl;
    var backEl = dom.modelConfigBackEl;
    var buttonEl = dom.modelConfigBtnEl;

    var entries = [];
    var hardware = {};
    var tiers = [];
    var vramNote = "";
    var defaults = { layout: "auto", recognize: "auto" };
    var pollTimer = null;
    var installTimer = null;
    var wired = false;

    function say(text) {
      if (msgEl) msgEl.textContent = text || "";
    }

    function failText(error) {
      return (error && error.message) || "未知原因";
    }

    function readyIds(kind) {
      var ids = ["auto"];
      entries.forEach(function (entry) {
        var capability = String(entry.capability || "");
        if (entry.state === "ready" && entry.enabled !== false &&
            (capability === kind || capability === "both")) {
          ids.push(String(entry.id));
        }
      });
      return ids;
    }

    function nameOf(id) {
      if (id === "auto") return "自动";
      for (var i = 0; i < entries.length; i += 1) {
        if (String(entries[i].id) === id) return String(entries[i].name || id);
      }
      return id;
    }

    function renderHardware() {
      var box = el("div", "ep-model-config-hw");
      box.appendChild(el("p", "ep-model-config-hw-line",
        "本机显卡：" + (hardware.gpu_name || "读不到") +
        "｜显存：" + (hardware.vram_label || "读不到")));
      if (hardware.detail) {
        box.appendChild(el("p", "ep-model-config-hw-detail", String(hardware.detail)));
      }
      if (tiers.length) {
        var table = el("table", "ep-model-config-tiers");
        var headRow = el("tr");
        headRow.appendChild(el("th", "", "显存档位"));
        headRow.appendChild(el("th", "", "可跑本地 VLM"));
        table.appendChild(headRow);
        tiers.forEach(function (tier) {
          var row = el("tr");
          row.appendChild(el("td", "", String(tier.min_gb || "") + "G 起"));
          row.appendChild(el("td", "", String(tier.fits || "")));
          table.appendChild(row);
        });
        box.appendChild(table);
      }
      if (vramNote) box.appendChild(el("p", "ep-model-config-hw-note", vramNote));
      return box;
    }

    function savePrefs(patch) {
      say("正在保存勾选…");
      return hostCall("models.prefs_save", patch, 15000).then(function () {
        return refresh();
      }, function (error) {
        say("保存失败：" + failText(error));
        dockWarn("模型配置：勾选保存失败：" + failText(error));
      });
    }

    function renderDefaults() {
      var box = el("div", "ep-model-config-defaults");
      box.appendChild(el("span", "ep-model-config-defaults-label", "默认引擎（新批次初值）："));
      [["layout", "版面", "default_layout"], ["recognize", "识别", "default_recognize"]]
        .forEach(function (spec) {
          var wrap = el("label", "ep-model-config-default-field");
          wrap.appendChild(el("span", "", spec[1]));
          var select = el("select", "ep-model-config-default-select");
          var ids = readyIds(spec[0]);
          ids.forEach(function (id) {
            var option = el("option", "", nameOf(id));
            option.value = id;
            select.appendChild(option);
          });
          var current = String(defaults[spec[0]] || "auto");
          select.value = ids.indexOf(current) < 0 ? "auto" : current;
          select.addEventListener("change", function () {
            var patch = {};
            patch[spec[2]] = select.value;
            savePrefs(patch);
          });
          wrap.appendChild(select);
          box.appendChild(wrap);
        });
      return box;
    }

    function toggleEntry(entry) {
      var disabled = [];
      entries.forEach(function (item) {
        var off = item.enabled === false;
        if (String(item.id) === String(entry.id)) off = !off;
        if (off) disabled.push(String(item.id));
      });
      savePrefs({ disabled: disabled });
    }

    function render() {
      if (!listEl) return;
      listEl.textContent = "";
      listEl.appendChild(renderHardware());
      listEl.appendChild(renderDefaults());
      entries.forEach(function (entry) {
        var state = String(entry.state || "");
        var off = entry.enabled === false;
        var row = el("div", "ep-model-config-row ep-model-config-" + state +
          (off ? " ep-model-config-disabled" : ""));
        row.setAttribute("role", "listitem");
        var head = el("div", "ep-model-config-head");
        head.appendChild(el("span", "ep-model-config-name", String(entry.name || entry.id || "")));
        head.appendChild(el("span", "ep-model-config-state", STATE_LABELS[state] || state));
        var toggle = el("button", "ep-btn ep-mini-btn ep-model-config-toggle", off ? "启用" : "停用");
        toggle.type = "button";
        toggle.title = "停用＝下拉不显示＋自动跳过，不卸载";
        toggle.addEventListener("click", function () { toggleEntry(entry); });
        head.appendChild(toggle);
        row.appendChild(head);
        row.appendChild(el("p", "ep-model-config-summary", String(entry.summary || "")));
        if (entry.summary_usage) {
          row.appendChild(el("p", "ep-model-config-usage", String(entry.summary_usage)));
        }
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
            if (typeof openAiConfig === "function") openAiConfig();
          });
          row.appendChild(assignBtn);
        } else if (action === "install") {
          var installBtn = el("button", "ep-btn ep-mini-btn ep-model-config-act",
            state === "blocked" ? "重试安装" : "安装本地 MinerU");
          installBtn.type = "button";
          installBtn.addEventListener("click", function () { startInstall(installBtn); });
          row.appendChild(installBtn);
        }
        listEl.appendChild(row);
      });
    }

    /** 体检每次现算（D3b）：读失败不动下拉，保住上一次的就绪清单。 */
    function refresh() {
      say("正在体检模型状态…");
      return hostCall("models.registry_status", {}, 15000).then(function (result) {
        entries = (result && Array.isArray(result.entries)) ? result.entries : [];
        hardware = (result && result.hardware) || {};
        tiers = (result && Array.isArray(result.vram_tiers)) ? result.vram_tiers : [];
        vramNote = String((result && result.vram_note) || "");
        defaults = (result && result.defaults) || { layout: "auto", recognize: "auto" };
        render();
        say("");
        if (typeof applyEngines === "function") applyEngines(entries, defaults);
        return entries;
      }, function (error) {
        say("模型状态读取失败：" + failText(error));
        dockWarn("模型配置：读取注册表失败：" + failText(error));
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

    function stopInstallPolling() {
      if (installTimer) window.clearInterval(installTimer);
      installTimer = null;
    }

    // 安装是后台线程：这里轮询进度快照，装好/装坏都刷新本页与下拉。
    function watchInstall() {
      if (installTimer) return;
      var polls = 0;
      installTimer = window.setInterval(function () {
        polls += 1;
        hostCall("models.mineru_status", {}, 15000).then(function (status) {
          var state = String((status && status.state) || "");
          var step = String((status && status.step) || "");
          var message = String((status && status.message) || "");
          if (state === "installing") {
            say("正在安装本地 MinerU：" + (step || "准备中") + (message ? "（" + message + "）" : ""));
            if (polls < 300) return;
          }
          stopInstallPolling();
          if (state === "error") {
            say("本地 MinerU 安装失败：" + message);
            dockWarn("模型配置：MinerU 安装失败：" + message);
          }
          refresh();
        }, function () { stopInstallPolling(); });
      }, 4000);
    }

    function startInstall(button) {
      button.disabled = true;
      button.textContent = "安装中…";
      say("正在发起本地 MinerU 一键安装（隔离环境、国内镜像）…");
      hostCall("models.mineru_install", {}, 20000).then(function () {
        watchInstall();
      }, function (error) {
        button.disabled = false;
        button.textContent = "安装本地 MinerU";
        say("安装请求失败：" + failText(error));
        dockWarn("模型配置：MinerU 安装请求失败：" + failText(error));
      });
    }

    function open() {
      if (!viewEl) return;
      // 再点同一颗入口＝收视图回批次；视图互斥与状态还原归 openView/closeView。
      if (state.mode === "model_config") { closeView(); return; }
      openView("model_config");
      refresh();
    }

    function wire() {
      if (wired) return;
      wired = true;
      if (buttonEl) buttonEl.addEventListener("click", open);
      if (refreshEl) refreshEl.addEventListener("click", function () { refresh(); });
      if (backEl) backEl.addEventListener("click", closeView);
      refresh();
    }

    return { open: open, refresh: refresh, wire: wire };
  }

  global.JzoEditorModelConfig = { create: create };
})(window);