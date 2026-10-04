# 文章数据与机械校验

新增文章放在 `automation/blog-inbox/<siteId>/YYYY-MM-DD-<slug>.json`。

必需非空字符串：siteId、date（网站时区的 YYYY-MM-DD）、topicId（选题 id）、title、slug、excerpt、content、source。source 固定 codex-scheduled-task。可选字符串：seoTitle、seoDescription。其他字段拒绝。

- title 和 seoTitle 最多 180 个 UTF-16 单位，slug 最多 160，topicId 最多 120，excerpt 最多 500，content HTML 最多 120000，seoDescription 最多 320。
- title/excerpt 是纯文本。slug 使用小写英文、数字、连字符。
- 正文仅 p、h2、h3、ul、ol、li、strong、em、blockquote、code、a、br。标签必须闭合，br 除外。不带 style、事件、图片等属性。链接只带双引号 href，使用 http/https/mailto 绝对地址。
- minimumCharacters/maximumCharacters 计算方式：去标签、解码常见和数字实体、空白折为一个空格、trim 后 JavaScript string.length。不是字节数或纯汉字数。写作篇幅与机器阈值分开控制。
- 分类/标签使用 sites 配置中的已有 WordPress 数字 ID；本版不按文章动态创建 taxonomy。
- seoTitle/seoDescription 保存在 GitHub 中供编辑使用；本版不自动映射 SEO 插件的专用字段。

同一稿件 PR 中，把选题表对应的 pending 项改成 used，加 usedAt 和 articleSlug；可加 articleTitle（必须等于稿件标题），其余旧字段不变。新题目仅追加 pending 项。

从完整 base/head SHA 调用 `node scripts/validate-pr.mjs BASE_SHA HEAD_SHA`。它核对稿件范围、HTML、长度、历史 slug/title/日期与选题变化。其他 PR 和 WordPress 未导入稿件、搜索意图和外部事实仍由技能核对；脚本不声称覆盖这些语义检查。
