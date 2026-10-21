# 参与活搭 HUODA

当前处于非商业源码公开准备阶段，采用 PolyForm Noncommercial 1.0.0。请先阅读 README、docs/LICENSING.md 与 SECURITY.md；对外贡献入口开放后，以所有者确认的仓库为准。

## 报告问题
使用 Bug 模板，说明包版本/提交、操作系统、浏览器、运行模式（本地演示/隔离云端）、最小复现、预期与实际结果。附脱敏日志或匿名截图。先搜索已有问题。
不要提交账号密码、Cookie、token、真实姓名、电话、认证材料或生产数据。安全问题使用私密流程。

## 本地开发
1. 安装 Node.js 22，执行 npm ci --ignore-scripts。
2. 执行 npm start，浏览 127.0.0.1:8085；默认匿名本地演示。
3. 云端改动仅使用自己获授权的隔离开发项目，按 MIGRATION.md 初始化。
4. 保持服务运行；安装 Playwright Chromium 或设置 BROWSER_PATH，再按 TESTING.md 执行检查。

## 贡献授权
贡献者应确认有权提供提交内容，并在拟合并时同意将其有权授权的自有改动按项目相同的 PolyForm Noncommercial 1.0.0 提供。第三方内容必须单独登记来源和原许可；不能以项目许可重新限制第三方原有商用权。
本项目为受限许可的源码可见项目；公开贡献不自动授予商业使用权限，具体用途以 LICENSE 为准。

## 改动约定
- 保留原生前端和既有品牌/响应式布局。页面经过 src/services 访问数据。
- SQL 变更追加迁移；不重写已应用迁移，不通过关闭 RLS 解决权限问题。
- 修改业务状态、认证、权限或并发行为时补充真实行为回归，说明本地测试边界。
- 不顺带做大规模格式化、依赖升级或无关重构。沿用相邻文件风格。
- 用简洁、说明意图的提交标题；本次准备不要求或制造提交次数。
- 提交第三方代码/图片/字体时提供来源、许可和必要声明；不得引入未授权素材。

## Pull Request
说明问题、修改后的行为、影响范围、验证命令与实际输出摘要。用清单标记通过、失败、跳过和未验证；UI 改动可附匿名前后截图。
提交前检查 git diff 与暂存文件，排除 config.js、.env、node_modules、dist、数据库、日志及 .local。不要在 PR 中公开漏洞利用细节。
未经所有者另行确认，不推送生产、迁移真实业务数据库或发布 Release。

## 提交前的分发检查
执行 `npm run check`、`npm run check:publication`，保持本地服务运行后执行 `npm test`，再执行 `npm run build:demo` 与 `npm run verify:dist`。新增分发文件需确认其来源并补齐第三方声明；新增根文件需核对 publication.cjs 白名单。
维护账号、代码审阅与远端流程边界见 [MAINTAINERS.md](docs/MAINTAINERS.md)，首次发布见 [PUBLISHING.md](docs/PUBLISHING.md)。依赖升级 PR 需要实际回归；不要因为 Dependabot 提交就自动合并。
