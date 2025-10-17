# 🚀 Quant Trading Service

TradingView信号 + OKX自动交易

---

## 快速启动

```bash
# 1. 配置
cp env.example .env
nano .env  # 填入API Key

# 2. 安装
npm install

# 3. 启动
npm start

# 4. 验证
node tests/verify-market-filter.js
```

---

## 🔑 模拟盘配置

**在 `.env` 中填入：**
```env
# 模拟盘（在OKX模拟交易中创建）
OKX_FAKE_KEY=模拟盘_api_key
OKX_FAKE_SECRET=模拟盘_secret
OKX_SIMULATED=1

# 实盘（小心！）
OKX_API_KEY=实盘_key
OKX_SECRET_KEY=实盘_secret
OKX_PASSPHRASE=实盘_passphrase
OKX_SIMULATED=0
```

**切换：** 改 `OKX_SIMULATED=1/0`

---

## 🛡️ 风控机制

### 核心：系统性风险检测（多币种联动）
- ✅ **70%小币种同时跌>5%** → Level 2 禁止开仓
- ✅ **50%小币种同时跌>5%** → Level 1 限制1个仓位
- ✅ **BTC/ETH 24h涨跌>8%** → Level 2
- ✅ 全局最多3个仓位
- ✅ 单币保证金≤20%

**检测的小币种（15个）：** WIF, PEPE, BONK, DOGE, SHIB, FLOKI, BOME, TRUMP, PNUT, ACT, MOODENG, GOAT, PEOPLE, TURBO, MEW

**历史验证（最近90天，15个币种）：**
- ✅ 真正严重的极端事件：**1天**（10-11关税暴跌）
- ✅ BTC日跌-6.1%，波幅17.7%，小币种全部暴跌10-30%
- ✅ 算法能准确检测并禁止开仓
- ✅ 其他89天可正常交易

**详见**: `tests/EXTREME_EVENTS.md`

---

## 📡 TradingView配置

1. 上传策略：`strategy/小币种防爆v5.5_with_alerts.pine`
2. 设置Token：`xiaobifang_token_2025`（与 `.env` 一致）
3. 创建警报：
   - Webhook: `http://localhost:3000/webhook/xiaobifang`
   - Message: `{{strategy.order.alert_message}}`

**本地测试用ngrok：**
```bash
brew install ngrok
ngrok http 3000
# 使用https URL
```

---

## 📊 监控

```bash
# 查看日志
tail -f logs/combined.log

# 查看持仓
curl http://localhost:3000/positions | jq

# 验证市场过滤
node tests/verify-market-filter.js
```

---

## 📁 文件结构（16个核心文件）

```
service/
├── server.js                     # 启动入口
├── config.js                     # 全局配置
├── .env                          # 你的配置
├── env.example                   # 模板
├── shared/                       # 共享模块
│   ├── okx-api.js
│   ├── position-manager.js
│   ├── market-filter.js          # 系统性风险检测
│   └── logger.js
├── strategies/xiaobifang-v5.5/
│   ├── index.js                  # 策略逻辑
│   ├── config.js                 # 策略配置
│   └── symbols.json              # 93个币种
└── tests/
    └── verify-market-filter.js   # 验证脚本
```

---

## ⚠️ 重要

- **先用模拟盘测试**
- 小资金开始
- 持续监控日志

---

**完整说明见各文件注释**
