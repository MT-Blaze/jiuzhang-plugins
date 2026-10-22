# jiuzhang-plugins

九章算子官方插件仓库：只存放**插件索引**与**插件 zip 包**，不含底座源码。

## 目录

```
plugins.json                      官方索引（底座默认预填它的 gh-proxy 加速地址）
plugins/org.jiuzhang.demo-bank.zip   示例题库（5 道高中数学示例题）
plugins/org.jiuzhang.placeholder.zip 占位演示插件（在线安装闭环演示）
```

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

1. 把插件打成 zip，唯一顶层目录名必须等于 `plugin.json` 里的 `id`；
2. 将 zip 放入 `plugins/<id>.zip`；
3. 在 `plugins.json` 的 `entries` 中增加条目，`zip_url` 与 `mirrors` 指向本仓库文件；
4. 推送后，用户重新【拉取清单】即可看到；底座不做强制升级，旧版本照常可用。

## 许可

插件包与索引以 Apache License 2.0 发布，详见 [LICENSE](LICENSE)。
