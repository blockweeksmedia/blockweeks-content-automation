# BlockWeeks 内容格式（1.1.0）

保留原格式必填字段 siteId、date、topicId、title、slug、excerpt、content、source。source 固定 codex-scheduled-task，文件路径为 automation/blog-inbox/{siteId}/{date}-{slug}.json。

四个频道 siteId：blockweeks-articles、blockweeks-docs、blockweeks-forum、blockweeks-events。

新增必填 categoryIds（真实栏目 ID 数组）和 sources（来源数组，每项 title、url、kind、checkedAt）。kind 为 official/x/reddit/other，checkedAt 使用包含时区的 ISO 时间。来源可额外包含 publishedAt，以及实际可见 metrics：likes/comments/reposts/score；不可虚构热度。

可选 tagIds、featuredMediaId，均使用已有 ID。论坛没有标签和缩略图。authorId 在可信站点配置中设置，稿件不得指定其他作者。论坛 excerpt 仅保存为稿件摘要，不发给 QAPress 接口。

活动新增必填 event：startDate、endDate（YYYY-MM-DD HH:mm:ss，当地时间）、timezone（IANA 时区）、allDay（布尔）、website（HTTPS 官方地址）。可选 cost（原样字符串，收费不明时省略，不能自动写 0）、venueId、organizerIds。官网来源必须在 sources 中，并与 website 同源。结束时间晚于开始时间。活动详情中的未知信息不要编造。

content 使用原套件 HTML 白名单。建议在正文保留读者可点击的来源链接。JSON sources 只用于审计，不会自动添加到 WordPress 正文。

slug 必须稳定：活动以大会名称及届次/年份形成 slug，不把每次执行日期加入 slug。四类稿件命名不能用于掩盖重复内容。

seoTitle 和 seoDescription 为可选归档字段，当前不会设置 SEO 插件。

本版每稿一个 PR；pending 选题必须先已存在于 main 的频道队列，不能在同一稿件 PR 中新增并使用题目。
