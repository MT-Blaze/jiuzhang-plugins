# jiuzhang-plugins

九章算子官方插件仓库：存放**插件源码**、**插件索引**与**插件 zip 包**，不含底座源码。

## 目录

```
plugins.json                          官方索引（底座默认预填它的 gh-proxy 加速地址）
src/org.jiuzhang.bank-engine/         无界面题库引擎源码（结构与读写，声明 bank.provider）
src/org.jiuzhang.editor/              录题工作台源码（表单 + A4 预览 → 入库）
src/org.jiuzhang.paper-gen/           组卷排版源码（题篮 → A4 练习卷）
src/org.jiuzhang.handout/             讲义排版源码（Markdown → A4 讲义）
src/org.jiuzhang.dashboard/           数据看板源码
plugins/<id>.zip                      按 src/ 打出的分发成品（URL 不变，解压即用）
```

`src/<id>/` 是插件源码的唯一事实来源，底座仓库不再保存插件源码；
本地开发时底座按 `JZO_PLUGIN_SOURCE_DIR` 或同级 `../jiuzhang-plugins/src` 读取。
`plugins.json` 的 `entries` 与 `plugins/<id>.zip` 逐条对应，`homepage` 指向本仓库
`src/<id>`；版本号以各插件 `plugin.toml` 的 `version` 为准（索引由底座仓库
`tools/sync_plugin_index.py` 同步，不手改）。历史上的 `demo-bank` / `placeholder`
两个演示包已退役，索引与本目录都不再收录。

## 底座如何读取

底座不会自动拉取、自动更新或批量下载。只有用户在 `/plugins` 页点【拉取清单】时，
才按输入框里的地址发一次只读 GET；点某条目的【在线安装】时，才下载那一个 zip。

默认地址：

```
https://gh-proxy.com/https://raw.githubusercontent.com/MT-Blaze/jiuzhang-plugins/main/plugins.json
```

主源失败时底座按 ghfast → jsDelivr → fastly.jsDelivr → Raw 的顺序自动重试；
用户改成第三方地址后只访问那一个地址，不擅自换源。

## 新增插件

1. 在 `src/<id>/` 写插件源码，顶层目录名必须等于 `plugin.toml` 里的 `id`；
2. 用底座仓库的 `tools/build_plugin.py` 打成 zip，放入 `plugins/<id>.zip`；
3. 在 `plugins.json` 的 `entries` 中增加条目，`zip_url` 与 `mirrors` 指向本仓库文件；
4. 推送后，用户重新【拉取清单】即可看到；底座不做强制升级，旧版本照常可用。

## 许可

插件包与索引以 Apache License 2.0 发布，详见 [LICENSE](LICENSE)。
