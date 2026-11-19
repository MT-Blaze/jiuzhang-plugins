/**
 * ui_model_table.js —— 模型配置四栏表（2.20.0 卡§1，可整块下架）。
 *
 * 名称／简要（点击展开）／状态徽章／按钮 四栏；按工种分组：切题定位／整题转写／
 * 公式专科，空组整段隐藏连标题不留。宽屏（≥1100px）左列表＋右详情面板；
 * 窄屏详情内联在行下。未安装条目不隐藏：展开先给简要用法，「详细说明」再点才出
 * （native details，键盘可达）。徽章吃 registry 活字（entry.badge，§5）。
 * 下架：删 index.html 同行 script 引用即回退编排器里的朴素清单，核心渲染不残。
 */
(function (global) {
  "use strict";

  var STATE_LABELS = { ready: "就绪", degraded: "未就绪", blocked: "暂不可用" };
  var GROUPS = [
    { title: "切题定位", caps: ["layout", "both"] },
    { title: "整题转写", caps: ["recognize", "both"] },
    { title: "公式专科", caps: ["formula"] }
  ];

  function create(deps) {
    var el = deps.el;
    var actions = deps.actions;
    var container = null;
    var entries = [];
    var selectedId = "";
    var focusId = "";
    var wide = window.matchMedia("(min-width: 1100px)");

    function entryOf(id) {
      for (var i = 0; i < entries.length; i += 1) {
        if (String(entries[i].id) === String(id)) return entries[i];
      }
      return null;
    }

    function badgeOf(entry) {
      return String(entry.badge || STATE_LABELS[entry.state] || entry.state || "");
    }

    function toggleSelect(entry) {
      var id = String(entry.id);
      focusId = id;
      selectedId = selectedId === id ? "" : id;
      repaint();
    }

    function actionButtons(entry, cell) {
      var action = String(entry.action || "");
      var rule = String(entry.rule || "");
      var state = String(entry.state || "");
      var local = rule === "mineru_local" || rule === "vlm_local" ||
        (rule === "weight_present" && (String(entry.store || "") === "ocr_medium" ||
          String(entry.store || "") === "formula" || String(entry.store || "") === "formula_l" ||
          String(entry.store || "") === "formula_p2t"));
      if (action === "install" || action === "install_vlm" || action === "install_ocr" ||
          action === "install_formula" || action === "install_formula_l" ||
          action === "install_formula_p2t") {
        var installBtn = el("button", "ep-btn ep-mini-btn ep-mt-act",
          state === "blocked" ? "重试安装" : "安装");
        installBtn.type = "button";
        installBtn.title = "点击发起一键安装（国内镜像测速选路，出网只在这一下）";
        installBtn.addEventListener("click", function () { actions.install(entry, installBtn); });
        cell.appendChild(installBtn);
      } else if (local && state === "ready") {
        var uninstallBtn = el("button", "ep-btn ep-mini-btn ep-mt-act ep-mt-danger", "卸载");
        uninstallBtn.type = "button";
        uninstallBtn.title = "先停服务再删整个隔离目录（含权重），弹确认后才动手";
        uninstallBtn.addEventListener("click", function () { actions.uninstall(entry, uninstallBtn); });
        cell.appendChild(uninstallBtn);
      } else if (action === "download") {
        var downloadBtn = el("button", "ep-btn ep-mini-btn ep-mt-act", "下载");
        downloadBtn.type = "button";
        downloadBtn.addEventListener("click", function () { actions.download(entry, downloadBtn); });
        cell.appendChild(downloadBtn);
      } else if (action === "assign") {
        var assignBtn = el("button", "ep-btn ep-mini-btn ep-mt-act", "去 API 配置");
        assignBtn.type = "button";
        assignBtn.addEventListener("click", function () { actions.assign(); });
        cell.appendChild(assignBtn);
      }
      var off = entry.enabled === false;
      var toggle = el("button", "ep-btn ep-mini-btn ep-mt-toggle", off ? "启用" : "停用");
      toggle.type = "button";
      toggle.title = "停用＝下拉不显示＋自动跳过，不卸载";
      toggle.addEventListener("click", function () { actions.toggle(entry); });
      cell.appendChild(toggle);
    }

    function detailBox(entry) {
      var box = el("div", "ep-mt-detail-box");
      var head = el("div", "ep-mt-detail-head");
      head.appendChild(el("h5", "ep-mt-detail-name", String(entry.name || entry.id || "")));
      head.appendChild(el("span", "ep-mt-badge ep-mt-badge-" + String(entry.state || ""),
        badgeOf(entry)));
      var close = el("button", "ep-btn ep-mini-btn ep-mt-detail-close", "收起");
      close.type = "button";
      close.addEventListener("click", function () { toggleSelect(entry); });
      head.appendChild(close);
      box.appendChild(head);
      if (entry.summary_usage) {
        box.appendChild(el("p", "ep-mt-detail-usage", String(entry.summary_usage)));
      }
      var more = el("details", "ep-mt-detail-more");
      more.appendChild(el("summary", "", "详细说明（体检现算）"));
      more.appendChild(el("p", "ep-mt-detail-text", String(entry.detail || "")));
      if (entry.state === "ready" && entry.assigned) {
        more.appendChild(el("p", "ep-mt-detail-assigned", "当前指派：" + String(entry.assigned)));
      }
      box.appendChild(more);
      return box;
    }

    function rowOf(entry) {
      var state = String(entry.state || "");
      var off = entry.enabled === false;
      var id = String(entry.id);
      var row = el("tr", "ep-mt-row ep-mt-" + state + (off ? " ep-mt-off" : ""));
      var nameCell = el("td", "ep-mt-cell-name");
      var nameBtn = el("button", "ep-mt-name", String(entry.name || id));
      nameBtn.type = "button";
      nameBtn.setAttribute("data-id", id);
      nameBtn.setAttribute("aria-expanded", selectedId === id ? "true" : "false");
      nameBtn.title = "展开/收起详细说明";
      nameBtn.addEventListener("click", function () { toggleSelect(entry); });
      nameCell.appendChild(nameBtn);
      if (off) nameCell.appendChild(el("span", "ep-mt-off-tag", "已停用"));
      row.appendChild(nameCell);
      var briefCell = el("td", "ep-mt-cell-brief", String(entry.brief || entry.summary || ""));
      briefCell.addEventListener("click", function () { toggleSelect(entry); });
      row.appendChild(briefCell);
      var badgeCell = el("td", "ep-mt-cell-badge");
      badgeCell.appendChild(el("span", "ep-mt-badge ep-mt-badge-" + state, badgeOf(entry)));
      row.appendChild(badgeCell);
      var actCell = el("td", "ep-mt-cell-act");
      actionButtons(entry, actCell);
      row.appendChild(actCell);
      return row;
    }

    function groupTable(group, rows) {
      var section = el("section", "ep-mt-group");
      section.appendChild(el("h4", "ep-mt-group-title", group.title));
      var table = el("table", "ep-mt-table");
      var thead = el("thead");
      var headRow = el("tr");
      ["名称", "简要（点击展开）", "状态", "操作"].forEach(function (title) {
        headRow.appendChild(el("th", "", title));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = el("tbody");
      rows.forEach(function (entry) {
        tbody.appendChild(rowOf(entry));
        if (!wide.matches && selectedId === String(entry.id)) {
          var detailRow = el("tr", "ep-mt-detail-row");
          var cell = el("td", "ep-mt-detail-cell");
          cell.colSpan = 4;
          cell.appendChild(detailBox(entry));
          detailRow.appendChild(cell);
          tbody.appendChild(detailRow);
        }
      });
      table.appendChild(tbody);
      section.appendChild(table);
      return section;
    }

    function repaint() {
      if (!container) return;
      container.textContent = "";
      var layout = el("div", "ep-mt-layout");
      var left = el("div", "ep-mt-groups");
      GROUPS.forEach(function (group) {
        var rows = entries.filter(function (entry) {
          // 组合路是链路不是模型：进识别下拉，不进模型表（它的座已在表里）。
          return group.caps.indexOf(String(entry.capability || "")) >= 0 &&
            (entry.plan_recognize || []).indexOf("combo") < 0;
        });
        if (!rows.length) return;
        left.appendChild(groupTable(group, rows));
      });
      layout.appendChild(left);
      var panel = el("aside", "ep-mt-detail");
      panel.setAttribute("aria-label", "模型详情");
      var selected = selectedId ? entryOf(selectedId) : null;
      if (wide.matches) {
        if (selected) {
          panel.appendChild(detailBox(selected));
        } else {
          panel.appendChild(el("p", "ep-mt-detail-empty", "点左侧名称或简要，这里出详细说明。"));
        }
        layout.appendChild(panel);
      }
      container.appendChild(layout);
      if (focusId) {
        var target = container.querySelector('.ep-mt-name[data-id="' + focusId + '"]');
        if (target) target.focus();
        focusId = "";
      }
    }

    function renderInto(target, list) {
      container = target;
      entries = Array.isArray(list) ? list : [];
      if (selectedId && !entryOf(selectedId)) selectedId = "";
      repaint();
    }

    if (typeof wide.addEventListener === "function") {
      wide.addEventListener("change", function () { repaint(); });
    }

    return { renderInto: renderInto };
  }

  global.JzoEditorModelTable = { create: create };
})(window);