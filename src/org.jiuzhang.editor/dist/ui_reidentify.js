/**
 * ui_reidentify.js —— T6 审核重认（可整块下架）。
 *
 * 渲染列每道待审题挂一行重认工具：【整题重认】＋有坐标时的块级【公式重认】。
 * 点开＝内联席位选择行（专科/本地 VLM/云 VLM/MinerU，三态照念）；选中一席
 * 经 pending.reidentify 送底座：同张题图按坐标裁块（或整题图）→ 原位替换 →
 * save_back 来源 review.reidentify。失败成因照念（专科 blocked 选中显性
 * 「下一卡开」），不造假按钮、不偷换席。重认过程 aria-busy＋按钮锁死。
 *
 * 坐标清单只读自 pending.reidentify_spans（MinerU 公式块/文字层），按
 * pending_id 缓存；重认成功即作废重取。回填复用 AI 帮改同一套
 * replaceField→writeBackSourceText→refreshRow，源码与渲染原位刷新。
 *
 * 整块下架：删本文件、panel_reidentify.css、index.html 里那两行引用、
 * plugin.js 的 uiReidentify 创建与 uiColumns deps 里的 reidentify 一行、
 * ui_columns.js 的 deps.reidentify 与 renderQuestionBlock 末尾 decorate 钩子。
 */
