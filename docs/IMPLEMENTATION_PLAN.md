# v0.5 实施方案与审计

依据根目录《活搭 HUODA v0.5 Codex 开发执行清单》，2026-09-10。

## A. 基线
v0.4.3 是原生单页 Web App；CSS 已人工确认。app.js 混合页面、Supabase 和 LocalStorage。
游客已能浏览。数据库有五表，但公开 profile 暴露认证资料，插入认证字段缺少保护；报名商家 ID 可伪造，确认不扣名额；附近全量下载计算；云端故障自动降级会混淆真数据和演示数据。

## B. 方案
选择渐进拆服务和新增页面，保留首页 HTML 与 CSS。整套重写违反清单；只补前端不能修复事务与权限。新目录 huoda_v050，独立本地数据空间，不覆盖任何历史版本。
服务按 auth/task/application/favorite/message/notification/review/merchant/location/recommendation 分工。页面层调用同一服务接口，云端失败显示错误，不冒充本地成功。

## C. 数据迁移
先旧基线建表（新库），再事务化迁移。旧库直接跑迁移。保留旧字段但撤销危险写权限；只有白名单 RPC 可以写关键业务状态。所有 SECURITY DEFINER 函数固定 search_path、明确鉴权、收回 PUBLIC 默认执行权限。
新增 worker_profiles、merchant_profiles、favorites、reviews、notifications、audit_logs、admin_users。PostGIS 使用 extensions，坐标统一 WGS84，未确认来源的旧坐标不自动导入。审核后台 Edge Function 验 JWT 和私有管理员表，服务角色只用于后台。
报名同任务行锁，确认扣减，撤回已接受报名归还名额；取消终态不可重复报名。完成由任一参与方显式确认，仅 accepted 可完成；完成不归还已消费名额。

## D. 阶段与验收
1. 数据库/RLS + 静态和可执行数据库测试。
2. 附近/组合筛选/分页 + RPC 合同、定位拒绝与边界测试。
3. 报名状态机 + 重复、越权、满员测试。
4. 收藏、通知、实时消息、评价 + 登录合并、未读、重复评价测试。
5. 公开档案、Storage、后台 + 私有字段与管理员拒绝测试。
6. 浏览器游客 A、双方 C/D/E、本地审核 F/G/H；移动端截图；完整文档。

## 环境边界
没有实际 Supabase 配置。交付云端 migration / seed / Edge Function 和测试步骤，真实 Supabase Auth、Realtime、Storage 及跨连接并发必须在目标项目上验收，不以本地演示通过代替云端上线验收。P1/P2 不纳入此次范围。
