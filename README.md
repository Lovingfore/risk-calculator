# 止损风险计算器

中文静态网页，用本金、开仓价和止损价计算投入保证金与仓位。杠杆目标固定为 80x，模型中的价格亏损和交易手续费合计不超过本金的 1%。

计算按 Binance USDⓈ-M USDT 本位线性合约估算，假设普通账户吃单费率为每边 0.05%，并同时计入开仓和平仓手续费。模型假设止损按输入价成交，不计滑点和资金费率；下单时还需按交易对的数量步进向下取整。

所有计算在浏览器本地完成，输入不会被保存或发送。GitHub Pages 地址：[https://lovingfore.github.io/risk-calculator/](https://lovingfore.github.io/risk-calculator/)

## Binance 合约钱包余额曲线

页面下方可查看 USDⓈ-M 合约账户的 USDT 钱包余额历史。只读取钱包余额，不读取现货、未实现盈亏、仓位或订单。GitHub Actions 每次启动后会在同一 Runner 上连续采集，每次采样间隔 5 分钟；约 5 小时 40 分钟后由工作流自动接续下一批。GitHub 调度和 Actions 服务仍可能延迟或漏跑，因此这不是实时或准点监控服务。

要启用采集，请在 Binance 创建 API Key，只开启 `Enable Reading`（读取）权限；本项目请求的 USDⓈ-M 余额接口属于 `USER_DATA` 查询，不需要下单交易权限。不要开启现货/杠杆交易、合约交易或提现权限。若 Binance 当前的密钥设置无法在不授予交易能力的情况下读取合约余额，请不要为此打开交易权限。GitHub 托管 Runner 没有固定出口 IP；如果 Binance 要求固定 IP 白名单，这种 GitHub 托管方案无法稳定连接。采集工作流通过 Clash 订阅在日本节点中选择首个能访问 Binance 的节点；请确保你的账户获准从该地区访问。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 添加以下四个 Repository secrets：

- `BINANCE_API_KEY`：Binance API Key。
- `BINANCE_API_SECRET`：对应的 API Secret。
- `BALANCE_HISTORY_PASSWORD`：用于加密历史数据的随机密码，至少 32 个字符。
- `CLASH_SUBSCRIPTION_URL`：Clash 的 HTTPS 订阅链接。链接包含代理访问凭据，请只存为 Secret，不要发到聊天或提交到仓库。

可在自己的电脑上生成高强度密码：

```sh
node -e "console.log(require('node:crypto').randomBytes(36).toString('base64url'))"
```

把生成结果分别保存为 `BALANCE_HISTORY_PASSWORD` Secret，并在网页中输入以解锁。不要把密码、API Key 或 API Secret 发到聊天、提交到仓库或写入页面代码。网页不会保存密码；刷新页面后需要重新输入。

更换 `BALANCE_HISTORY_PASSWORD` 不会自动重加密已有记录。页面解锁和后续采集都需要与当前历史匹配的密码；直接改 Secret 会导致旧记录无法解锁，采集也无法追加。更换前必须先用旧密码迁移历史记录。

配置 Secrets 后，可在 **Actions → Collect Binance wallet balance → Run workflow** 手动启动第一次采集。采集成功后会创建 `balance-history` 分支。分支里的余额记录经过 AES-GCM 加密，但仓库是公开的，密文和采样时间仍可被查看；Git 历史可能保留先前版本，因此更改密码不能擦除旧密文。请保护默认分支，只允许信任的维护者修改可读取 Actions Secrets 的工作流。

定时事件会自动启动连续采集；也可在 **Actions → Collect Binance wallet balance → Run workflow** 手动启动。手动运行默认只采集一次；勾选 `continue_loop` 可启动连续采集，`collection_cycles` 控制首批采样次数（最多 68 次）。连续模式需要长时间占用一个 GitHub-hosted Runner，并通过 `GITHUB_TOKEN` 的 Actions 写权限在批次之间接续。公开仓库的标准 Runner 当前适用 GitHub 的免费策略，但平台政策可能变化；GitHub 不保证永久免费、每次准点运行或数据永不丢失。没有配置 Secrets 或尚无成功采样时，页面会明确显示余额历史未配置，不会显示虚构余额。

## 本地测试

需要 Node.js 20 或更高版本：

```sh
npm test
```
