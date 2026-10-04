# BlockWeeks 自动化内容工具
接入状态：2026-10-05。四板块草稿接口测试已通过；固定测试草稿 ID 326654（文章）、326655（知识库）、326656（论坛）、326657（活动），均未公开。19 项模拟测试验证配置、路由、字段、重复保护与活动金额；真实草稿测试验证正文、分类、状态和活动时间/时区/官网/免费金额。
用户选择：正式稿件校验后自动合并、投递草稿。每日9点（Asia/Shanghai）文章→论坛→知识库串行；每周一下午活动单独运行。任务保存状态以 ChatGPT Scheduled 中的实际任务为准。

## 工作流程
云端选题与写稿 → GitHub 内容 PR → 校验检查 → 合并 → GitHub Actions 投递 WordPress → 下载并核对回执。
主规则：[automation/EXECUTION_RULES_CN.md](automation/EXECUTION_RULES_CN.md)。任务读取最新 main，不依赖本地电脑或临时附件。
每个频道每天最多一稿；活动每周最多一稿，无合格来源时跳过。文章/论坛第一阶段用网页检索可阅读的 X/Reddit 原帖；尚未接付费官方 API，不承诺完整热门榜和实时指标。
各频道启用 enabled=true，发布状态 draft。checked 合并模式由云端任务检查最新 head 的 blog-validation、bootstrap-tests 和完整 diff 后执行正常 PR 合并；不表示 main 已配置分支保护。保护若存在必须遵守，不能绕过。
要变更公开发布模式需另外明确设置 sites.status；当前任务禁止自动公开发布。

## 栏目和内容
栏目映射：[config/blockweeks-taxonomy-map.json](config/blockweeks-taxonomy-map.json)；每篇 categoryIds 从已有分类选择。
文章：报道/分析，通常1200–2200字；论坛：200–500字讨论问题；知识库：1200–2200字，轮换六个专区；活动：300–900字，核实官网、起止时间、时区、形式、地点、报名URL。最终长度以验证器和 sites 最低值为准。
首批24个文章方向、24个论坛方向、24个知识库补缺题和12个活动研究位置。pending 不表示事实已核实；不足7题时在内容PR里补充待选题。索引含51篇知识库、69条论坛、4个公开活动及近期20篇文章；文章不是全历史，执行时刷新只读清单并用站内搜索补查。
同频道旧来源、标题、slug和当日日期查重。每稿一个PR，只新增稿件和更新该频道topics，topics.used仅代表合并。

## WordPress 入口
| 板块 | 创建入口 | 分类字段 |
|---|---|---|
| 文章 | /wp-json/wp/v2/posts | categories |
| 知识库 | /wp-json/wp/v2/docs | doc_category |
| 论坛 | /wp-json/wp/v2/qa_post | qa_cat |
| 活动 | /wp-json/tribe/events/v1/events | categories |
共用 Actions Repository Secrets：WP_BLOCKWEEKS_USERNAME、WP_BLOCKWEEKS_APP_PASSWORD。已验证接口账号editor角色具备四板块编辑/发布权限。网站REST需要认证；标题清单使用context=view，编辑上下文不适合限制账号的全站标题查询。
活动零金额发送为0.00，避免插件创建时过滤字符串0；核验使用cost_details实际金额，空费用不是免费。
只用已存在的场地/主办方/媒体ID；没有ID时已核实地点/主办方写正文。尚未自动上传图片、创建场地/主办方、更新延期或取消的活动。seo字段只存JSON，未写SEO插件。前台公开展示尚未验证。

## 检查与恢复
Node24，无第三方运行依赖。
- node --test scripts/workflow.test.mjs scripts/channels.test.mjs
- node scripts/validate-pr.mjs BASE_SHA HEAD_SHA
- node scripts/preflight-wordpress.mjs（只读）
- wordpress-draft-smoke：专用测试草稿，重复运行复用已验证内容，不能当正式稿件。
- wordpress-import：合并后创建正式草稿，成功回执artifact保留30天。
POST响应丢失不自动重试。投递失败先确认原slug/返回ID，再决定安全恢复，不能更换slug盲目重发。每频道确认投递结束后处理下一频道；不支持同时大量排队。详情见执行规则。
