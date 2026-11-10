# 语文得分追踪

给初一家教用的语文考试记录工具。记的不是分数，是**每道小题的得分和失分原因**，以及这些失分在几次考试之间怎么变。

核心前提：各校月考、期中自己出卷，总分、题量、难度都不同。直接拿总分画折线，看到的是卷子难易，不是学生的进步。所以这个工具所有跨考试的比较**只用得分率**，而且维度得分率按满分加权求和。

纯前端，无后端，无数据库，无框架，无构建工具，无 CDN。克隆下来就能跑，断网也能用。

---

## 一、快速开始

### 方式 A：直接双击（最快，但有局限）

双击 `index.html`。能打开、能录入、能看图。

但浏览器对 `file://` 页面有两条硬限制，这不是代码能绕过的：

1. **读不到仓库根目录的 `exam-templates.json` 和 `error-tags.json`**。应用会自动改用内置的预置模板和词表（和那两个文件内容一致），顶部会有一条提示条说明这件事。想换模板，就在设置页导入 JSON 文件。
2. **Chrome / Edge 下 IndexedDB 会被禁用**，数据只能存在当前页面内存里，刷新就没了。Safari 一般允许，但也不保证。应用会明确提示"当前是内存模式"。

所以双击只适合先看一眼界面。**真正用起来，请用方式 B 或 C。**

### 方式 B：本地起一个服务（推荐用来验证全部功能）

在项目目录里执行任意一条：

```bash
python3 -m http.server 8000
# 或者
npx serve .
```

然后浏览器打开 `http://localhost:8000/`。

这样 JSON 能读到、IndexedDB 能存、Service Worker 能注册，离线也能测。

### 方式 C：放到 GitHub Pages（推荐长期使用）

见下面第二节。

---

## 二、部署到 GitHub Pages

### 1. 建仓库

1. 登录 GitHub，右上角 `+` → `New repository`。
2. `Repository name` 填一个英文名，比如 `yuwen-tracker`。
3. 选 `Public`（Pages 免费版需要公开仓库）。**不要**勾选 `Add a README file`，避免和本地文件冲突。
4. 点 `Create repository`。

### 2. 上传文件

网页上传（不用装 Git）：

1. 进入刚建好的仓库，点 `Add file` → `Upload files`。
2. 把项目里的**所有文件和文件夹**一起拖进去。注意是**仓库根目录**，不是套一层文件夹。
   正确的结构是：

   ```
   仓库根/
   ├── index.html
   ├── styles.css
   ├── manifest.json
   ├── sw.js
   ├── exam-templates.json
   ├── error-tags.json
   ├── js/
   ├── icons/
   └── README.md
   ```

   ⚠️ 常见错误：上传后变成 `仓库根/yuwen-tracker/index.html`，这样 Pages 打开会是 404。
3. 下面 `Commit changes` 直接提交。

> 用命令行也行：`git init` → `git add .` → `git commit -m "init"` → `git remote add origin <你的仓库地址>` → `git push -u origin main`。

### 3. 开启 Pages

1. 仓库页 → `Settings` → 左侧 `Pages`。
2. `Source` 选 `Deploy from a branch`。
3. `Branch` 选 `main`，目录选 `/ (root)`，点 `Save`。
4. 等 1-2 分钟，刷新页面，顶部会出现地址：

   ```
   https://你的用户名.github.io/仓库名/
   ```

5. 打开这个地址。第一次加载后 Service Worker 会把所有资源缓存下来，之后断网也能用。

> 这个应用所有资源都用相对路径（`./js/...`），所以放在 `用户名.github.io/仓库名/` 这种子路径下不会 404。

### 4. 更新版本后要做什么

改了代码或 JSON 再上传，浏览器可能还用旧缓存。两个办法：

- 普通刷新一次，导航请求是网络优先，HTML 会更新。
- 如果界面没变，把 `sw.js` 里的 `const CACHE = 'yuwen-v1';` 改成 `yuwen-v2`，这样旧缓存会被清掉重建。

---

## 三、iPad 添加到主屏幕

1. 用 **Safari** 打开你的 Pages 地址（必须是 Safari，Chrome 加不了）。
2. 点地址栏右边的分享按钮（方框带向上箭头）。
3. 往下找到 `添加到主屏幕`，点它。
4. 名字默认是"语文得分"，可以改，然后点 `添加`。
5. 回到桌面，点新图标进去：**全屏、没有地址栏**，和原生 App 一样。

第一次一定要在联网状态下打开一次，让 Service Worker 把资源缓存完。之后断网也能进。

