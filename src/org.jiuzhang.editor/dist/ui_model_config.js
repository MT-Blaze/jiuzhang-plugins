/**
 * ui_model_config.js —— 模型配置页编排器（2.20.0 卡§1 重做，可整块下架）。
 *
 * 清单单源宿主 registry（models.registry_status）：目录全量 × 三态＋硬件快照＋显存档位表。
 * 本页只管数据与编排：四栏分组表渲染委托 ui_model_table.js，安装/卸载动线委托
 * ui_model_install.js；两模块不在（同行 script 被删）时回退朴素清单，页面不残。
 * 硬件检测只在老师点进配置中心那一刻跑（probe=1）；启动注入下拉复用上次快照
 * （probe=0），不在启动/轮询里跑探针。【启用/停用】与默认选择经 models.prefs_save
 * 代笔进插件目录 model_prefs.toml（插件财产，carried 语义，不落宿主 data/）；
 * 「自动分流默认」两下拉存 auto_image_seat/auto_text_formula_seat；YOLO【下载】
 * 复用 ui_model.js 通道；云端【去 API 配置】。停用＝下拉不显示＋自动跳过，不卸载；
 * 只有就绪且启用的条目进下拉（applyEngines）。画布内联视图：开合走 openView/closeView。
 * 整块下架：删本文件、ui_model_table.js、ui_model_install.js、panel_model_config.css、
 * panel_model_table.css、index.html 的 #epModelConfigList 按钮、#edModelConfigModal
 * 视图段与那几行同行 script/link；下拉静态只剩「自动」，解析照走自动分流。
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
    var autoSeats = {};
    var pollTimer = null;
    var wired = false;

    function say(text) {
      if (msgEl) msgEl.textContent = text || "";
    }

    function failText(error) {
      return (error && error.message) || "未知原因";
    }

    function readyIds(kind, noCombo) {
      var ids = ["auto"];
      entries.forEach(function (entry) {
        var capability = String(entry.capability || "");
        if (entry.state === "ready" && entry.enabled !== false &&
            (capability === kind || capability === "both") &&
            !(noCombo && (entry.plan_recognize || []).indexOf("combo") >= 0)) {
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

    function entryOf(id) {
      for (var i = 0; i < entries.length; i += 1) {
        if (String(entries[i].id) === String(id)) return entries[i];
      }
      return null;
    }

    function savePrefs(patch) {
      say("正在保存勾选…");
      return hostCall("models.prefs_save", patch, 15000).then(function () {
        return refresh(false);
      }, function (error) {
        say("保存失败：" + failText(error));
        dockWarn("模型配置：勾选保存失败：" + failText(error));
      });
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

    function renderHardware() {
      var box = el("div", "ep-model-config-hw");
      box.appendChild(el("p", "ep-model-config-hw-line",
        "本机显卡：" + (hardware.gpu_name || "读不到") +
        "｜显存：" + (hardware.vram_label || "读不到") +
        "（点进本页时现测）"));
      if (hardware.detail) {
        box.appendChild(el("p", "ep-model-config-hw-detail", String(hardware.detail)));
      }
      if (tiers.length) {
        var more = el("details", "ep-model-config-tiers-more");
        more.appendChild(el("summary", "", "显存档位表（int4 估，标「约」）"));
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
        more.appendChild(table);
        box.appendChild(more);
      }
      if (vramNote) box.appendChild(el("p", "ep-model-config-hw-note", vramNote));
      return box;
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

    /** T6 自动分流默认（置顶组）：两下拉只列就绪座＋自动；存过的未就绪座保留可见并标注。 */
    function renderAutoSeats() {
      var box = el("div", "ep-model-config-defaults ep-model-config-auto-seats");
      box.appendChild(el("span", "ep-model-config-defaults-label",
        "自动分流默认（按卷型分流走哪座；默认座未就绪会显性提示，不偷换）："));
      [["auto_image_seat", "纯图卷·整题座", "recognize"],
       ["auto_text_formula_seat", "文字卷·公式座", "formula"]]
        .forEach(function (spec) {
          var wrap = el("label", "ep-model-config-default-field");
          wrap.appendChild(el("span", "", spec[1]));
          var select = el("select", "ep-model-config-default-select");
          var ready = readyIds(spec[2], spec[0] === "auto_image_seat");
          var ids = ready.slice();
          var current = String(defaults[spec[0]] || "auto");
          if (current !== "auto" && ids.indexOf(current) < 0) ids.push(current);
          ids.forEach(function (id) {
            var label = nameOf(id);
            if (id === "auto") {
              var seat = String(autoSeats[spec[0]] || "");
              var seatEntry = seat ? entryOf(seat) : null;
              var note = seatEntry && seatEntry.state !== "ready" ? "·未就绪" : "";
              label = seat ? "自动（现默认：" + nameOf(seat) + note + "）"
                           : "自动（目录未给默认座，分流会显性提示）";
            } else if (ready.indexOf(id) < 0) {
              label += "（未就绪）";
            }
            var option = el("option", "", label);
            option.value = id;
            select.appendChild(option);
          });
          select.value = current;
          select.addEventListener("change", function () {
            var patch = {};
            patch[spec[0]] = select.value;
            savePrefs(patch);
          });
          wrap.appendChild(select);
          box.appendChild(wrap);
        });
      return box;
    }

    var installer = global.JzoEditorModelInstall ? global.JzoEditorModelInstall.create({
      hostCall: hostCall, dockWarn: dockWarn, say: say,
      hardware: function () { return hardware; },
      refreshed: function () { refresh(false); },
    }) : null;

    var table = global.JzoEditorModelTable ? global.JzoEditorModelTable.create({
      el: el,
      actions: {
        toggle: toggleEntry,
        install: function (entry, button) {
          if (installer) installer.install(entry, button);
        },
        uninstall: function (entry, button) {
          if (installer) installer.uninstall(entry, button);
        },
        download: function (entry, button) { startDownload(button); },
        assign: function () {
          if (typeof openAiConfig === "function") openAiConfig();
        },
      },
    }) : null;

    /** 新表模块不在时的朴素清单回退（整块下架不残页）：名称＋徽章＋说明＋启用停用。 */
    function fallbackRender() {
      entries.forEach(function (entry) {
        var row = el("div", "ep-model-config-row ep-model-config-" + String(entry.state || ""));
        row.setAttribute("role", "listitem");
        var head = el("div", "ep-model-config-head");
        head.appendChild(el("span", "ep-model-config-name", String(entry.name || entry.id || "")));
        head.appendChild(el("span", "ep-model-config-state",
          String(entry.badge || STATE_LABELS[entry.state] || entry.state || "")));
        var toggle = el("button", "ep-btn ep-mini-btn ep-model-config-toggle",
          entry.enabled === false ? "启用" : "停用");
        toggle.type = "button";
        toggle.addEventListener("click", function () { toggleEntry(entry); });
        head.appendChild(toggle);
        row.appendChild(head);
        row.appendChild(el("p", "ep-model-config-summary", String(entry.summary || "")));
        row.appendChild(el("p", "ep-model-config-detail", String(entry.detail || "")));
        listEl.appendChild(row);
      });
    }

    function render() {
      if (!listEl) return;
      listEl.textContent = "";
      listEl.appendChild(renderHardware());
      listEl.appendChild(renderAutoSeats());
      listEl.appendChild(renderDefaults());
      if (table) {
        var host = el("div", "ep-mt-host");
        listEl.appendChild(host);
        table.renderInto(host, entries);
      } else {
        fallbackRender();
      }
    }

    /** 体检每次现算（D3b）；probe=true 才跑硬件真测（进页面那一刻），否则复用快照。
     * 读失败不动下拉，保住上一次的就绪清单。 */
    function refresh(probe) {
      say("正在体检模型状态…");
      if (listEl) listEl.setAttribute("aria-busy", "true");
      return hostCall("models.registry_status", { probe: probe ? 1 : 0 }, 15000).then(function (result) {
        entries = (result && Array.isArray(result.entries)) ? result.entries : [];
        hardware = (result && result.hardware) || {};
        tiers = (result && Array.isArray(result.vram_tiers)) ? result.vram_tiers : [];
        vramNote = String((result && result.vram_note) || "");
        defaults = (result && result.defaults) || { layout: "auto", recognize: "auto" };
        autoSeats = (result && result.auto_seats) || {};
        render();
        say("");
        if (listEl) listEl.removeAttribute("aria-busy");
        if (typeof applyEngines === "function") applyEngines(entries, defaults);
        return entries;
      }, function (error) {
        say("模型状态读取失败：" + failText(error));
        dockWarn("模型配置：读取注册表失败：" + failText(error));
        if (listEl) listEl.removeAttribute("aria-busy");
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
          refresh(false);
        }, function () { stopPolling(); });
      }, 4000);
    }

    function startDownload(button) {
      if (typeof downloadModel !== "function") {
        dockWarn("模型配置：下载通道不在（ui_model.js 已下架），请走【API 配置】或联系管理员。");
        return;
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "下载中…";
      say("下载进度在底栏【运行日志】；就绪后本页与下拉自动更新。");
      downloadModel();
      watchDownload();
    }

    function open() {
      if (!viewEl) return;
      // 再点同一颗入口＝收视图回批次；视图互斥与状态还原归 openView/closeView。
      if (state.mode === "model_config") { closeView(); return; }
      openView("model_config");
      refresh(true);
    }

    function wire() {
      if (wired) return;
      wired = true;
      if (buttonEl) buttonEl.addEventListener("click", open);
      if (refreshEl) refreshEl.addEventListener("click", function () { refresh(true); });
      if (backEl) backEl.addEventListener("click", closeView);
      refresh(false);
    }

    return { open: open, refresh: refresh, wire: wire };
  }

  global.JzoEditorModelConfig = { create: create };
})(window);