(function (global) {
  "use strict";

  var STATE_LABELS = { ready: "就绪", degraded: "未就绪", blocked: "暂不可用" };
  var REIDENTIFY_TIMEOUT_MS = 960000;

  function create(deps) {
    var coreState = deps.coreState;
    var state = coreState.state;
    var dockWarn = deps.dockWarn;
    var el = deps.el;
    var hostCall = deps.hostCall;
    var markDirty = deps.markDirty;
    var refreshRow = deps.refreshRow;
    var replaceField = deps.replaceField;
    var toast = deps.toast;
    var writeBackSourceText = deps.writeBackSourceText;

    var spanCache = {};
    var busy = {};

    function spansOf(pid) {
      if (!spanCache[pid]) {
        spanCache[pid] = hostCall("pending.reidentify_spans", { pending_id: pid }, 20000)
          .then(function (result) {
            return (result && Array.isArray(result.spans)) ? result.spans : [];
          }, function () { return []; });
      }
      return spanCache[pid];
    }

    function setDisabled(bar, disabled) {
      Array.prototype.forEach.call(bar.querySelectorAll("button"), function (node) {
        node.disabled = disabled;
        node.setAttribute("aria-disabled", disabled ? "true" : "false");
      });
    }

    function noteSay(note, text, isError) {
      note.textContent = text || "";
      note.className = "ed-reidentify-note" + (isError ? " is-error" : "");
    }

    function itemByPid(pid, index) {
      var item = state.items[index];
      if (item && String(item.pendingId || "") === pid) return { item: item, index: index };
      for (var i = 0; i < state.items.length; i += 1) {
        if (String(state.items[i].pendingId || "") === pid) {
          return { item: state.items[i], index: i };
        }
      }
      return null;
    }

    /** 回填：公式只换题干；整题按题干/答案/解析逐段原位替换（池子已先存好）。 */
    function backfill(pid, index, question, target, detail) {
      var found = itemByPid(pid, index);
      if (!found) {
        toast("重认已存回池子，但画布里找不到这道题了，请重新打开批次。", "warn");
        return;
      }
      var item = found.item;
      var text = String(item.source || "");
      var fields = [["stem", String((question && question.stem) || "")]];
      if (target === "question") {
        if (question && question.answer) fields.push(["answer", String(question.answer)]);
        if (question && question.solution) fields.push(["solution", String(question.solution)]);
      }
      var failed = "";
      fields.forEach(function (pair) {
        if (!pair[1].trim()) return;
        var outcome = replaceField(text, pair[0], pair[1]);
        if (outcome.ok) text = outcome.text;
        else if (!failed) failed = outcome.message;
      });
      item.question = question;
      if (failed) {
        toast("重认已存回池子，但源码定位失败（" + failed + "），请重新打开批次看最新题面。", "warn");
      } else {
        item.source = text;
        writeBackSourceText(item, found.index, "stem");
        toast(detail || "已原位替换。", "ok");
      }
      item.dirty = false;
      markDirty();
      refreshRow(found.index);
    }

    function run(bar, note, pid, index, target, spanIndex, seat) {
      if (busy[pid]) return;
      busy[pid] = true;
      bar.setAttribute("aria-busy", "true");
      setDisabled(bar, true);
      noteSay(note, "正在送席重认…单题最长等 15 分钟，请别关页签。");
      hostCall("pending.reidentify", {
        pending_id: pid, seat: seat, target: target, span_index: spanIndex
      }, REIDENTIFY_TIMEOUT_MS).then(function (result) {
        busy[pid] = false;
        bar.setAttribute("aria-busy", "false");
        setDisabled(bar, false);
        if (!result || result.ok !== true) {
          var detail = String((result && result.detail) || "重认未成功");
          noteSay(note, detail, true);
          dockWarn("审核重认：" + detail);
          return;
        }
        delete spanCache[pid];
        noteSay(note, "");
        backfill(pid, index, result.question, target, String(result.detail || ""));
      }, function (error) {
        busy[pid] = false;
        bar.setAttribute("aria-busy", "false");
        setDisabled(bar, false);
        var message = "重认请求失败：" + ((error && error.message) || "未知原因");
        noteSay(note, message, true);
        dockWarn(message);
      });
    }

    /** 内联席位行：每次现算三态（D3b），专科 blocked 也照列——选中由底座显性回报。 */
    function openSeats(bar, seatsBox, note, pid, index, target, spanIndex) {
      seatsBox.textContent = "";
      seatsBox.hidden = false;
      bar.setAttribute("aria-busy", "true");
      noteSay(note, "正在读席位三态…");
      hostCall("models.registry_status", {}, 15000).then(function (result) {
        bar.setAttribute("aria-busy", "false");
        noteSay(note, "");
        var entries = (result && Array.isArray(result.entries)) ? result.entries : [];
        var seats = entries.filter(function (entry) {
          var capability = String(entry.capability || "");
          return (capability === "formula" || capability === "recognize" || capability === "both") && (entry.plan_recognize || []).indexOf("combo") < 0; // 组合路是整批链路，单题/单块重认不列
        });
        if (!seats.length) {
          noteSay(note, "模型目录里没有识别席位，请先打开【模型配置】查看。", true);
          return;
        }
        seatsBox.appendChild(el("span", "ed-reidentify-seats-label", "选一席重认（三态照念）："));
        seats.forEach(function (entry) {
          var seatId = String(entry.id || "");
          var btn = el("button", "ep-btn ep-mini-btn ed-reidentify-seat");
          btn.type = "button";
          btn.appendChild(el("span", "ed-reidentify-seat-name", String(entry.name || seatId)));
          var stateName = String(entry.state || "");
          var chipText = entry.enabled === false ? "已停用" : (STATE_LABELS[stateName] || stateName);
          btn.appendChild(el("span", "ed-reidentify-state is-" + stateName, chipText));
          btn.title = String(entry.detail || "");
          btn.addEventListener("click", function () {
            run(bar, note, pid, index, target, spanIndex, seatId);
          });
          seatsBox.appendChild(btn);
        });
      }, function (error) {
        bar.setAttribute("aria-busy", "false");
        noteSay(note, "席位读取失败：" + ((error && error.message) || "未知原因"), true);
      });
    }

    function decorate(block, item, index) {
      var pid = item && item.pendingId ? String(item.pendingId) : "";
      if (!pid) return;
      var bar = el("div", "ed-reidentify");
      bar.setAttribute("data-pending-id", pid);
      var row = el("div", "ed-reidentify-bar");
      var note = el("span", "ed-reidentify-note");
      note.setAttribute("role", "status");
      var seatsBox = el("div", "ed-reidentify-seats");
      seatsBox.hidden = true;
      var spansBox = el("div", "ed-reidentify-spans");
      spansBox.hidden = true;
      var current = { target: "question", spanIndex: 0 };

      var wholeBtn = el("button", "ep-btn ep-mini-btn ed-reidentify-btn", "整题重认");
      wholeBtn.type = "button";
      wholeBtn.setAttribute("aria-expanded", "false");
      wholeBtn.title = "同张题图整题送选中席，原位替换正文";
      wholeBtn.addEventListener("click", function () {
        if (!seatsBox.hidden && current.target === "question") {
          seatsBox.hidden = true;
          wholeBtn.setAttribute("aria-expanded", "false");
          return;
        }
        current = { target: "question", spanIndex: 0 };
        wholeBtn.setAttribute("aria-expanded", "true");
        openSeats(bar, seatsBox, note, pid, index, "question", 0);
      });
      row.appendChild(wholeBtn);

      var formulaBtn = el("button", "ep-btn ep-mini-btn ed-reidentify-btn", "公式重认");
      formulaBtn.type = "button";
      formulaBtn.hidden = true;
      formulaBtn.setAttribute("aria-expanded", "false");
      formulaBtn.title = "按坐标从同张题图裁公式块送选中席（有坐标才出现）";
      formulaBtn.addEventListener("click", function () {
        spansBox.hidden = !spansBox.hidden;
        formulaBtn.setAttribute("aria-expanded", spansBox.hidden ? "false" : "true");
      });
      row.appendChild(formulaBtn);
      row.appendChild(note);
      bar.appendChild(row);
      bar.appendChild(seatsBox);
      bar.appendChild(spansBox);
      block.appendChild(bar);

      spansOf(pid).then(function (spans) {
        if (!bar.isConnected || !spans.length) return;
        formulaBtn.hidden = false;
        formulaBtn.textContent = "公式重认（" + spans.length + " 块）";
        spans.forEach(function (span) {
          var spanIndex = Number(span.index) || 0;
          var line = el("div", "ed-reidentify-span");
          var preview = String(span.preview || "").trim();
          var origin = String(span.origin || "") === "mineru" ? "MinerU 坐标" : "文字层坐标";
          line.appendChild(el("span", "ed-reidentify-span-label",
            "公式块 " + (spanIndex + 1) + "（" + origin + "）" + (preview ? "：" + preview : "")));
          var btn = el("button", "ep-btn ep-mini-btn ed-reidentify-btn", "重认此块");
          btn.type = "button";
          btn.addEventListener("click", function () {
            current = { target: "formula", spanIndex: spanIndex };
            wholeBtn.setAttribute("aria-expanded", "false");
            openSeats(bar, seatsBox, note, pid, index, "formula", spanIndex);
          });
          line.appendChild(btn);
          spansBox.appendChild(line);
        });
      });

      if (busy[pid]) {
        bar.setAttribute("aria-busy", "true");
        setDisabled(bar, true);
        noteSay(note, "正在送席重认…单题最长等 15 分钟，请别关页签。");
      }
    }

    return { decorate: decorate };
  }

  global.JzoEditorReidentify = { create: create };
})(window);