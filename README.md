# Hucker Dictionary

这是一个纯前端的静态网页应用，用来浏览 `data.json` 中整理出的《Hucker’s Dictionary of Official Titles in Imperial China》词条数据。页面不依赖构建工具，核心文件只有 [`index.html`](/Users/frank/Developer/hucker-dictionary/index.html)、[`app.js`](/Users/frank/Developer/hucker-dictionary/app.js)、[`styles.css`](/Users/frank/Developer/hucker-dictionary/styles.css) 和数据文件 [`data.json`](/Users/frank/Developer/hucker-dictionary/data.json)。

## App 功能总结

根据 [`app.js`](/Users/frank/Developer/hucker-dictionary/app.js) 和 [`index.html`](/Users/frank/Developer/hucker-dictionary/index.html)，当前应用已经具备一套可直接用于人工校对和浏览的基础工作台：

- 自动读取同目录下的 `data.json`，并把每一行 JSONL 记录解析成词条。
- 支持全文搜索，搜索范围覆盖 `id`、标题状态、正文状态、罗马字、中文、 Wade-Giles、拼音、英文释义、正文内容、朝代和问题标记。
- 支持按 `title_status`、`body_status`、`dynasties_best` 筛选，并支持按 `ID`、标题和 `llm_confidence` 排序。
- 结果列表按每页 20 条分页展示。
- 点击结果可打开详情弹窗，查看标题层字段、正文、问题标记、备注以及原始 JSON。
- 支持手动加载本地 `.jsonl` / `.json` 文件，便于替换数据源做抽查或增量校验。
- 如果直接用 `file://` 打开导致 `fetch` 失败，界面会提示改用静态服务器或手动加载本地文件。

从产品定位看，这个 app 更像“数据校对/审阅器”，而不是面向普通终端用户的词典站点。界面重点放在筛选、问题暴露和原始记录核查，而不是最终出版式展示。

## Data 现状总结

[`data.json`](/Users/frank/Developer/hucker-dictionary/data.json) 虽然文件名是 `json`，实际格式是 JSONL。当前共 **8,291** 条记录，可以直接被页面逐行解析。

### 状态分布

| 字段 | 状态 | 数量 |
| --- | --- | ---: |
| `title_status` | `candidate` | 6,276 |
| `title_status` | `uncertain` | 1,114 |
| `title_status` | `normalized` | 900 |
| `title_status` | `pending` | 1 |
| `body_status` | `candidate` | 7,053 |
| `body_status` | `normalized` | 944 |
| `body_status` | `pending` | 211 |
| `body_status` | `uncertain` | 83 |
| `llm_confidence` | `medium` | 6,587 |
| `llm_confidence` | `high` | 972 |
| `llm_confidence` | `low` | 732 |

这说明数据主体已经有较高覆盖率，但整体仍处于“候选稿”阶段。标题层和正文层都以 `candidate` 为主，真正达到 `normalized` 的记录仍是少数。

### 覆盖与缺口

- 有 `issues` 标记的记录有 **7,961** 条，说明大多数记录仍保留了待核问题。
- `body_best` 为空的记录有 **279** 条，正文缺失仍然存在。
- `headword_pinyin_best` 为空的记录有 **474** 条。
- `headword_wadegiles_best` 为空的记录有 **631** 条。
- `dynasties_best` 为空的记录有 **884** 条，朝代归属仍有明显缺口。

### 朝代覆盖特点

数据覆盖面很广，主量集中在常见大朝代：

- `Song`: 2,289
- `Qing`: 1,953
- `Tang`: 1,769
- `Ming`: 1,194
- `Han`: 1,070
- `Yuan`: 751
- `Zhou`: 621
- `Sui`: 568

同时也能看到同一朝代标签存在并存写法，例如 `Qing` / `Ch'ing`、`Yuan` / `Yüan`、`Zhou` / `Chou`，以及 `Northern and Southern`、`Northern and Southern Dynasties`、`N-S Div.` 等近义标签。这意味着朝代字段已经可用，但标准化尚未完成，筛选时会受到命名不一致影响。

### 主要数据问题类型

按 `issues` 统计，当前最常见的问题集中在以下几类：

- Wade-Giles 需要重建或保守恢复，例如 `wadegiles_reconstructed`、`wadegiles_uncertain`、`wadegiles_unrecoverable`。
- OCR 噪声仍然大量存在，尤其体现在标题、正文和罗马字，如 `ocr_noise_in_body`、`ocr_noise_cleaned`、`ocr_noise_in_headword`。
- 罗马字和拼音常依赖推断生成，而非直接从来源稳定抽取，如 `romanization_uncertain`、`pinyin_from_headword_only`、`pinyin_from_chinese_headword`。
- 一部分记录来自不完整抽取，如 `missing_from_extraction`、`likely_merged_into_other_entry`。

整体上，这批数据已经足够支撑“检索 + 人工核对 + 问题定位”的工作流，但还不适合被当作完全定稿的数据集直接发布。

## 当前仓库的真实定位

综合 app 功能和数据状态，这个仓库现在最适合承担以下角色：

- 作为 Hucker 官职词典整理数据的人工校对前端。
- 作为 OCR / LLM 清洗结果的浏览与抽查工具。
- 作为后续数据标准化前的中间成果展示层。

如果下一步要继续推进，优先级最高的工作应当是：

1. 统一朝代标签命名。
2. 继续减少 `candidate` / `uncertain` / `pending` 记录。
3. 优先补齐缺失正文、缺失拼音、缺失 Wade-Giles 的条目。
4. 针对 `issues` 高频项建立更系统的修复规则，而不是继续只靠单条人工修补。
