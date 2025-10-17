# 如何添加新策略

## 📋 添加新策略的步骤

### 1. 创建策略文件

在 `strategies/` 目录下创建你的策略文件，例如 `my-strategy.js`：

```javascript
const logger = require('../shared/logger');

class MyStrategy {
  constructor() {
    this.name = '我的策略';
    this.version = '1.0.0';
    this.signalToken = 'my_strategy_token_2025'; // 重要：设置唯一的token
    this.activePositions = 0;
    this.totalTrades = 0;
  }

  async start() {
    logger.info(`🚀 初始化策略: ${this.name} v${this.version}`);
    // 添加初始化逻辑
    logger.info(`✅ ${this.name} 启动成功`);
  }

  async handleWebhook(signal) {
    try {
      logger.info(`📨 收到信号: ${JSON.stringify(signal)}`);

      // 验证signalToken
      if (signal.signalToken !== this.signalToken) {
        throw new Error(`无效的signalToken: ${signal.signalToken}`);
      }

      // 处理信号
      switch (signal.action) {
        case 'buy':
          return await this.handleBuySignal(signal);
        case 'sell':
          return await this.handleSellSignal(signal);
        case 'close':
          return await this.handleCloseSignal(signal);
        default:
          throw new Error(`未知的操作: ${signal.action}`);
      }
    } catch (error) {
      logger.error(`❌ 策略处理失败: ${error.message}`);
      throw error;
    }
  }

  async handleBuySignal(signal) {
    // 你的买入逻辑
    return { status: 'success', action: 'buy', message: '买入成功' };
  }

  async handleSellSignal(signal) {
    // 你的卖出逻辑
    return { status: 'success', action: 'sell', message: '卖出成功' };
  }

  async handleCloseSignal(signal) {
    // 你的平仓逻辑
    return { status: 'success', action: 'close', message: '平仓成功' };
  }

  getStatus() {
    return {
      strategyName: this.name,
      version: this.version,
      activePositions: this.activePositions,
      totalTrades: this.totalTrades,
      winRate: '0.00%',
      totalPnL: '0.00',
      accountHighWaterMark: '0.00'
    };
  }
}

module.exports = MyStrategy;
```

### 2. 在 server.js 中注册策略

在 `server.js` 文件中：

```javascript
// 1. 导入策略
const MyStrategy = require('./strategies/my-strategy');

// 2. 在 startServer() 函数中注册
async function startServer() {
  try {
    // ... 其他代码 ...

    // 初始化你的策略
    logger.info('📊 初始化我的策略...');
    const myStrategy = new MyStrategy();
    await myStrategy.start();
    strategyRegistry.register('myStrategy', myStrategy, 'my_strategy_token_2025');

    // ... 其他代码 ...
  } catch (error) {
    // ... 错误处理 ...
  }
}
```

### 3. 在 Pine Script 中使用

在你的 Pine Script 中：

```pinescript
//@version=5
strategy("我的策略", overlay=true)

// 设置signalToken
signalToken = input.string("my_strategy_token_2025", "策略Token")

// 你的策略逻辑
if (你的买入条件)
    alertMsg = '{"action":"buy","instrument":"' + syminfo.ticker + '","signalToken":"' + signalToken + '"}'
    alert(alertMsg, alert.freq_once_per_bar)

if (你的卖出条件)
    alertMsg = '{"action":"sell","instrument":"' + syminfo.ticker + '","signalToken":"' + signalToken + '"}'
    alert(alertMsg, alert.freq_once_per_bar)
```

## 🎯 关键要点

### signalToken 命名规范
- 格式：`{strategy_name}_token_{year}`
- 示例：`xiaobifang_token_2025`, `eth_range_token_2025`
- 必须唯一，不能重复

### 信号格式
```json
{
  "action": "buy|sell|close",
  "instrument": "BTC-USDT-SWAP",
  "signalToken": "your_strategy_token_2025",
  "amount": "0",
  "marketPosition": "long|short|flat",
  "prevMarketPosition": "long|short|flat",
  "marketPositionSize": "1",
  "prevMarketPositionSize": "0",
  "timestamp": "1760607600000"
}
```

### 路由机制
- 系统会根据 `signalToken` 自动路由到对应策略
- 不需要修改路由代码
- 支持无限数量的策略

## 🔧 测试新策略

1. **启动服务**：`npm start`
2. **检查注册**：访问 `http://localhost:3000/health`
3. **测试信号**：使用测试脚本发送信号
4. **查看日志**：观察服务日志确认信号处理

## 📊 监控和调试

- **健康检查**：`GET /health` - 查看所有策略状态
- **持仓查询**：`GET /positions` - 查看所有策略持仓
- **日志监控**：观察控制台输出

## 🚀 高级功能

### 策略间通信
```javascript
// 在策略中访问其他策略
const otherStrategy = strategyRegistry.getStrategyByToken('other_token_2025');
```

### 动态注册
```javascript
// 运行时注册新策略
const newStrategy = new NewStrategy();
await newStrategy.start();
strategyRegistry.register('newStrategy', newStrategy, 'new_token_2025');
```

这样，添加新策略就变得非常简单，不需要修改路由代码，只需要：
1. 创建策略文件
2. 在 server.js 中注册
3. 在 Pine Script 中使用对应的 signalToken

系统会自动处理路由和信号分发！
