const logger = require('../../shared/logger');
const OKXClient = require('../../shared/okx-api');
const PositionManager = require('../../shared/position-manager');
const MarketFilter = require('../../shared/market-filter');
const ConcurrentLimiter = require('../../shared/concurrent-limiter');
const OrderQueue = require('../../shared/order-queue');
const emailNotifier = require('../../shared/email-notifier');
const config = require('./config');

/**
 * 测试策略
 * 用于测试系统功能：并发限制、开平仓、邮件通知等
 */
class TestStrategy {
  constructor() {
    this.config = config;
    this.okx = new OKXClient();
    this.positionManager = new PositionManager('test', './data');
    this.marketFilter = new MarketFilter(this.okx);
    this.concurrentLimiter = new ConcurrentLimiter(this.positionManager);
    this.orderQueue = new OrderQueue(); // 测试策略使用队列处理并发
    
    logger.info(`🚀 初始化策略: ${config.name} v${config.version}`);
  }

  /**
   * 启动策略
   */
  async start() {
    try {
      // 对账（测试策略允许失败）
      await this.positionManager.reconcileWithOKX(this.okx);
      logger.info(`✅ ${config.name} 启动成功`);
    } catch (error) {
      logger.warn(`⚠️ ${config.name} 对账失败（测试策略可忽略）: ${error.message}`);
      // 测试策略启动失败不影响服务运行
    }
  }

  /**
   * 获取策略状态
   */
  getStatus() {
    return {
      strategyName: 'test',
      activePositions: this.positionManager.getActivePositionsCount(),
      totalTrades: this.positionManager.trades.length,
      accountHighWaterMark: this.positionManager.accountHighWaterMark.toFixed(2)
    };
  }

  /**
   * 处理webhook信号（使用队列串行处理）
   */
  async handleWebhook(signal) {
    const testType = config.tokens[signal.signalToken] || '未知测试';
    
    // 使用队列串行处理，避免并发冲突
    return await this.orderQueue.enqueue(
      async () => {
        try {
          logger.info(`📡 收到${testType}信号`, { signal });

          // 转换币种格式
          const symbol = this.convertSymbol(signal.instrument || signal.symbol);

          // 根据action执行相应操作
          if (signal.action === 'close') {
            return await this.handleClose(symbol, signal, testType);
          } else {
            return await this.handleOpen(symbol, signal, testType);
          }
        } catch (error) {
          logger.error(`处理测试信号失败: ${error.message}`, error);
          throw error;
        }
      },
      {
        symbol: signal.symbol || signal.instrument,
        batchId: signal.batchId,
        symbolIndex: signal.symbolIndex
      }
    );
  }

  /**
   * 转换币种格式
   */
  convertSymbol(instrument) {
    if (!instrument) throw new Error('缺少币种信息');
    return instrument
      .replace('.P', '')
      .replace('USDT', '-USDT-SWAP');
  }

