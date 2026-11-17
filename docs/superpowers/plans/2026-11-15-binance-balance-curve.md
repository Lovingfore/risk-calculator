# Binance 余额曲线实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：**在现有风险计算器下方展示 Binance USDⓈ-M 账户权益曲线（包含未实现盈亏），并用 GitHub Actions 每五分钟采样、加密并保存历史。

**架构：**Node.js collector 只在 Actions 中读取 Binance API Secrets，取得余额后在本地加密，再写到 `balance-history` 分支。公开 Pages 只下载密文；用户在浏览器输入历史密码，由 Web Crypto 解密并绘图。

**技术栈：**Node.js 内置 `node:test`、Node `crypto`、浏览器 Web Crypto、Canvas、GitHub Actions、GitHub Pages。

**Spec：**`docs/superpowers/specs/2026-11-15-binance-balance-curve-design.md`

## 全局约束

- 从 Binance USDⓈ-M `/fapi/v3/account` 读取 `totalWalletBalance` 和 `totalUnrealizedProfit`，求和作为账户权益；不读取现货或订单。
- 新样本显式标记为权益；旧的无标记钱包余额记录保留加密存储，但不混入权益曲线、摘要或本金计划。
- API Key 只启用读取权限，不启用交易和提现。
- `BINANCE_API_KEY`、`BINANCE_API_SECRET`、`BALANCE_HISTORY_PASSWORD` 只从 GitHub Actions Secrets 读取；不写入日志、网页或仓库文件。
- 每条历史记录使用 AES-256-GCM；密钥由 PBKDF2-HMAC-SHA256、600,000 轮和公开项目盐导出。
- 最近 30 天保留 5 分钟记录；30 至 365 天保存每小时最后值；365 至 1,825 天保存每日最后值。
- 公开 Pages 不显示明文余额，除非用户在当前页面会话输入历史密码。
- GitHub Actions 使用公共仓库标准 Runner；五分钟调度可能延迟，不能承诺永久免费或准点运行。

---

### Task 1: 加密格式、余额解析与历史汇总

**文件：**
- 新建：`src/history-crypto.js`
- 新建：`src/balance-history.js`
- 新建：`test/history-crypto.test.js`
- 新建：`test/balance-history.test.js`

**接口：**
- 历史样本为 `{ timestamp, balance, resolution, balanceType? }`；新权益样本 `balanceType` 为 `equity`，旧无标记样本保持钱包余额语义。
- `deriveHistoryKey(password)` 返回可供 Node 与浏览器 Web Crypto 共用的 AES-GCM `CryptoKey`。
- `encryptSample(sample, key)` 返回 `{ version, iv, ciphertext }`；ciphertext 包含 GCM tag。
- `decryptSample(record, key)` 返回 `{ timestamp, balance, resolution }`，校验失败时抛错。
- `parseUsdMAccountEquity(payload)` 返回 `totalWalletBalance + totalUnrealizedProfit`，缺失或格式错误时抛错。
- `filterAccountEquity(samples)` 只返回显式标记的权益样本。
- `compactHistory(samples, now)` 返回按 UTC 规则压缩、按时间升序排列并限制五年保留期的记录；每小时/每日只留桶内 timestamp 最大的有效样本。
- `filterHistory(samples, range, now)` 接受 `24h | 7d | 30d | 180d | 1y | 3y | 5y` 和以毫秒计的当前时间，返回时间窗内的实际样本。

- [ ] **步骤 1：先写失败测试**，覆盖正确密码往返、错误密码、篡改记录、账户权益字段、错误响应、UTC 小时/日汇总、30/365/1825 天边界和七种范围过滤。
- [ ] **步骤 2：运行 `node --test`，确认因模块缺失而失败。**
- [ ] **步骤 3：实现最小的 Web Crypto 加解密、USDT 解析和纯函数汇总。** 使用 AES-GCM 96 位随机 IV；共享盐作为公开常量；每条加密样本单独一行保存。
- [ ] **步骤 4：重跑 `node --test`，确认测试通过；再执行 Node 与 Web Crypto 互通检查。**

### Task 2: Binance 只读采集器

**文件：**
- 新建：`scripts/collect-balance.js`
- 新建：`test/collect-balance.test.js`

**接口：**
- `buildSignedBalanceRequest({ apiKey, apiSecret, timestamp })` 返回 Binance USDⓈ-M `/fapi/v3/account` 的签名 URL 与只读请求头。
- `collectBalance({ env, historyDirectory, fetchImpl, now })` 校验必需环境变量，取得账户权益，保留并压缩旧钱包记录及新权益记录，写入 `history.jsonl` 和 `latest.json`。
- CLI 入口只在所有校验、Binance 请求、加密和文件更新成功后返回成功状态；错误摘要不包含密钥、签名 URL 或余额明文。

- [ ] **步骤 1：先写请求签名、环境变量校验、账户权益计算、成功加密写入和失败不覆盖旧文件的测试。**
- [ ] **步骤 2：运行测试，确认缺失 collector 模块时失败。**
- [ ] **步骤 3：实现 HMAC-SHA256 Binance 签名及可注入 `fetchImpl` 的采集函数。**
- [ ] **步骤 4：运行 collector 测试和任务 1 的完整测试。**

### Task 3: 中文余额曲线界面

**文件：**
- 修改：`index.html`
- 修改：`styles.css`
- 新建：`src/balance-app.js`
- 新建：`src/balance-chart.js`

**接口：**
- 页面从 `https://raw.githubusercontent.com/Lovingfore/risk-calculator/balance-history/` 读取 `history.jsonl` 和 `latest.json`；时间范围值固定为 `24h | 7d | 30d | 180d | 1y | 3y | 5y`。
- 用户提交历史密码后，`balance-app.js` 解密历史，显示最新余额、相邻采样变化、采样时间及状态；不保存密码。
- `balance-chart.js` 接收 `{ timestamp, balance, resolution }[]`、时间范围和 Canvas 上下文，绘制带时间/USDT 坐标、悬浮提示的响应式曲线。

- [ ] **步骤 1：增加中文余额面板、密码输入、状态区和七档时间选择。**
- [ ] **步骤 2：接入解密、历史加载、30 秒最新点刷新、错误和 15 分钟过期提示。**
- [ ] **步骤 3：绘制曲线与坐标/提示，在桌面和窄屏浏览器中检查布局。**
- [ ] **步骤 4：确认原计算器输入和结果不受影响。**

### Task 4: GitHub Actions、部署与用户配置说明

**文件：**
- 新建：`.github/workflows/collect-balance.yml`
- 修改：`.github/workflows/pages.yml`
- 修改：`README.md`

- [ ] **步骤 1：添加 collector Workflow**，按五分钟调度、相关代码推送及手动触发；只在默认分支运行；缺少 Secrets 时输出配置提示并安全退出、不建分支也不访问 Binance；Secrets 只传给 collector；设置并发组和 `contents: write` 最小权限；如果 `balance-history` 不存在则在首次有效采样时自动创建；成功后仅提交密文到该分支。
- [ ] **步骤 2：保持 Pages 部署与 collector 分离**，把新增前端模块放入 `_site/src/`，避免余额采样触发站点部署。
- [ ] **步骤 3：用简体中文写 Secrets 配置、Binance 只读权限、历史密码生成与页面解锁步骤。**
- [ ] **步骤 4：运行全部 Node 测试、语法检查、本地页面资源请求检查；检查工作流 YAML 和 Actions 权限。**
- [ ] **步骤 5：推送并验证 GitHub Actions 与 Pages 发布；未配置用户 Secrets 前，明确显示需要配置，不伪造余额。**