如果打开后还是有地址栏，检查两点： manifest 里的 `display` 是不是 `standalone`（默认是），以及是不是从 Safari 添加的（不是从第三方浏览器）。

---

## 四、备份和恢复

**这件事不能省。** Safari 会清理长期不访问的站点的本地存储，清了就没了，没有云端兜底。

### 备份

设置页 → `备份` → 点 `导出全部数据`。

会下载一个文件，名字形如 `语文数据-备份-2026-11-10.json`，里面包含：所有试卷模板、错因词表、全部考试记录（含每次考试的模板快照）、错题本。

下面的勾选框默认打开"备份里包含试卷照片"。照片会转成 base64 塞进 JSON，文件会大一些；不想要照片就取消勾选，文件小很多。

导出成功后，设置页会显示"上次备份 YYYY-MM-DD"。超过 14 天没备份，进入应用会弹提示。

### 恢复

设置页 → `导入备份` → 选那个 JSON 文件。

**按 id 去重合并，不覆盖已有数据**：

- 同 id 的考试记录跳过，保留本地那条。
- 同 id 的模板跳过，保留本地那个（模板想覆盖，用"导入 JSON"单独导）。
- 同 id 的错因组会合并标签：本地没有的标签补进去，本地已有的不动。
- 照片按 id 去重，已有的不重复存。

导入完会弹一条汇总，告诉你加了几条考试、几个模板、几张照片。

### 换设备怎么办

旧设备导出 → 把 JSON 传到新设备（隔空投送、微信文件传输都行）→ 新设备打开 Pages 地址 → 设置页导入。

**不要**指望浏览器之间自动同步，这个应用没有任何联网上传行为，这是设计上的要求。

---

## 五、改 exam-templates.json

这个文件在仓库根目录，是应用启动时读的。你自己或者让外部 AI 直接编辑它，刷新页面就生效。

### 完整示例（可直接复制替换整个文件）

```json
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "tpl-xa-g7-120",
      "name": "西安市初一语文 120 分卷",
      "totalScore": 120,
      "duration": 150,
      "note": "积累 20 + 阅读 50 + 写作 50",
      "sections": [
        {
          "id": "sec-jilei",
          "name": "一、积累和运用（20 分）",
          "items": [
            { "id": "i-1", "no": "1", "fullScore": 2, "dimension": "jilei", "type": "choice", "label": "字音字形" },
            { "id": "i-2", "no": "2", "fullScore": 2, "dimension": "jilei", "type": "choice", "label": "词语运用" },
            { "id": "i-3", "no": "3", "fullScore": 2, "dimension": "jilei", "type": "written", "label": "病句修改" },
            { "id": "i-4", "no": "4", "fullScore": 4, "dimension": "mingzhu", "type": "written", "label": "名著阅读" },
            { "id": "i-5", "no": "5", "fullScore": 4, "dimension": "jilei", "type": "written", "label": "综合性学习" },
            { "id": "i-6-1", "no": "6(1)", "fullScore": 2, "dimension": "jilei", "type": "blank", "label": "古诗文默写" },
            { "id": "i-6-2", "no": "6(2)", "fullScore": 2, "dimension": "jilei", "type": "blank", "label": "古诗文默写" },
            { "id": "i-6-3", "no": "6(3)", "fullScore": 2, "dimension": "jilei", "type": "blank", "label": "古诗文默写" }
          ]
        },
        {
          "id": "sec-xiandai-xu",
          "name": "二、现代文阅读（记叙文，18 分）",
          "items": [
            { "id": "i-7", "no": "7", "fullScore": 4, "dimension": "xiandai", "type": "written", "label": "概括情节" },
            { "id": "i-8", "no": "8", "fullScore": 4, "dimension": "xiandai", "type": "written", "label": "赏析句子" },
            { "id": "i-9", "no": "9", "fullScore": 5, "dimension": "xiandai", "type": "written", "label": "分析人物形象" },
            { "id": "i-10", "no": "10", "fullScore": 5, "dimension": "xiandai", "type": "written", "label": "主旨理解" }
          ]
        },
        {
          "id": "sec-feilianxu",
          "name": "三、非连续性文本阅读（14 分）",
          "items": [
            { "id": "i-11", "no": "11", "fullScore": 4, "dimension": "xiandai", "type": "choice", "label": "信息提取" },
            { "id": "i-12", "no": "12", "fullScore": 5, "dimension": "xiandai", "type": "written", "label": "材料比较" },
            { "id": "i-13", "no": "13", "fullScore": 5, "dimension": "xiandai", "type": "written", "label": "综合表述" }
          ]
        },
        {
          "id": "sec-wenyan",
          "name": "四、文言文阅读（14 分）",
          "items": [
            { "id": "i-14", "no": "14", "fullScore": 2, "dimension": "wenyan", "type": "choice", "label": "实词解释" },
            { "id": "i-15", "no": "15", "fullScore": 2, "dimension": "wenyan", "type": "choice", "label": "虚词辨析" },
            { "id": "i-16", "no": "16", "fullScore": 2, "dimension": "wenyan", "type": "written", "label": "断句" },
            { "id": "i-17", "no": "17", "fullScore": 4, "dimension": "wenyan", "type": "written", "label": "句子翻译" },
            { "id": "i-18", "no": "18", "fullScore": 4, "dimension": "wenyan", "type": "written", "label": "文意理解" }
          ]
        },
        {
          "id": "sec-gushi",
          "name": "五、古代诗歌鉴赏（4 分）",
          "items": [
            { "id": "i-19", "no": "19", "fullScore": 4, "dimension": "gushi", "type": "written", "label": "诗歌赏析" }
          ]
        },
        {
          "id": "sec-xiezuo",
          "name": "六、写作（50 分）",
          "items": [
            { "id": "i-20", "no": "20", "fullScore": 50, "dimension": "xiezuo", "type": "essay", "label": "作文" }
          ]
        }
      ]
    }
  ]
}
```

