# Reader 书籍库与每日推荐

公开书籍以不可变书籍 ID 标识。首页和书籍库链接到 `/books/:id`，公开接口使用 `GET /api/v1/books` 和 `GET /api/v1/books/:id`。列表支持 `q` 和 `page`，按书名排序，同名按 ID 排序。搜索按书名或作者匹配。草稿和下架书籍返回 404；书摘和编者按跟随书籍。

后台页面为 `/admin/books`。以既有管理密钥读取、创建草稿和保存修改，发布和下架使用页面按钮。API 沿用 Bearer、强 `If-Match`、`Idempotency-Key` 与原子审计回执。直接发布书籍，无需填写日期或刊号。发布与恢复上架立即公开，北京时间次日参选。

每天独立抽选。D1 以北京时间日期为主键保存抽选结果，抽选及替换由同一个写语句完成。首页和 RSS 在无当日记录时完成抽选。Workers Cron 按 `0 16 * * *` UTC 调用同一逻辑，使无访问的日期也有当日记录。RSS 以日期作为 GUID，链接同一个固定书页。下架当天仍有合资格书时沿用同一 GUID；当日无书时移除当天条目。

## 本地验证

从仓库根目录安装根和 Reader 的锁定依赖。浏览器回归用 Google Chrome 和独立的本地 D1，截图保存在执行回执列出的目录。

```sh
npm --prefix apps/reader run verify:library
npx --no-install tsx scripts/history-import/verify-library-migration.ts /path/to/approved/inventory.json
```

PR 的 Reader CI 在验证通过后上传四张合成测试截图，保留 7 天。需要回滚上传步骤时，从 `.github/workflows/ci.yml` 移除该步骤即可，Reader 验证仍会执行。

浏览器用两个旧公开书目、草稿、撤回书及一次后台发布和下架来检验真实 Worker。历史对账工具先在新本地库导入批准的历史清单，再追加 0004，比较每本书的编者按、正文和按位置排序的摘录，并核对旧表哈希和迁移重跑。

## 生产切换

main 会触发现有 Workers Builds。生产迁移、Cron 设置和 PR 合并由获授权的发布人协调。

1. 确认精确提交、Reader 生产数据库及最新内容。暂停编辑，备份数据库并记录当前 Worker 版本、已有 Cron 和路由。冻结期应覆盖数据快照、迁移和应用切换。
2. 使用审定的 `apps/reader/library-migrations/0004_book_library.sql`。SHA-256 为 `712617c477692126d32220afcdbc2ca97d22e4d98851961a42da6e3a2a25daaf`。单独应用此目录中的追加迁移并读回迁移账本、书籍状态、摘录顺序和旧表对账结果。0001–0003 的历史导入回执和 SQL 保持其原有用途。
3. 合并后核对 Reader 原生构建及新 Worker 版本。新 Worker 检测到 0004 后启用新书库，旧日期、刊号、旧归档和旧搜索地址返回 404。原生构建的 smoke 兼容迁移前状态，发布验收还需明确确认 `/api/v1/books` 返回 200。核对双域首页、书库、固定书页、RSS 与后台读取。
4. 从同一候选的 `reader-production` 配置预检 `cf workers triggers deploy`，核对它将应用的域名与 Cron，再按发布授权应用。原生流水线使用版本上传与流量部署接口，触发器需独立核对。读回计划为 UTC 16:00，观察首次调用的 Worker 日志和 D1 日期记录，然后恢复编辑。

回滚时先暂停编辑，记录并备份切换后新增的书籍、摘录和推荐。恢复上一 Worker 版本及原 Cron 设置即可恢复旧页面。保留追加表与日志以供再次发布。旧版本使用旧刊期内容和共享书目元数据，切换后的书级内容写入无法由旧界面按原刊期表达；恢复前需要明确处理这些写入。
