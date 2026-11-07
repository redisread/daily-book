# Daily Book Reader：正式模型与公开读取切片

本包是正式 vinext 应用骨架，**不是阶段1 probe 的延续接口，也不是生产切换**。父 Astro 应用、原内容与生产配置保留不变；本次仅本地 D1 schema、共享读取服务、公开 API 与最小 SSR。完整主题、搜索、管理写接口、历史导入和部署均不在范围。

## 本地复现

使用当前 cf 支持的 Node `^22.23.0 || ^24.22.0 || ^26.12.0`（本次26.13.0/npm11.17.0，macOS x64）：

```sh
cd apps/reader
npm ci --ignore-scripts
npm run verify
```

`verify` 应用本地迁移、准备虚构fixture、验证26项schema约束、生成绑定类型、类型检查、构建，再分别启动开发态/构建产物的真实 workerd 做HTTP验证。所有测试进程自动停止，fixture可重复使用。脚本依赖POSIX的ps/进程组；Windows未覆盖。

- `npm run dev`：本地开发；手动查看时不要与验证脚本并行占用端口。
- `npm run start`：预览已构建Worker。
- `npm run db:local`、`npm run seed:local`：仅初始化包内**虚构测试库**，不是历史数据导入工具。
- `node scripts/verify-schema.mjs`：真实D1约束测试。
- `node scripts/verify-runtime.mjs dev` / `built`：分别使用127.0.0.1:49049/49050，不抢占已有服务。

测试只通过固定虚构D1 UUID `00000000-0000-4000-8000-000000000049`、显式 `--local --persist-to .cloudflare/state` 操作数据；配置同时禁止远程绑定和隧道。无account/domain/secret/deploy脚本，不要手工部署本配置。旧根目录wrangler配置不是本包入口。

## 正式模型

`migrations/0001_initial.sql` 是本切片唯一schema来源：

- Book独立保存基础资料与数值year/pages/rating；缺项可用NULL/空值表示，以支持不完整草稿。排版封面保留coverTitle/coverAuthor，可选coverUrl/alt。
- Issue引用Book，独立editorNote/body/status/publicationDate/issueNumber/version。历史editorNote允许NULL，不为新发布门槛补造内容。
- Quote属于Issue，稳定ID、原文、sourceLabel与position（0起）；同一期position唯一。
- pub/withdrawn必须同时有合法日期和正整数期号；draft两者均NULL。日期与期号**全状态唯一**，撤回不释放；首次分配后不可改，恢复复用。
- 实体ID稳定；Book/Issue ID为1–128、Quote为1–160个URL安全ASCII字符（首字符字母/数字，其余字母/数字/`_`/`-`），schema与公开读取校验一致。FK防止悬空与被引用Book删除。
- 时间戳UTC；本切片不做首次发布的Asia/Shanghai当日分配、If-Match、幂等/审计/限流或管理接口，这些仍需后续写入任务。

共享逻辑在 `src/domain/`，API与SSR都直接使用D1，不向自身HTTP转发。详情SQL的CASE仅为published生成公开JSON；草稿/撤回只返回可见性，不返回正文、Book或Quote数据。Book是共享资料，**未来编辑Book会影响引用它的所有刊期**，并不是每期复制一份。

## 当前接口

### GET /api/v1/issues

- `{items: PublicIssue[], nextCursor: string|null}`，类型见 `src/domain/types.ts`。
- limit默认20，范围1–100；非整数、超范围、重复参数及未知参数400，不静默截断。不接受status或搜索参数。
- `publicationDate DESC, id DESC`键集分页，游标含两个排序键与v1；不使用offset。末页nextCursor为null。
- 游标是有界、不透明的base64url数据（最长1024字符），严格检查结构/版本/日期/ID；它表示排序边界，不要求边界行仍处于published。因此撤回边界行后仍可继续分页。

### GET /api/v1/issues/:id

- published：200，`{data: PublicIssue}`，包括其Book与按position排序的Quotes。
- draft与不存在：404，统一错误；withdrawn：410，仅撤回说明，不能返回原正文/书籍/书摘。
- 错误：`{error:{code,message},requestId}`，同时设置X-Request-ID；读取故障503，不向外返回SQL/绑定或异常细节。

### 最小 SSR

- `/`仅选最新published；无published显示真实空态，不随机选草稿/旧内容。
- `/issues/:id`提供最小标题、作者、简介、编辑话与书摘；Issue.body仍存储/可在公开详情API读取，但不新增页面正文展示功能。
- `proxy.ts`在流式HTML/RSC开始前应用相同可见性规则，直接产生404/410；不是只在200页面写提示。页面再次检查以防私密数据进入渲染。
- 内容响应统一 `no-store`，无ISR/跨请求内容缓存。RSC请求按vinext的`_rsc`协议；缺少/错误缓存键可能先得到框架307规范化，测试记录仅同资源的规范化跳转，并严格检查规范化后的真实状态和所有响应体。

不实现公开写方法；阶段1probe、hello接口、旧日期路由和books.json均不带入。

## 验证与局限

fixture包含28个published（可测默认20与分页）、仅草稿/仅撤回引用的Book及私密内容哨兵、跨刊共享Book、不同期号/日期排序和乱序插入Quotes。开发态/构建态均验证分页、非法输入、完整详情映射、SSR/RSC真实状态/隐私、无写API、原始body不新增展示、D1变更后无重建刷新、撤回即时生效及空态。schema测试覆盖唯一性、不可变身份、FK、草稿空值、恢复与无效值。

HTTP状态验证是在本地状态变更完成后发起请求；本切片无公开写接口，**未完成渲染途中并发状态转换、未来幂等/审计与读写整合验收**。proxy和页面的两次读取不是事务快照，二次检查保证不泄露私密内容，但不据此承诺全部并发状态码语义。不得将当前通过等同于生产就绪。

直接依赖沿用已验证的精确版本：vinext1.4.4、React/DOM/RSC19.3.1、Vite8.3.6、Cloudflare Vite plugin2.0.0-beta.v.12、cf1.0.0-beta.28。官方工具链仍是beta；上游fflate依赖链的5个moderate告警、sourcemap/dynamic-import构建警告仍需上线前复核，本应用未接入不受信任ZIP/OG处理。未验证完整主题、父Astro CI或任何线上环境。