### 字段规则

| 字段 | 说明 |
| --- | --- |
| `id` | 模板唯一标识。**改它就等于新建**，历史记录还挂在旧 id 上。 |
| `name` | 显示在录入页下拉框里。 |
| `totalScore` | 总分。**必须等于所有小题 `fullScore` 之和**，否则录入页顶部会显示不一致。 |
| `sections[].items[].id` | 小题唯一标识，同一模板里不能重复。历史记录靠它对应。 |
| `no` | 题号字符串。支持 `3(1)`、`6(2)` 这种小题写法。 |
| `fullScore` | 小题满分，正数，可以有小数（如 `2.5`）。 |
| `dimension` | 只能是这七个之一，见下表。 |
| `type` | `choice` 客观选择 / `blank` 填空默写 / `written` 主观作答 / `essay` 作文。 |
| `label` | 这道题考什么，短，会直接显示在录入页每行上。 |

`dimension` 固定枚举：

| 值 | 含义 |
| --- | --- |
| `jilei` | 积累和运用（字音字形、词语、病句、语言运用、默写） |
| `mingzhu` | 名著阅读 |
| `wenyan` | 文言文阅读 |
| `xiandai` | 现代文阅读（记叙文、说明文、非连续性文本） |
| `gushi` | 古代诗歌鉴赏 |
| `xiezuo` | 写作 |
| `shuxie` | 书写/卷面 |

> 注意："名著阅读"是单列维度，不并进积累和运用。所以预置模板里 `jilei` 是 16 分、`mingzhu` 是 4 分，合起来才是"一、积累和运用"这 20 分。

### 新增一份卷子

复制整个 `{ ... }` 模板对象，改一个新的 `id`，追加到 `templates` 数组里。录入页的下拉框会自动多一项。

### 改满分会不会影响历史？

不会。每次保存考试时会把当时的模板**完整深拷贝**存进 `templateSnapshot`，之后所有历史统计都读自己的快照。所以：

- 你把 `i-1` 从 2 分改成 3 分，**新录的考试**按 3 分算；
- **以前的考试**还是按当年那个 2 分算，图和表不会跟着抖。

这是刻意设计的，验收里那条"改满分后历史不变"就是它。

### 应用里也能改

设置页 → `试卷模板` → `编辑模板 JSON`，直接在界面里改，保存后立刻生效。也能 `导出 JSON` 拿一份出来改。

---

## 六、改 error-tags.json

### 完整示例（可直接复制替换）