  /**
   * 处理开仓
   */
  async handleOpen(symbol, signal, testType) {
    try {
      // 并发限制检查
      const limitCheck = await this.concurrentLimiter.checkCanOpen(symbol, 'sell', 1, {
        maxPositions: this.config.position.maxConcurrentPositions,
        accountDrawdownStopPct: this.config.risk.accountDrawdownStopPct,
        marketFilter: this.config.marketFilter
      });

      if (!limitCheck.canOpen) {
        logger.warn(`❌ ${testType} - 并发限制: ${symbol} ${limitCheck.reason}`);
        return { 
          status: 'rejected', 
          message: `并发限制: ${limitCheck.reason}`,
          symbol: symbol,
          marketRegime: limitCheck.marketRegime
        };
      }

      // 获取当前价格
      const candles = await this.okx.getCandles(symbol, '1m', 1);
      const currentPrice = parseFloat(candles[0][4]);

      // 记录持仓（开仓前记录，防止并发冲突）
      this.concurrentLimiter.recordOpenPosition(symbol, 'sell', 1, currentPrice);

      // 下单
      const order = await this.okx.placeOrder({
        instId: symbol,
        tdMode: this.config.position.tdMode,
        side: 'sell',
        ordType: 'market',
        sz: '1',
        posSide: 'short'
      });

      logger.info(`✅ ${testType} - 开仓成功: ${symbol} ${order.ordId}`);

      // 发送邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: testType,
        symbol: symbol,
        action: 'open',
        side: 'short',
        quantity: 1,
        price: currentPrice,
        amount: currentPrice * 1,
        success: true,
        orderId: order.ordId,
        signal: signal,
        marketRegime: limitCheck.marketRegime,
        timestamp: new Date().toISOString(),
        positionInfo: {
          activePositions: this.positionManager.getActivePositionsCount(),
          positions: Object.entries(this.positionManager.positions)
            .filter(([_, pos]) => pos.status === 'active')
            .map(([sym, pos]) => ({
              symbol: sym,
              side: pos.side,
              quantity: pos.quantity,
              entryPrice: pos.entryPrice,
              currentPrice: currentPrice
            }))
        }
      });

      return { 
        status: 'success', 
        message: `${testType} - 开仓成功`,
        orderId: order.ordId,
        symbol: symbol
      };

    } catch (error) {
      // 下单失败，回滚持仓记录
      this.positionManager.removePosition(symbol);
      logger.error(`❌ ${testType} - 开仓失败: ${error.message}`, { symbol });

      // 发送失败邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: testType,
        symbol: symbol,
        action: 'open',
        side: 'short',
        quantity: 1,
        price: 0,
        amount: 0,
        success: false,
        errorMessage: error.message,
        signal: signal,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * 处理平仓
   */
  async handleClose(symbol, signal, testType) {
    try {
      // 查询当前持仓
      const positions = await this.okx.getPositions(symbol);
      if (!positions || positions.length === 0 || parseFloat(positions[0].pos) === 0) {
        logger.warn(`⚠️ ${testType} - 平仓跳过: ${symbol} 无持仓`);
        return {
          status: 'skipped',
          message: '无持仓，跳过平仓',
          symbol: symbol
        };
      }

      const position = positions[0];
      const posSize = parseFloat(position.pos);
      const posSide = position.posSide;  // 直接使用OKX返回的posSide
      const side = posSide === 'long' ? 'sell' : 'buy';  // long用sell平，short用buy平

      logger.info(`准备平仓: ${symbol}, posSide=${posSide}, side=${side}, size=${Math.abs(posSize)}`);

      // 平仓
      const order = await this.okx.placeOrder({
        instId: symbol,
        tdMode: this.config.position.tdMode,
        side: side,
        ordType: 'market',
        sz: Math.abs(posSize).toString(),
        posSide: posSide,
        reduceOnly: true
      });

      logger.info(`✅ ${testType} - 平仓成功: ${symbol} ${order.ordId}`);

      // 删除本地持仓记录
      this.positionManager.removePosition(symbol);

      // 发送平仓邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: testType,
        symbol: symbol,
        action: 'close',
        side: posSide,
        quantity: Math.abs(posSize),
        price: parseFloat(position.avgPx || 0),
        amount: Math.abs(posSize) * parseFloat(position.avgPx || 0),
        success: true,
        orderId: order.ordId,
        signal: signal,
        timestamp: new Date().toISOString()
      });

      return {
        status: 'success',
        message: `${testType} - 平仓成功`,
        orderId: order.ordId,
        symbol: symbol
      };

    } catch (error) {
      logger.error(`❌ ${testType} - 平仓失败: ${error.message}`, { symbol });

      // 发送失败邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: testType,
        symbol: symbol,
        action: 'close',
        side: 'unknown',
        quantity: 0,
        price: 0,
        amount: 0,
        success: false,
        errorMessage: error.message,
        signal: signal,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }
}

module.exports = TestStrategy;

