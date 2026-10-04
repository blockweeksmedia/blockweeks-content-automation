# 接入 WordPress 和新 GitHub 账号

本模板面向提供标准 REST API 的 WordPress，优先自建 WordPress。WordPress.com、禁用应用程序密码的主机或安全插件限制的站点，需要先确认其 API/认证方式，不保证直接兼容。

## 网站

1. WordPress 已启用 HTTPS，确认实际 REST 根地址，例如 https://blog.example.com/wp-json/wp/v2/。子目录安装把子目录写入 URL；不要猜测 www 重定向，先用最终地址。
2. 为自动投递准备独立用户。只投递草稿可用 Contributor（投稿者）；如要管理分类或发布，需按实际能力调整。程序仅使用预先存在的分类/标签数字 ID，不自动创建分类，不上传媒体。
3. 在用户资料页创建专用“应用程序密码”。主机禁用该功能时先检查服务端设置，不改用后台登录密码。
4. 在 sites/<siteId>.json 设置站点 ID、最终 URL、REST 根地址、文章长度、分类/标签 ID、draft/publish 和凭据环境变量名称。完成编辑规划和选题后才设置 enabled=true。
5. 用户名与应用程序密码保存为 GitHub 仓库 Secrets（或独立 Environment Secrets），例如 WP_EXAMPLE_USERNAME 和 WP_EXAMPLE_APP_PASSWORD；多站点各用不同名称。不要填进 JSON，不要发到文章 PR。

WordPress 原生支持 title/content/excerpt/slug/status/categories/tags。本套件保存的 seoTitle、seoDescription 是编辑数据，不会自动写入 Yoast/Rank Math 等插件字段。需要这些插件元数据或封面媒体时另做一次适配，不伪称已同步。

## GitHub 与执行

1. 将整套模板文件上传到新账号的仓库，包括隐藏 .github 目录。在 ChatGPT 与 Codex 使用的 GitHub 连接中授权该仓库，确认实际连接账号；换账号无需改写脚本。
2. 修改示例站点或复制出 sites/<siteId>.json，以及同名 plans/topics 文件。默认 mergeMode=manual。需要完整受保护自动合并时启用 Allow auto-merge，main 保护要求 blog-validation、分支最新及已有审核要求，再改 protected。GitHub Free 的私有仓库使用 manual；本模板不会自动降低保护条件。
3. 第一次配置变更的 blog-validation 为 bootstrap 提示，需人工审核代码。先运行 node --test scripts/workflow.test.mjs，合并模板；后续 PR 验证从可信 base 加载脚本，不执行稿件分支代码。非文章配置 PR 的检查可能通过，但绝不代表可自动合并配置。
4. 日常投递从云端任务创建 PR。确认 draft 导入成功后，再决定是否授权 status=publish。工作流不负责生成文章或调度云端任务。
5. 导入失败先看 WordPress 错误码：401/403 检查应用程序密码、用户权限与代理是否保留 Authorization；重定向则修改到最终 REST URL；超时先查文章是否已创建。程序不自动重试 POST，避免不明确结果下创建重复文章。

并发：本仓库同站点导入串行执行。GitHub 的 concurrency 不是持久任务队列，连续快速提交可能替换掉较早等待的运行。技能须检查每个合并提交的导入结果；取消的运行用 workflow_dispatch 提供原始合并前后 SHA 恢复，或者在原运行可重跑时单独重跑。一天一篇正常运行不需要额外轮询；有多份候选合并时先完成已有导入。

不要同时让另一仓库或其他程序向同网站投递相同 slug。跨仓库写入或数据库级“恰好一次”需要站点端幂等接口，不是原生 REST 的保证。

## 来源（核验日期 2026-10-04）

- https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/
- https://developer.wordpress.org/rest-api/reference/posts/
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-auto-merge-for-pull-requests-in-your-repository
