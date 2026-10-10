# BlockWeeks 内容格式（1.1.0）

保留原格式必填字段 siteId、date、topicId、title、slug、excerpt、content、source。source 固定 codex-scheduled-task，文件路径为 automation/blog-inbox/{siteId}/{date}-{slug}.json。

四个频道 siteId：blockweeks-articles、blockweeks-docs、blockweeks-forum、blockweeks-events。

新增必填 categoryIds（真实栏目 ID 数组）和 sources（来源数组，每项 title、url、kind、checkedAt）。kind 为 official/x/reddit/other，checkedAt 使用包含时区的 ISO 时间。来源可额外包含 publishedAt，以及实际可见 metrics：likes/comments/reposts/score；不可虚构热度。

可选 tagIds、featuredMediaId，均使用已有 ID。论坛没有标签和缩略图。authorId 在可信站点配置中设置，稿件不得指定其他作者。论坛 excerpt 仅保存为稿件摘要，不发给 QAPress 接口。

活动新增必填 event：startDate、endDate（YYYY-MM-DD HH:mm:ss，当地时间）、timezone（IANA 时区）、allDay（布尔）、website（HTTPS 官方地址）。可选 cost（原样字符串，收费不明时省略，不能自动写 0）、venueId、organizerIds。官网来源必须在 sources 中，并与 website 同源。结束时间晚于开始时间。活动详情中的未知信息不要编造。

content 使用原套件 HTML 白名单。文章与论坛正文不带任何链接；知识库与活动可保留必要链接；不附论坛核验尾注。JSON sources 只用于审计，不会自动添加到 WordPress 正文。

slug 必须稳定：活动以大会名称及届次/年份形成 slug，不把每次执行日期加入 slug。四类稿件命名不能用于掩盖重复内容。

seoTitle 和 seoDescription 为可选归档字段，当前不会设置 SEO 插件。

本版每稿一个 PR；pending 选题必须先已存在于 main 的频道队列，不能在同一稿件 PR 中新增并使用题目。

## 社区与新媒体语气（2026-10-10 用户更新，优先于旧表达规则）
- 论坛采用极度惊讶、夸张、直接的币圈社区口吻，可以用“卧槽？”“还能这样？”“这也太离谱了吧”等反应，标题马上点出具体对象和反常之处。正文像群里聊瓜，有吐槽、有情绪、有追问，不写成新闻通稿或抽象问卷。语气随事件变化，不每帖机械套同一句；“出大事了”须有事件事实支撑。
- 文章尤其热议栏目采用social、新媒体、聊八卦的轻松口吻：开头抛出最令人惊讶的反差，接着聊发生了什么、谁说了什么、哪里让人不解。可以调侃、反问、短句和口语小标题，避免正经报告腔、逐项信息罗列和固定背景/风险/启示模板。保持连贯自然段，不能用大量感叹号代替内容。深度稿仍可分析，但用简单直接的语言。
- 夸张用于反应和表达，金额、时间、人数、结果及引语必须准确；不得捏造热度、把个案写成全平台暴雷，或把未证实指控写成事实。指控自然写成“用户称”“项目方回应”，不重复堆免责声明。
- 文章与论坛的title/excerpt/content不带任何超链接、裸URL、Markdown链接或HTML a标签，提到某人的X帖子只正常叙述其说法，不附帖链接、来源列表、脚注或核对日期。来源URL及核验信息必须完整保留在JSON sources、PR或诊断记录中；后台来源不自动拼入公开正文。知识库及活动继续保留必要资料/报名链接。
- 示范语气（仅为写法示例，发稿前另核验）：论坛“卧槽？用户称50 BTC卡了两个多月，Solv这风控还没查完？”；热议“冲着3%的收益进去，用户却说50 BTC两个多月取不出来：Solv这事越聊越拧巴”。不把示例当已核实新素材，不照搬KOL原文或虚构亲历。
- 提交前一次语言检查：是否像社区聊瓜、标题是否有对象与反差、正文是否无链接、情绪是否有事实承接；保持来源核验、查重、长度校验及仅草稿要求。
