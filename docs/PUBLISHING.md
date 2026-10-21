# 源码发布操作说明

状态：本地准备完成后交由所有者审核；现有仓库保持私有。打包命令本身不执行远端操作；维护者本轮已另行授权更新现有私有仓库，公开仍由本人手动决定，见 PRIVATE_REPOSITORY_UPDATE.md。

## 重新生成可审阅的源码包

在本项目根目录执行：

```sh
npm run check:publication
npm run prepare:publication
```

默认生成 `.local/publication-candidate/source/` 与同级 `MANIFEST.json`。输出目录已存在时会拒绝覆盖；请改用新的目录，例如：

```sh
npm run prepare:publication -- .local/publication-candidate-2
```

检查只覆盖有限的凭据模式、路径、许可元数据和分发边界，不能代替人工审阅或证明没有所有漏洞。MANIFEST 包含每个文件的原始字节数及 SHA-256；LICENSE 检查允许换行差异，其规范文本仍须与官方一致。

目录以位置参数传给 npm，兼容本次验证的 Windows PowerShell/npm；直接调用 Node 时也支持 `node scripts/publication.cjs pack --output .local/publication-candidate-2`。不接受多余或未知参数，避免误用默认目录。

`source/` 内才是拟提交的仓库内容，包含 `.github`、`.gitignore`、`.gitattributes`、`.env.example` 等隐藏文件。保留 supabase.sql 基线及其同内容 CLI 迁移副本、增量迁移、测试、文档和 vendor 许可。MANIFEST 位于源码目录外，便于复核，不需要作为应用代码上传。

生成器只收集明确的根文件及源码目录，排除 `.git`、`config.js`、私有 `.env`、supabase/.temp 连接缓存、node_modules、dist、缓存、数据库、日志和本地备份。不直接上传整个桌面父目录。新增根文件或目录应先审阅生成规则，避免遗漏。

## 选择发布方式

当前交付源码包自身不含 .git，可作为清晰的单次源码快照。维护者本轮已选择更新现有私有仓库；若以后另选无历史发布方式，可将已审阅的 `source/` 用于新仓库首次提交。首次提交应诚实注明来源为 0.5.4 / 071de19 的整理快照，不能冒充完整或长期公开历史。

如果选择公开现有 huoda 仓库：旧提交中仍有个人本地目录记录，须由本人审阅并决定处理方式；当前候选包的清洁程度不能代表旧历史。不要复制旧 .git 到新候选包，不自动重写历史或强制推送。

具体仓库名、上传、可见性与首次公开由所有者亲自决定；本轮已获授权更新私有仓库；不创建公开 Release 或更改可见性。维护者已说明自建内容由 AI 辅助生成，依据见 [AI_PROVENANCE.md](AI_PROVENANCE.md)，不再要求重复提供形式授权证明或安全邮箱。当前可按 [交接清单](PUBLICATION_CHECKLIST.md) 进入人工审核和公开确认。

## GitHub 配置说明

- `.github/workflows/quality.yml` 安装锁定依赖、审计、语法与源码包检查、浏览器/SQL 回归和演示构建校验，权限为 contents:read。Actions 固定提交来自官方 v4 引用核验，见 [证据](verification/2026-10-21-github.json)。本地验证不能表示远端工作流已成功。
- CODEOWNERS 使用已核实的 @hedawang01-dev；要求 code-owner 审阅仍需远端规则支持和配置。
- Dependabot 每周检查 npm 与 GitHub Actions，最多各 5 个更新 PR，不配置自动合并。
- `.github/VULNERABILITY_REPORT.yml` 只准备私密报告字段，不激活入口。GitHub [官方说明](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository) 指出该功能面向公开仓库；所有者公开后立即启用并验证该入口与维护者通知；安全邮箱可选，当前不能将准备的表单当作现有渠道。

## 源码公开与网站部署

GitHub 源码候选包保留迁移、测试和工程文档；网站部署仅使用构建后的 dist 白名单。不要把源码包整体部署到网站。演示构建明确标记 local-demo；正式服务须完成独立云端验收并使用自己的公开浏览器连接参数。

非商业源码可见不等于 OSI 开源，也不保证获得 Codex for Open Source 权益。许可详情见 [LICENSING.md](LICENSING.md)，上线步骤见 [迁移说明](../MIGRATION.md)。
