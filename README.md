# Super Stock 2：vscode股票插件


> 已发布到 VS Code 插件商店：搜索 **Super Stock 2** 即可安装。
>
> 本仓库地址: [https://github.com/ImAlien/vscode-stock](https://github.com/ImAlien/vscode-stock)
>
> Fork 自原作者 **yujintang**: [https://github.com/yujintang/vscode-stock](https://github.com/yujintang/vscode-stock)

> 感谢原作者 [@yujintang](https://github.com/yujintang) 的开源。本仓库基于其 MIT 许可协议 fork 并做了如下修复与增强：
>
> - 修复新浪行情接口防盗链（补 `Referer` 头，解决接口 403 导致行情无法刷新）
> - 修复「添加」按钮失败时无任何提示的问题，并对纯 6 位数字自动补全 `sh`/`sz` 前缀
> - 修复网络请求错误处理导致的崩溃
> - 新增：添加股票支持中文名 / 拼音 / 代码模糊搜索，无需记忆完整代码
> - 新增：自选股支持置顶 / 置底 / 上移 / 下移排序
> - 新增：股票分类（内置 A股 / 港股 / 美股，支持自建分类，一只股票可归多个分类）


### 1. 安装

**方式一（推荐）：从 VS Code 插件商店安装**

1. 打开 vscode 扩展面板（`Ctrl+Shift+X`）。
2. 搜索 **Super Stock 2**，点击 **Install** 安装即可。

> 也可在命令行执行：`code --install-extension ImAlien.super-stock2`

**方式二：下载 release 离线安装**

1. 前往 [Releases 页面](https://github.com/ImAlien/vscode-stock/releases)，下载最新版本的 `super-stock2-x.y.z.vsix` 文件。
2. 打开 vscode 扩展面板（`Ctrl+Shift+X`）→ 右上角 `...`（更多操作）→ **Install from VSIX...**（从 VSIX 安装）。
3. 选择刚下载的 `.vsix` 文件，等待安装完成后按提示重载 vscode 即可。

> 也可以在命令面板（`Ctrl+Shift+P`）执行 `Extensions: Install from VSIX...`，或使用命令行：`code --install-extension super-stock2-x.y.z.vsix`

### 2. vscode 左侧会自动添加`FAVORITE STOCKS`一栏，用于展示所选股票
![image.png](https://cdn.nlark.com/yuque/0/2020/png/109900/1593330878423-f425d0f9-627e-4663-a48f-1500549c9abc.png#align=left&display=inline&height=116&margin=%5Bobject%20Object%5D&name=image.png&originHeight=232&originWidth=788&size=27429&status=done&style=none&width=394)


### 3. 添加股票到自选
> 点击 `FAVORITE STOCKS` 栏右上角的「＋」，直接输入**中文名 / 拼音 / 代码**模糊搜索，从下拉结果中选择即可，无需记忆完整代码。例如输入「茅台」「maotai」「600519」都能搜到贵州茅台。

> 也支持直接粘贴新浪财经规范代码（`sh` / `sz` / `hk` / `gb_` 前缀），以下是几个典型示例：

| 上证指数 | sh000001 |
| --- | --- |
| 恒生指数 | hkHSI |
| 道琼斯 | gb_$dji |
| 贵州茅台 | sh600519 |
| 谷歌 | gb_goog |

![Kapture 2020-06-28 at 16.58.11.gif](https://cdn.nlark.com/yuque/0/2020/gif/109900/1593334710160-497ddbd0-496e-43a1-b1b9-b6fa90c86c24.gif#align=left&display=inline&height=249&margin=%5Bobject%20Object%5D&name=Kapture%202020-06-28%20at%2016.58.11.gif&originHeight=458&originWidth=1000&size=590520&status=done&style=none&width=543)


### 4. 高低价位预警
![stockSetWarn.gif](https://cdn.nlark.com/yuque/0/2020/gif/109900/1593335367994-f972fc01-1ca5-4b9c-b5f8-896fc21f356d.gif#align=left&display=inline&height=277&margin=%5Bobject%20Object%5D&name=stockSetWarn.gif&originHeight=404&originWidth=786&size=120854&status=done&style=none&width=538)


### 5. 配置文件


- super-stock.favorite: Key 为股票代码, value[0]为低报警价、value[1]为高报警价
- super-stock.interval: 股价刷新率 默认 2s
- super-stock.emoji: 股价涨跌对应的emoji表情，默认为 ["🍾️", "🍜"], 赢了香槟美女，输了关灯吃面 😂😂😂


```json
{
    "super-stock.favorite":{
        "sh000001":[
            "-",
            "-"
        ],
        "hkHSI":[
            "-",
            "-"
        ],
        "gb_$dji":[
            "-",
            "-"
        ]
    },
    "super-stock.interval":2,
        "super-stock.emoji": [
        "🍾️",
        "🍜"
    ]
}
```