```json
{
  "schemaVersion": 1,
  "groups": [
    {
      "id": "g-jilei",
      "name": "积累和运用",
      "tags": [
        { "id": "t-yinxing", "name": "形近字混" },
        { "id": "t-duoyin", "name": "多音字读错" },
        { "id": "t-ciyuse", "name": "词语色彩误用" },
        { "id": "t-bingju", "name": "病句类型判错" },
        { "id": "t-moxie-lou", "name": "默写漏字" },
        { "id": "t-moxie-cuo", "name": "默写错字" },
        { "id": "t-chuanhang", "name": "上下句串行" }
      ]
    },
    {
      "id": "g-mingzhu",
      "name": "名著阅读",
      "tags": [
        { "id": "t-qingjie", "name": "情节记混" },
        { "id": "t-renwu", "name": "人物对应错" },
        { "id": "t-pingjia", "name": "没答评价" }
      ]
    },
    {
      "id": "g-wenyan",
      "name": "文言文",
      "tags": [
        { "id": "t-shiciyi", "name": "实词义项记错" },
        { "id": "t-xuci", "name": "虚词用法不清" },
        { "id": "t-fanyi", "name": "翻译漏关键词" },
        { "id": "t-wenyi", "name": "文意理解偏" },
        { "id": "t-duanju", "name": "断句错" }
      ]
    },
    {
      "id": "g-xiandai",
      "name": "现代文",
      "tags": [
        { "id": "t-shenti", "name": "审题偏差" },
        { "id": "t-jiaodu", "name": "答题角度不全" },
        { "id": "t-yuanwen", "name": "没结合原文" },
        { "id": "t-shuyu", "name": "术语用错" },
        { "id": "t-gaikuo", "name": "概括漏点" },
        { "id": "t-zuoyong", "name": "作用类题答偏" },
        { "id": "t-qinggan", "name": "情感理解偏" }
      ]
    },
    {
      "id": "g-gushi",
      "name": "古诗鉴赏",
      "tags": [
        { "id": "t-yixiang", "name": "意象理解错" },
        { "id": "t-shoufa", "name": "手法判断错" },
        { "id": "t-qinggan-gu", "name": "情感概括偏" }
      ]
    },
    {
      "id": "g-xiezuo",
      "name": "写作",
      "tags": [
        { "id": "t-pianti", "name": "偏题" },
        { "id": "t-sucai", "name": "素材空" },
        { "id": "t-jiegou", "name": "结构散" },
        { "id": "t-yuyan", "name": "语言平" },
        { "id": "t-zishu", "name": "字数不足" },
        { "id": "t-kaitou", "name": "开头结尾弱" }
      ]
    },
    {
      "id": "g-common",
      "name": "通用",
      "tags": [
        { "id": "t-cuxin", "name": "粗心看错题" },
        { "id": "t-shijian", "name": "时间不够" },
        { "id": "t-shuxie-liao", "name": "书写潦草" }
      ]
    }
  ]
}
```

### 规则

- `group.id` 是分组标识，`tags[].id` 是标签标识，**都不能重复**。
- **改 `name` 没事，改 `id` 等于换了个新标签**，以前标过旧 id 的记录不会自动跟着变，统计里会分成两行。
- 一道题可以多选，阅读题常见"答题角度不全 + 没结合原文"同时标。
- 录入时可以在标签之外补一句备注，但**统计只认标签 id**，备注不进任何图表。

---

## 七、界面和功能

底部三个页签：**录入 / 分析 / 设置**。

### 录入页

- 选模板 → 自动带出这一份卷子的全部小题，每题一行。
- 每行：题号、题型、考什么、满分、得分输入框、错因按钮。
- **得分默认填满分**，只改答错的那几道。
- 输入框是 `inputmode="decimal"`，iPad 上弹数字键盘。
- 得分超过满分或小于 0：输入框标红，顶部提示条显示有几道不对，点保存会被拦下并跳到那道题。
- 错因按钮打开底部面板，按分组点选，多选，可以加备注。
- 顶部实时显示总分和得分率。
- 可以给这次考试挂一张试卷照片，保存时自动压到长边 1600px 以内。
- 模板里有作文题时，多一个"作文档位"下拉。不选就按作文得分自动折算。

### 分析页

顶部两个开关：`全部 / 排除作文`、`全部考试 / 最近 3 / 5 / 8 次`。

五张图：

1. **得分率趋势**：折线，纵轴得分率，可以只显示某一个维度。
2. **能力维度雷达**：至少三个多边形（第一次、上一次、最近一次），图例可以点掉。
3. **失分热力**：行是维度，列是每次考试，格子里是得分率数值，越低颜色越深。
4. **错因频次**：横条，前 8 个，右边的箭头数字是"最近两次 - 前两次"的差值。
5. **作文档位**：一类在最上面。

下面还有考试记录列表，点进去看逐题得分、错因和原卷照片，失分题可以一键记进错题本。

### 设置页

- 备份（导出全部 / 导入备份 / 上次备份时间）
- 数据总览
- 模板导入导出和在线编辑
- 错因词表导入导出和在线编辑
- 错题本导出、清空

---

## 八、怎么算的

这一节是和其他"记分 App"最不一样的地方。

**得分率 = 该题得分 ÷ 该题满分。**

**维度得分率按满分加权：**

```
维度得分率 = Σ(该维度所有小题得分) ÷ Σ(该维度所有小题满分)
```

