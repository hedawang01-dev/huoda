# 非商业许可调整记录 · 2026-10-21

> 当前仓库更新已获维护者授权，基于 94754e1 保留原历史和 CLI 迁移改进；下文关于无历史交付包及仅本地操作的记录保留为此前准备阶段证据。最新范围见 [私有仓库更新记录](PRIVATE_REPOSITORY_UPDATE.md)。

用户要求：可以公开源码，不希望他人用于商业用途。由此替代先前的 MIT 评估方向。

> 本文保留许可调整当时的记录。后续维护者已提供 AI 生成来源信息，安全邮箱改为可选；当前状态见 [AI 来源说明](AI_PROVENANCE.md) 和根审查报告。

## 已实施
- 原样加入 PolyForm Noncommercial 1.0.0 官方 LICENSE，SHA-256 为 ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8。
- package 与 lock 使用 SPDX 标识 PolyForm-Noncommercial-1.0.0；保留 private:true。
- README、贡献/许可说明与 OpenAI 材料使用“非商业源码可见”称谓，明确允许用途和组织条款。
- 构建及产物校验加入 LICENSE，相关回归先实际检出缺失，再修复并通过。
- 项目业务界面、Service、SQL、后台、vendor 不变；第三方原许可不变，不对其额外施加非商业限制。
- 未虚构版权人、姓名、邮箱、商用价格或 OpenAI 资格；没有推送、发布或更改 GitHub 可见性。

## 准确边界
公益、教育、公共科研、公共安全/卫生、环保和政府机构属于原文明确允许使用的组织，不能把许可简化为无例外的所有商用活动禁令。适用范围以 LICENSE 和 docs/LICENSING.md 为准。
许可调整当时尚缺自建材料来源说明与安全接收方式；后续信息已按上方链接补充，不能将此历史句视为当前重复确认要求。非商业限制不符合 OSI 标准开源定义，影响 Codex for Open Source 的申请口径，是否受理尚未确认。

## 验证与备份
本次实际检查结果见公开准备报告及 docs/verification/2026-10-21-noncommercial.json。许可修改前的 110 文件快照及逐文件哈希保存在忽略的 .local/noncommercial-license-20261021/，早先原始源码备份和旧 E 盘交付继续保留。
