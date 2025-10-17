require('dotenv').config();
const express = require('express');
const logger = require('./shared/logger');
const StrategyRegistry = require('./shared/strategy-registry');
const emailNotifier = require('./shared/email-notifier');

// 导入策略
const XiaoBiFangStrategy = require('./strategies/xiaobifang-v5.5');
// const EthRangeStrategy = require('./strategies/eth-range');  // 如果不需要，注释掉

const app = express();
app.use(express.json());

// 初始化策略注册系统
const strategyRegistry = new StrategyRegistry();

/**
 * 健康检查
 */
app.get('/health', async (req, res) => {
  try {
    const status = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      strategies: await strategyRegistry.getStrategiesStatus()
    };
    res.json(status);
  } catch (error) {
    logger.error(`Health check failed: ${error.message}`);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * 获取所有持仓
 */
app.get('/positions', (req, res) => {
  const allPositions = {};
  
  for (const [name, strategy] of strategyRegistry.getAllStrategies()) {
    allPositions[name] = strategy.getStatus();
  }
  
  res.json(allPositions);
});

/**
 * 通用信号路由 - 根据signalToken自动路由到对应策略
 */
app.post('/', async (req, res) => {
  try {
    const signal = req.body;
    
    // 根据signalToken路由到对应策略（测试策略也走这里）
    const strategy = strategyRegistry.getStrategyByToken(signal.signalToken);
    if (strategy) {
      const result = await strategy.handleWebhook(signal);
      res.json(result);
    } else {
      logger.warn('⚠️ 未知的signalToken', { signalToken: signal.signalToken });
      res.status(400).json({ 
        error: '未知的signalToken', 
        availableTokens: strategyRegistry.getAvailableTokens() 
      });
    }
  } catch (error) {
    logger.error('❌ 处理信号失败', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

/**
 * 小币种防爆策略 Webhook
 */
app.post('/webhook/xiaobifang', async (req, res) => {
  try {
    const signal = req.body;
    const strategy = strategyRegistry.getStrategyByToken('xiaobifang_token_2025');
    if (strategy) {
      const result = await strategy.handleWebhook(signal);
      res.json(result);
    } else {
      res.status(500).json({ error: 'xiaobifang策略未注册' });
    }
  } catch (error) {
    logger.error('Webhook处理失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ETH区间策略 Webhook（示例，如果不需要就注释掉）
 */
// app.post('/webhook/eth-range', async (req, res) => {
//   try {
//     const signal = req.body;
//     const result = await strategies.ethRange.handleWebhook(signal);
//     res.json(result);
//   } catch (error) {
//     logger.error('ETH策略Webhook失败:', error);
//     res.status(500).json({ error: error.message });
//   }
// });

/**
 * 启动服务
 */
async function startServer() {
  try {
    logger.info('🚀 正在启动交易服务...');
    // 1. 初始化小币种防爆策略
    logger.info('📊 初始化小币种防爆策略...');
    const xiaobifangStrategy = new XiaoBiFangStrategy();
    await xiaobifangStrategy.start();
    strategyRegistry.register('xiaobifang', xiaobifangStrategy, 'xiaobifang_token_2025');

    // 2. 初始化其他策略（如果需要）
    // logger.info('📊 初始化ETH区间策略...');
    // const ethRangeStrategy = new EthRangeStrategy();
    // await ethRangeStrategy.start();
    // strategyRegistry.register('ethRange', ethRangeStrategy, 'eth_range_token_2025');

    // 3. 启动HTTP服务器
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      logger.info(`✅ 服务已启动: http://localhost:${PORT}`);
      logger.info(`📡 通用Webhook: http://localhost:${PORT}/`);
      logger.info(`📊 健康检查: http://localhost:${PORT}/health`);
      logger.info(`📈 持仓查询: http://localhost:${PORT}/positions`);
    });

  } catch (error) {
    logger.error('❌ 服务启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('👋 收到退出信号，正在关闭服务...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('👋 收到终止信号，正在关闭服务...');
  process.exit(0);
});

// 未捕获的异常处理
process.on('uncaughtException', (error) => {
  logger.error('❌ 未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ 未处理的Promise拒绝:', reason);
  process.exit(1);
});

// 启动
startServer();

