# 安全反馈与维护范围

活搭 HUODA 当前为 0.5.4 非商业源码公开准备版本，尚未发布支持周期或长期安全修复承诺。维护者会针对当前开发版本评估报告；旧版本需要单独确认。

## 私密报告方式与当前状态

GitHub 维护账号为 @hedawang01-dev。安全邮箱是可选联络方式，不是把源码设为 Public 的平台前置要求；本项目不要求维护者公开私人邮箱，也不填写虚构邮箱。

计划采用 GitHub 的 [Private Vulnerability Reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)。**当前仓库仍为私有，该报告入口尚未启用，不要把本说明当作现有可用入口。** 所有者另行确认公开后，在仓库 Settings → Advanced Security 中启用该功能，随后确认 Security → Advisories 出现 Report a vulnerability 按钮、测试私密提交与维护者通知，再更新此处状态。预备的 `.github/VULNERABILITY_REPORT.yml` 仅定义字段，不会激活功能。

启用后通过上述入口私密提交。若暂时看不到入口，可发不含漏洞详情的 Issue，仅请求维护者提供私密联络方法；不要附攻击步骤、密钥或个人资料。维护者收到请求后应提供可用的私密渠道或完成该功能启用；不要将公开 Issue 用作漏洞详情的接收渠道。

维护者也可将来增加一个实际能收信的专用邮箱，但不以此重复阻断当前源码的人工审核。本次未开启远端功能，也未为开启它更改仓库可见性。

报告应包含受影响版本、运行模式、最小复现、影响范围和可能缓解方式。仅使用有权访问的隔离环境和匿名数据，不测试他人的账号、服务或生产库。请与维护者协调披露；当前不承诺未验证的响应时限。

## 禁止公开的内容

API/管理密钥、service_role、sb_secret_、数据库密码、JWT、Cookie、会话、私钥、认证材料、真实用户信息、未脱敏日志以及可直接利用的未修复漏洞细节。
Project URL 和 publishable/anon key 属于浏览器公开连接信息；仍需确认配套 RLS、Auth、Storage 与授权策略，不能用它们代替数据权限。

## 运行边界

- LocalStorage 演示没有真实密码验证，模拟管理员也不是安全隔离。不要用于真实账号或业务。
- 正式运行依赖 Supabase 迁移、RLS、Auth、私有 Storage、管理员 Edge Function 与允许的 Origin。
- 本地自动化包含 PGlite/传输替身，不能代替真实部署安全验收。
- 凭据如进入历史，先撤销/轮换，再由所有者决定历史处理；仅删除当前文件不能撤销泄露。
- 不向浏览器放高权限密钥，不提交私人配置，不在未获授权时更改生产数据。
