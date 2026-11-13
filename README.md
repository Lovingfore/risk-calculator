# 止损风险计算器

中文静态网页，用本金、开仓价和止损价计算投入保证金与仓位。杠杆目标固定为 80x，模型中的价格亏损和交易手续费合计不超过本金的 1%。

计算按 Binance USDⓈ-M USDT 本位线性合约估算，假设普通账户吃单费率为每边 0.05%，并同时计入开仓和平仓手续费。模型假设止损按输入价成交，不计滑点和资金费率；下单时还需按交易对的数量步进向下取整。

所有计算在浏览器本地完成，输入不会被保存或发送。GitHub Pages 地址：[https://lovingfore.github.io/risk-calculator/](https://lovingfore.github.io/risk-calculator/)

## 本地测试

需要 Node.js 20 或更高版本：

```sh
npm test
```
