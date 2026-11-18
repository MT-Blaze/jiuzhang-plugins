# 录题工作台（org.jiuzhang.editor）

九章算子的官方录题插件：拖入试卷 → 立批次 → 自动切题 → 逐题审核 → 存库。

本插件把「版面切框」与「正文识别」拆成两个彼此独立、可分别选择的引擎。
文件收集筐上方并排放着两个下拉框：

| 位置 | 下拉框 | 管什么 | 选项 |
| --- | --- | --- | --- |
| 左 | **版面引擎** | 题块画在哪、按什么顺序编号 | 自动 ＋ 注册表就绪条目（如 RapidOCR·快 / YOLO·版面 / 云端视觉） |
| 右 | **识别引擎** | 框里的字怎么变成题干与答案 | 自动 ＋ 注册表就绪条目（如 云端视觉 / MinerU） |

选项名单单源宿主模型注册表（`models.registry_status`）：**没配置、没下载、没指派的
模型不进下拉**。批次列表右上角的【模型配置】页给出目录全量 × 三态
（就绪 / 未就绪 / 暂不可用），只读状态＋触发既有动作：YOLO 权重【下载】、
云端账号【去 API 配置指派】；不另开下载通道。

每个选项都带原生 HTML `title`：鼠标悬停会显示一行极淡的说明。
选择只对**下一次【开始解析】**生效，不会重跑已经立起来的批次。

**选谁只走谁**：选了具体引擎就只跑该引擎，失败如实写进批次失败清单，
不偷偷换引擎、不静默降级；只有「自动」才走现有瀑布。残留选择指向未就绪条目时，
宿主闸口把它归一回「自动」，并把一句人话原因写进批次 note，绝不静默。

---

## 一、版面引擎

版面引擎只负责「切框」，从不编造正文；正文始终由识别引擎或本地文本层负责。

| 选择 | 路线 | 说明 |
| --- | --- | --- |
| **自动** | 图片卷先本地 OCR 切题；不达标退回文本层 → 本机 YOLO → 云端 | 现有瀑布不变：文本层能读出标准版面时一次网络请求都不发。 |
| **RapidOCR·快** | 只跑本地 OCR 切题 | 随底座安装的轻量档，图片型卷的切题主路；失败如实报错，不换引擎。 |
| **YOLO·版面** | 只跑本机 YOLO | 模型档内满血 GPU → 量化 → CPU 逐级降级并播报；全部失败即报失败，不交云端。 |
| **云端视觉** | 只交云端视觉模型 | 整卷页图交【API 配置】指派的视觉账号；失败如实报错，不降级其他引擎。 |

补充规则：

- 「自动」档的纯 Python 文本层探路永远排在退回路线的第一位：先读 PDF 自带文本层，
  按行坐标做标准单栏 / 双栏重排；文本层缺失、加密、或读不出足够行时才继续瀑布。
- YOLO 只允许回环地址（`127.0.0.1` / `localhost` / `[::1]`），避免把整卷页图发到未知主机。
- 云端版面把每页图片按 0–1000 归一化坐标返回，后端再换算成页面像素；最多处理 20 页。
- 全部引擎都失败时，批次仍保留页图与绿框；左栏绿框只读，切题改动统一走顶部【重新切题】悬浮画板。

### 本地 YOLO 模型（按需下载）

模型**不进插件包**：插件目录只有一份 `model_config.toml`，老师第一次选【YOLO·版面】
且本机没有模型时，界面弹窗给出【下载满血版】与【暂不下载，交云端】两条路；
【模型配置】页的【下载】与这条弹窗走同一条下载通道。
轻量量化版暂未发布，界面与索引都不再提供该选项。

| 版本 | 用途 | 下载源 |
| --- | --- | --- |
| **满血版** | 显卡加速下追求精度 | `gh-proxy.com` / Gitee 镜像 / `hf-mirror.com` |

- 下载先写 `models/<文件名>.tmp`，大小与完整性校验通过后才原子改名为 `.onnx`；
  半截文件直接丢弃，绝不进入加载环节。
- 模型只落在当前工作区的 `plugins/org.jiuzhang.editor/models/`，打包脚本按目录名
  与后缀双重排除，插件 zip 始终小于 10MB。
- 加载顺序：满血 + GPU → 量化 + GPU → CPU，逐级降级并把「版本 / 硬件」写进批次路由，
  宿主播报到【运行日志】；本地全败时如实报失败——「自动」档瀑布继续交云端，
  选中 YOLO 档则不换引擎。量化档接口仍在后端保留，待模型正式发布后再启用。
- 本地推理需要可选的 `onnxruntime`：Windows 通用显卡加速装 `onnxruntime-directml`，
  NVIDIA 装 `onnxruntime-gpu`；Python 3.14 暂无官方轮子，未安装时自动档交云端。
- 旧的 HTTP 服务变量 `JZO_YOLO_LAYOUT_URL` 已退役，仅保留在文档里供历史部署对照；
  当前版本不再向任何本机 HTTP 服务转发页图。