不是把所有小题的得分率取平均。一道 2 分的默写和一个 16 分的阅读题简单平均会严重失真，比如 2 分题拿 0、16 分题拿满，加权是 18/20 = 90%，简单平均只有 50%。

**跨考试一律用得分率**，不用原始分。

**排除作文视图**：打开后，`xiezuo` 维度整体丢弃，总分、得分率、四张图全部重算。因为作文 50 分权重太大，会把其他维度压平，看不出文言文到底有没有进步。

**作文单独看档位**：一类 45-50、二类 40-44、三类 35-39、四类 30-34、五类 29 以下。档位的升降比分数更能说明问题。如果模板里作文满分不是 50，档位区间按比例折算。

**历史只认快照**：每次记录自带 `templateSnapshot`，之后模板怎么改都不影响它。

---

## 九、目录结构

```
.
├── index.html              入口，三个页签都在这一个文件里
├── styles.css              全部样式，iPad 优先
├── manifest.json           PWA 清单
├── sw.js                   Service Worker，全量静态缓存
├── exam-templates.json     试卷模板（可外部编辑）
├── error-tags.json         错因词表（可外部编辑）
├── icons/
│   ├── icon-180.png        iPad 主屏幕图标
│   ├── icon-192.png        PWA 图标
│   ├── icon-512.png        PWA 图标
│   └── icon-maskable-512.png  Android 自适应图标
├── js/
│   ├── util.js             工具函数
│   ├── db.js               IndexedDB 封装（带内存降级）
│   ├── calc.js             计算规则：加权得分率、维度、错因、档位
│   ├── charts.js           原生 SVG 五张图
│   ├── photos.js           照片压缩和存储
│   ├── ui.js               导航、抽屉、提示、备份导入导出
│   ├── page-entry.js       录入页
│   ├── page-analysis.js    分析页
│   ├── page-detail.js      考试详情 + 错题本
│   ├── page-settings.js    设置页
│   ├── fallback.js         内置兜底数据（file:// 时用）
│   └── boot.js             启动流程
├── tests/
│   └── selftest.js         逻辑自测，node tests/selftest.js
└── README.md
```

不用 npm install，没有 `package.json` 依赖，没有打包步骤。

---

## 十、数据存哪儿

全部在浏览器的 IndexedDB 里，库名 `yuwen-tracker`，六个表：

| 表 | 存什么 |
| --- | --- |
| `exams` | 每次考试（含模板快照和逐题答案） |
| `templates` | 应用内改过的模板 |
| `tagGroups` | 错因词表 |
| `mistakes` | 错题本 |
| `images` | 试卷照片（Blob） |
| `meta` | 上次备份时间、文件同步指纹 |

没有 localStorage 存主数据，没有网络请求，不会上传任何东西。

---

## 十一、已知限制

1. **`file://` 双击**读不到根目录的 JSON，也会禁用 IndexedDB（Chrome 系）。应用会明确提示并降级，但刷新丢数据。长期用请走 Pages。
2. **Safari 会清本地存储**。这正是备份功能必须存在的原因，请每月导一次。
3. **Service Worker 需要 https 或 localhost**。GitHub Pages 是 https，没问题；`file://` 下不注册，也不报错。
4. **不做的功能**（按需求明确排除）：账号登录、多用户、权限、云同步、拍照 OCR、AI 评分、内置题库、学生端和家长端分开。
5. 图片压缩用的是 canvas，超大图（比如 12000px 的扫描件）在旧 iPad 上会慢一两秒。

---

## 十二、自测

项目带三套测试，都不需要 `npm install` 就能跑前两套：

```bash
node tests/selftest.js    # 74 项：计算规则和静态资源
node tests/smoke.js       # 静态冒烟：DOM id、样式类、脚本顺序
```

第三套是端到端，需要先装两个开发依赖（不进仓库，也不影响应用运行）：

```bash
npm install jsdom fake-indexeddb --no-save
node tests/e2e.js         # 51 项：真加载页面跑完整流程
```

`selftest.js` 覆盖：JSON 结构、模板分数合计、维度口径、加权得分率（和简单平均对比）、排除作文重算、作文档位折算、快照不受模板改动影响、日期排序、最近 N 次、错因频次和趋势、空数据不报错、所有资源相对路径、无 CDN、manifest 图标、SW 预缓存清单、关键实现点。

`e2e.js` 覆盖：启动渲染、题目行数和默认满分、实时总分、超分拦截、错因面板、五张图出 SVG、排除作文联动、快照隔离、备份导入去重、空状态、`file://` 兜底。

界面视觉和 iPad 真机手感需要在浏览器里手工验，清单在交付说明里。
