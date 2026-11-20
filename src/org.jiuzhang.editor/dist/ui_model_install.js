/**
 * ui_model_install.js —— 模型安装/卸载动线（2.20.0 卡§4/§5/§7＋安装接线卡座5/6 VLM 三座＋接线卡④ Texify，可整块下架）。
 *
 * 安装点击先弹确认（§5 活字：显存不够摆成本＋CPU 慢兜底丑话，够格只摆成本不吓唬），
 * 点头才出网（models.mineru_install / models.vlm[_intern|_minicpm]_install，点击内多镜像测速选路）；
 * 后台线程进度轮询 *_status，人话播步骤与选源；装好/装坏都刷新本页与下拉。
 * 卸载同样弹确认：VLM/公式按件删（共享目录互不误删），MinerU/OCR 删整个隔离目录（后端干），失败显性不静默。
 * 下架：删 index.html 同行 script 引用，编排器回退朴素清单（无安装动线）。
 */
(function (global) {
  "use strict";

  function create(deps) {
    var hostCall = deps.hostCall;
    var dockWarn = deps.dockWarn;
    var say = deps.say;
    var hardware = deps.hardware;
    var refreshed = deps.refreshed;
    var timers = { mineru: null, vlm: null, vlm_intern: null, vlm_minicpm: null,
      ocr: null, formula: null, formula_l: null, formula_p2t: null, formula_texify: null };

    function failText(error) {
      return (error && error.message) || "未知原因";
    }

    function isVlmIntern(entry) {
      return String(entry.id || "") === "vlm_intern" ||
        String(entry.action || "") === "install_vlm_intern";
    }

    function isVlmMinicpm(entry) {
      return String(entry.id || "") === "vlm_minicpm" ||
        String(entry.action || "") === "install_vlm_minicpm";
    }

    function isVlm(entry) {
      return String(entry.rule || "") === "vlm_local" ||
        String(entry.action || "") === "install_vlm";
    }

    function isOcr(entry) {
      return String(entry.store || "") === "ocr_medium" ||
        String(entry.action || "") === "install_ocr";
    }

    function isFormula(entry) {
      return String(entry.store || "") === "formula" ||
        String(entry.action || "") === "install_formula";
    }

    function isFormulaL(entry) {
      return String(entry.store || "") === "formula_l" ||
        String(entry.action || "") === "install_formula_l";
    }

    function isFormulaP2t(entry) {
      return String(entry.store || "") === "formula_p2t" ||
        String(entry.action || "") === "install_formula_p2t";
    }

    function isFormulaTexify(entry) {
      return String(entry.store || "") === "formula_texify" ||
        String(entry.action || "") === "install_formula_texify";
    }

    function kindOf(entry) {
      return isVlmIntern(entry) ? "vlm_intern" : (isVlmMinicpm(entry) ? "vlm_minicpm" :
        (isVlm(entry) ? "vlm" : (isOcr(entry) ? "ocr" :
          (isFormulaP2t(entry) ? "formula_p2t" :
            (isFormulaTexify(entry) ? "formula_texify" :
              (isFormulaL(entry) ? "formula_l" : (isFormula(entry) ? "formula" : "mineru")))))));
    }

    var KIND_NAMES = { vlm: "本地 VLM·千问", vlm_intern: "本地 VLM·书生",
      vlm_minicpm: "本地 VLM·面壁", mineru: "本地 MinerU", ocr: "RapidOCR·准",
      formula: "PP-FormulaNet·M", formula_l: "PP-FormulaNet·L", formula_p2t: "Pix2Text·MFR",
      formula_texify: "Texify" };

    function installConfirmText(entry) {
      var kind = kindOf(entry);
      if (kind === "formula") {
        return "安装 PP-FormulaNet·M 要下约 596MB 权重（模型 594MB＋配置 2.2MB，国内镜像）占磁盘。" +
          "装好后公式专科与文字卷公式识别生效。仍要安装？";
      }
      if (kind === "formula_l") {
        return "安装 PP-FormulaNet·L 要下约 737MB 权重（模型 735MB＋配置 2.2MB，国内镜像）占磁盘。" +
          "装好后公式专科 L 档生效（大模型更准但更慢）。仍要安装？";
      }
      if (kind === "formula_p2t") {
        return "安装 Pix2Text·MFR 要下约 118MB 权重（编码器 87MB＋解码器 30MB＋词表 39KB，国内镜像）占磁盘。" +
          "装好后公式专科 p2t 档生效。仍要安装？";
      }
      if (kind === "formula_texify") {
        return "安装 Texify 要下约 628MB 权重（fp16 编码器 151MB＋解码器 477MB＋四小件，国内镜像）占磁盘。" +
          "权重许可 cc-by-sa-4.0（署名＋相同方式共享）：个人/教研免费用，商用或二次分发须遵官方相同方式共享条款。" +
          "装好后公式专科 Texify 档与文字卷公式识别生效。仍要安装？";
      }
      if (kind === "ocr") {
        return "安装 RapidOCR·准要下约 139MB 权重（det 62MB＋rec 77MB，国内镜像）占磁盘。" +
          "切题默认仍是快档，装好后在下拉里选准档才生效。仍要安装？";
      }
      if (kind === "mineru") {
        return "安装本地 MinerU 要下依赖约 1–2GB＋解析模型约 1–3GB（国内镜像）占磁盘。仍要安装？";
      }
      var need = Number(entry.min_vram || 6);
      var hw = hardware() || {};
      var vram = Number(hw.vram_gb || 0);
      var label = String(hw.vram_label || "读不到");
      var costs = { vlm: "约 3.3GB（权重 1.9G＋视觉部件 1.3G）",
        vlm_intern: "约 1.74GB（权重 1.12G＋视觉部件 0.63G）",
        vlm_minicpm: "约 4.85GB（权重 3.81G＋视觉部件 1.04G）" };
      var cost = "安装要下" + (costs[kind] || costs.vlm) + "占磁盘，走国内镜像。";
      if (kind !== "vlm") {
        cost += "发动机与千问座共享 engines/vlm/，已装过则只下本座权重。";
      }
      if (kind === "vlm_minicpm") {
        cost += "权重许可为 MiniCPM Model License：个人/研究免费，商用须遵官方条款。";
      }
      if (vram < need) {
        return "本机显存 " + label + "，低于 " + need + "G 门槛。" + cost +
          "装完本机只能 CPU 慢兜底（比显卡慢一个数量级），或改云视觉（花小钱、快）。仍要安装？";
      }
      return cost + "仍要安装？";
    }

    function busy(button, label) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = label;
    }

    function restore(button, label) {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = label;
    }

    function stopPolling(kind) {
      if (timers[kind]) window.clearInterval(timers[kind]);
      timers[kind] = null;
    }

    // 安装是后台线程：轮询进度快照；VLM 权重最大约 4.85GB 下载偏慢属预期，窗口放宽到 1 小时。
    function watch(kind, name) {
      if (timers[kind]) return;
      var polls = 0;
      var cap = kind.indexOf("vlm") === 0 ? 900 : 300;
      timers[kind] = window.setInterval(function () {
        polls += 1;
        hostCall("models." + kind + "_status", {}, 15000).then(function (status) {
          var state = String((status && status.state) || "");
          var step = String((status && status.step) || "");
          var message = String((status && status.message) || "");
          if (state === "installing") {
            say("正在安装" + name + "：" + (step || "准备中") + (message ? "（" + message + "）" : ""));
            if (polls < cap) return;
          }
          stopPolling(kind);
          if (state === "error") {
            say(name + "安装失败：" + message);
            dockWarn("模型配置：" + name + "安装失败：" + message);
          }
          refreshed();
        }, function () { stopPolling(kind); });
      }, 4000);
    }

    function install(entry, button) {
      if (!window.confirm(installConfirmText(entry))) return;
      var kind = kindOf(entry);
      var name = KIND_NAMES[kind];
      busy(button, "安装中…");
      say("正在发起" + name + "一键安装（国内镜像测速选路）…");
      hostCall("models." + kind + "_install", {}, 20000).then(function () {
        watch(kind, name);
      }, function (error) {
        restore(button, String(entry.state || "") === "blocked" ? "重试安装" : "安装");
        say("安装请求失败：" + failText(error));
        dockWarn("模型配置：" + name + "安装请求失败：" + failText(error));
      });
    }

    function uninstall(entry, button) {
      var name = String(entry.name || entry.id || "");
      var kind = kindOf(entry);
      var scope, lead;
      if (kind.indexOf("vlm") === 0) {
        scope = "engines/vlm/models/ 里本座两件权重（其他座不受影响；各座全卸空才连发动机目录一起删）";
        lead = "在跑本座会先停服，再删除 ";
      } else if (kind === "formula" || kind === "formula_l" || kind === "formula_p2t" ||
          kind === "formula_texify") {
        var pieces = { formula: "两件", formula_l: "两件", formula_p2t: "三件",
          formula_texify: "六件" };
        scope = "engines/formula/models/ 里本档" + pieces[kind] + "权重（其他公式档不受影响）";
        lead = "将丢弃引擎缓存并删除 ";
      } else {
        var folders = { mineru: "engines/mineru/", ocr: "engines/ocr/" };
        scope = folders[kind] + " 整个目录（含已下权重）";
        lead = kind === "ocr" ? "将丢弃引擎缓存并删除 " : "将先停服务再删除 ";
      }
      if (!window.confirm("确认卸载「" + name + "」？" + lead + scope +
          "，下次使用要重新安装。已入库题目不受影响。")) return;
      busy(button, "卸载中…");
      say("正在卸载" + name + "…");
      hostCall("models.uninstall_" + kind, {}, 60000).then(function (result) {
        say(String((result && result.message) || (name + " 已卸载。")));
        refreshed();
      }, function (error) {
        restore(button, "卸载");
        say("卸载失败：" + failText(error));
        dockWarn("模型配置：" + name + "卸载失败：" + failText(error));
      });
    }

    return { install: install, uninstall: uninstall };
  }

  global.JzoEditorModelInstall = { create: create };
})(window);