## 二、识别引擎

识别引擎只负责「填字」，题图始终以原卷为准，识别失败也不会丢题。

| 选择 | 路线 | 说明 |
| --- | --- | --- |
| **自动** | 本地提取 → AI 局部/全量 → MinerU 兜底 | 先本地提取；坏题交 AI 修补；坏题率达到 30% 转整批全量 OCR；最后 MinerU 兜底。 |
| **云端视觉** | 整批交 AI | 不看坏题率，整批单题截图并发交视觉模型（默认 5 路）；失败如实报错并保留本地切图，不交 MinerU。 |
| **MinerU** | 逐题 MinerU | 本地切好单题截图后逐题发送，单题最长等待 900 秒；失败的那道题保留本地切图。 |

坏题四特征：连续空选项、掉变量句式、内联小图多但无公式、长文无符号。
坏题率低于 30% 只补坏题；达到或越过 30% 自动改走整批全量 OCR——这两条只属于「自动」档。

旧值兼容：老客户端的「全量OCR」（`full_ocr`）映射到云端视觉，只走 AI、不再兜底 MinerU；
`local_ai` 映射到自动。

### 识别账号配置

识别引擎的云端能力统一走【API 配置】里指派的任务账号：

- **AI 识别**：指派「视觉识别(OCR)」任务；未指派时云端视觉档如实报错并保留本地切图。
- **MinerU**：在账号池里配置 MinerU 地址与 Key；未配置时 MinerU 档会提示去【API 配置】指派。
- 【模型配置】页对未指派的条目给【去 API 配置指派】直达按钮；指派完成即就绪并进下拉。

## 三、请求契约

插件经宿主转发 `ingest.files`，宿主最终调用：

```http
POST /api/ingest/files
```

```json
{
  "files": [
    { "name": "期中卷.pdf", "data_url": "data:application/pdf;base64,..." }
  ],
  "layout_engine": "auto",
  "recognize_engine": "auto"
}
```

- `layout_engine`：`auto` / `rapidocr_fast` / `yolo` / `cloud_vision`
  （旧值 `ocr` → `rapidocr_fast`、`cloud` → `cloud_vision`）
- `recognize_engine`：`auto` / `cloud_vision` / `mineru`
  （旧值 `full_ocr` → `cloud_vision`、`local_ai` → `auto`）
- 旧客户端仍可只发 `channel`（`auto` / `local_ai` / `full_ocr` / `mineru`），
  后端会映射到新的识别引擎并忽略未知值。
- 选中未就绪的引擎时，宿主闸口归一回 `auto` 并在批次 note 写明原因。

响应先返回已立起的批次；页图渲染、切题与识别在后台任务里继续，
批次路由上的 `note` 会逐条写进插件底部日志。

## 四、后端模块边界

| 模块 | 职责 | 行数上限 |
| --- | --- | --- |
| `app/core/layout/layout_router.py` | 只按瀑布顺序分发 | < 100 |
| `app/core/layout/layout_python.py` | 本地文本层探路、单/双栏重排 | < 300 |
| `app/core/layout/layout_yolo.py` | 本机 ONNX 四级瀑布与状态播报 | < 400 |
| `app/core/layout/layout_cloud.py` | 云端视觉模型兜底 | < 200 |
| `app/core/recognize/recognize_router.py` | 只按瀑布顺序分发 | < 100 |
| `app/core/recognize/recognize_local.py` | 纯本地文本提取 | < 300 |
| `app/core/recognize/recognize_ai.py` | 局部或全量大模型识别 | < 200 |
| `app/core/recognize/recognize_mineru.py` | MinerU 逐题云端识别 | < 200 |

调度层不写算法，算法层不决定降级顺序；两层都通过普通 JSON 字典传参，
新增引擎只需实现 `detect` / `run` 并注册进对应路由即可。

## 五、可下架说明

双引擎选择器是一整块独立 UI：删掉 `dist/index.html` 里的 `.ed-basket-engines`
及 `dist/layout.css` 中对应规则即可下架；后端缺失这两个字段时默认按
`auto` 处理，不影响老批次与老客户端。

模型配置页同样整块独立：删掉 `dist/ui_model_config.js`、`dist/panel_model_config.css`
与 `index.html` 里的【模型配置】按钮、`#edModelConfigModal` 模态及两处引用即可下架；
下拉静态只剩「自动」，解析照走自动瀑布，不需要动后端。

## 六、测试

```bash
.venv/Scripts/python.exe -m unittest tests.test_layout_router
.venv/Scripts/python.exe -m unittest tests.test_recognize_router
.venv/Scripts/python.exe -m unittest tests.test_ingest_triage
.venv/Scripts/python.exe -m unittest tests.test_models_registry
```

全量回归：`tools/run_all_tests.py`。

## 许可证

Apache-2.0，见同目录 `LICENSE`。