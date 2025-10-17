# 环境变量配置说明

## OKX API 配置

```bash
# 实盘 API
OKX_API_KEY=your_api_key_here
OKX_SECRET_KEY=your_secret_key_here
OKX_PASSPHRASE=your_passphrase_here

# 模拟盘 API（可选）
OKX_SIMULATED=0  # 1=模拟盘, 0=实盘
OKX_FAKE_KEY=your_demo_api_key_here
OKX_FAKE_SECRET=your_demo_secret_key_here
OKX_FAKE_PASSPHRASE=your_demo_passphrase_here
```

## 邮件通知配置

### Gmail 配置步骤

1. **开启两步验证**
   - 登录 Google 账户
   - 前往 https://myaccount.google.com/security
   - 启用"两步验证"

2. **生成应用专用密码**
   - 在安全设置中选择"应用专用密码"
   - 选择"邮件"和"其他（自定义名称）"
   - 输入"Quant Trading"
   - 复制生成的16位密码

3. **配置环境变量**
```bash
GMAIL_ACCOUNT=your_email@gmail.com
GMAIL_PASSWORD=xxxx xxxx xxxx xxxx  # 应用专用密码（16位）

# 可选：指定发送者和接收者（默认使用 GMAIL_ACCOUNT）
EMAIL_SENDER=your_email@gmail.com
EMAIL_RECEIVER=your_email@gmail.com
```

### 邮件通知功能

✅ **自动发送通知的情况：**
- 每笔交易完成（开仓/加仓/平仓）
- 交易失败
- 并发限制触发
- 市场状态变化（Level 1/2）
- 系统错误

📧 **邮件内容包括：**
- 策略名称
- 币种和操作类型
- 数量、价格、金额
- 成功/失败状态
- 订单ID
- 原始信号详情
- 市场状态（风险等级、BTC波动率等）
- 当前持仓详情

### 测试邮件服务

```bash
# 启动服务后，在控制台中运行：
curl http://localhost:3000/test-email
```

## 其他配置

```bash
# 服务端口
PORT=3000

# 运行环境（development/production）
# 只有 production 模式才会实际发送邮件
NODE_ENV=development

# 策略配置
XIAOBIFANG_SIGNAL_TOKEN=xiaobifang_token_2025
XIAOBIFANG_MAX_POSITIONS=3
XIAOBIFANG_SINGLE_MARGIN_PCT=20
XIAOBIFANG_INITIAL_MARGIN=40

# Webhook 密钥
WEBHOOK_SECRET=your_webhook_secret_here
```

## 注意事项

⚠️ **重要：**
- 邮件服务只在 `NODE_ENV=production` 时启用
- 开发环境会显示"邮件通知已禁用"
- 确保 Gmail 账户开启了"两步验证"
- 使用"应用专用密码"而不是账户密码
- 不要将 `.env` 文件提交到 Git 仓库

## 邮件示例

```
═══════════════════════════════════════
📊 交易执行报告
═══════════════════════════════════════

【基本信息】
策略名称: 小币种防爆v5.5
币种: BTC-USDT-SWAP
操作类型: 开仓
方向: 做空
执行时间: 2025-10-16T12:00:00.000Z

【交易详情】
数量: 1
价格: $107,234.50
金额: $107,234.50

【执行结果】✅ 成功
订单ID: 2956579734678241280

【市场状态】
风险等级: Level 0 (正常)
BTC波动率: 0.88%
BTC价格变化: -1.10%
BTC MA偏离: 3.79%
山寨币联动: 0% 下跌, 0% 上涨

【当前持仓】
活跃持仓数: 1
总持仓价值: $107,234.50
总盈亏: $0.00

═══════════════════════════════════════
🤖 Automated by Quant Trading System
═══════════════════════════════════════
```

