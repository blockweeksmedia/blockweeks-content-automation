# BlockWeeks 四板块自动发布套件 1.1.0（接入准备版）

基于原 1.0 套件与用户提供的 2026-10-04 网站接口报告。已通过本地自动化模拟测试；尚未创建仓库、定时任务或投递真实内容。本包是 GitHub/Node 工具，不是 WordPress 插件。

## 发布入口

| 板块 | 创建入口 | 栏目字段 |
|---|---|---|
| 文章 | /wp-json/wp/v2/posts | categories |
| 知识库 | /wp-json/wp/v2/docs | doc_category |
| QAPress 问题 | /wp-json/wp/v2/qa_post | qa_cat |
| 活动 | /wp-json/tribe/events/v1/events | categories（活动分类） |

前三类使用标准接口，不需增加投稿插件。活动标准接口未开放起止时间等关键字段，采用已经存在的活动专用入口，并分别回读标准接口和活动接口。共用 WordPress 应用程序密码认证。

## 真实栏目 ID

- 文章：KOL 1227、商业 7971、教程 1、深度 29、热议 28、行情 1710、观点 227、资讯 207。
- 知识库：DeFi 216、Solana 205、交易 335、交易所 194、加密货币 193、技术 256。
- 论坛：综合讨论 1816、广告宣传 1817、招聘求职 1818、建言献策 1819。热点默认综合讨论；文件顺序不是默认栏目。
- 活动：国内 201、国外 197、线上 200、线下 196。可选择地点及形式多个栏目。

完整映射位于 config/blockweeks-taxonomy-map.json。知识库标签清单完整；普通文章/活动标签目录在报告中被截断，当前 allowedTags 为空，不自动添加标签，后续按题目匹配现有标签再更新配置。

## 已实现

- 四类新增内容发布器、字段校验、按稿件选栏目、四频道独立每日一稿上限。
- 固定作者在可信 sites 配置中设置 authorId；省略时采用认证账号，稿件不能冒用其他作者。
- 每稿一个 PR，只新增稿件并更新该频道选题队列，校验时使用可信基础分支配置。
- 查重采用频道历史标题/slug和已使用 X/Reddit 来源 URL；投递前查 WordPress slug。
- 相同稿件重跑回读内容、状态和栏目；新稿保存后回读核对，活动还核对时间、时区和指定关联字段。
- POST 响应丢失不自动重试。失败后先查是否已创建，不更换 slug 盲目重发。
- 成功投递回执保存为 GitHub artifact，保留 30 天。topics 的 used 仅代表稿件合并，不代表已经投递。
- 独立只读预检 workflow，读取已有公开标题。文章最多近期 200 篇，其他频道最多 1000 条，标注是否完整。

## 下一阶段接入步骤

1. 选择 GitHub 账号，建议创建私有仓库 blockweeks-content-automation，把本包放到 main 根目录。
2. 创建专用 WordPress 投稿账号，确认文章、edit_docs、edit_qa_posts、edit_tribe_events 等自定义权限。普通作者角色未必包含插件权限。
3. 生成应用程序密码。GitHub Secrets 设置 WP_BLOCKWEEKS_USERNAME 与 WP_BLOCKWEEKS_APP_PASSWORD，不写入仓库或对话。
4. 手动运行 Actions 的 wordpress-preflight，它不执行 POST/PUT/DELETE；查看导出标题和接口访问结果。
5. 外部请求此前遇到 HTTP 403 / error code 1010，认证并不保证解除防护；需验证 GitHub 执行环境能访问，不应整体关闭站点防护。
6. 根据已有标题补齐各频道 pending 队列、填写仓库名和固定作者。配置默认 enabled=false、draft、manual，逐板块接入。
7. 各发一条草稿，检查分类、作者、详情链接、活动时间/地点。QAPress 还需验证问答列表、回复入口及计数等插件处理。
8. 草稿流程通过后设置 main 保护和自动合并，再逐板块决定是否 status=publish。草稿回读不等于匿名读者可见性测试。

## 未完成与边界

- 未接官方 X/Reddit API；第一阶段云端用网页搜索寻找素材，不承诺完整热门榜或实时指标。
- 日/周任务仅提供提示草案，尚未创建；选题队列为空，必须先查已有内容再补队列。
- 活动只支持新增，未实现延期、取消或已有活动更新；已有活动有变化应列入待处理，不重复创建。
- 地点/主办方目前只支持关联已有 ID，未支持新建；无 ID 时只在正文写核实信息。需真实测试后补完整关联流程。
- 支持已有媒体 ID，不上传图片；QAPress 不发送 excerpt/featured_media，摘要只保存到稿件 JSON。
- seoTitle/seoDescription 只存稿件，不写 SEO 插件。
- 未实现全站语义查重；最近文章清单无法覆盖三万余篇历史文章，知识库/论坛/活动初始清单应尽量完整读取。
- 活动当地时区交给插件处理，夏令时切换附近的时间仍需核实。
- 来源与日期字段校验不能替代事实核实。真实认证、创建权限、插件钩子、WordPress 内容格式化及前台显示仍待实测。

## 调度、额度与恢复

建议一个每日任务共享热点搜索，按文章→论坛→知识库分别提交 PR，并确认每篇投递结束后才处理下一篇；另一个每周活动任务与每日任务错开。GitHub concurrency 不是持久队列，多个 pending run 可能被替换，本版不支持任意并发积压。

import 失败时，先查原 slug/返回 ID，再使用 wordpress-import 的手动 before_sha/after_sha 恢复入口。不要另造新稿代替失败投递。模型用量、网络和授权会影响云端运行可靠性。

## 验证

Node.js 24，无第三方运行依赖。

```sh
node --test scripts/workflow.test.mjs scripts/channels.test.mjs
node scripts/preflight-wordpress.mjs
node scripts/validate-pr.mjs BASE_SHA HEAD_SHA
node scripts/import-wordpress.mjs automation/blog-inbox/CHANNEL/YYYY-MM-DD-slug.json
```

最后一条在 enabled 且有凭据时会创建内容；不是只读操作。预检是独立只读命令。

本版本通过 17 项测试（原套件 7 项、新频道 10 项），仅使用模拟 HTTP 和临时 Git 仓库，未测试真实网站。
