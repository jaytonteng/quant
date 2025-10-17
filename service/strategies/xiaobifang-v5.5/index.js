const logger = require('../../shared/logger');
const OKXClient = require('../../shared/okx-api');
const MarketFilter = require('../../shared/market-filter');
const emailNotifier = require('../../shared/email-notifier');
const OrderQueue = require('../../shared/order-queue');
const config = require('./config');

/**
 * 小币种防爆 v5.5 策略
 * 
 * 特点：
 * 1. 涨幅异动做空 + DCA加仓
 * 2. 市场联动过滤（极端波动时限制开仓）
 * 3. 全局仓位控制（最多3个币种）
 * 4. 单币保证金占比限制
 */
class XiaoBiFangStrategy {
  constructor() {
    this.config = config;
    this.okx = new OKXClient();
    this.marketFilter = new MarketFilter(this.okx);
    this.orderQueue = new OrderQueue(); // 订单队列，串行处理订单
    
    logger.info(`🚀 初始化策略: ${config.name} v${config.version}`);
  }

  /**
   * 启动策略
   */
  async start() {
    try {
      // 1. 从OKX获取最新持仓并存储到session
      logger.info('📊 策略启动完成');
      
      // 2. 定期检查市场状态（每5分钟）
      setInterval(async () => {
        await this.checkMarketRegime();
      }, 5 * 60 * 1000);
      
      logger.info(`✅ ${config.name} 启动成功`);
      
    } catch (error) {
      logger.error(`策略启动失败: ${error.message}`);
      throw error;
    }
  }


  /**
   * 检查市场状态
   */
  async checkMarketRegime() {
    try {
      const regime = await this.marketFilter.detectMarketRegime();
      
      if (regime.level > 0) {
        logger.warn(`⚠️ 市场状态变化: Level ${regime.level} - ${regime.reason}`);
      }
      
      return regime;
    } catch (error) {
      logger.error(`检查市场状态失败: ${error.message}`);
      return { level: 1, reason: '检测失败，保守处理' };
    }
  }

  /**
   * 处理TradingView Webhook信号
   */
  async handleWebhook(signal) {
    try {
      // 1. 验证signalToken
      if (signal.signalToken !== this.config.signalToken) {
        logger.warn(`❌ Token不匹配`);
        return { status: 'error', message: 'Invalid signal token' };
      }

      const { action, instrument, amount, marketPosition } = signal;
      const symbol = this.convertSymbol(instrument);
      const qty = parseFloat(amount);
      
      const actionText = action === 'sell' ? '📉开仓/加仓' : action === 'buy' ? '📈平仓' : action;
      logger.info(`${actionText} ${symbol} ${amount ? amount : ''}`);

      // sell = 开仓/加仓, buy = 平仓
      if (action === 'sell') {
        const side = marketPosition === 'short' ? 'short' : 'long';
        await this.handleTrade(symbol, side, qty);
      } else if (action === 'buy') {
        await this.handleClose(symbol);
      } else {
        logger.warn(`⚠️ 未知信号: ${action}`);
      }

      return { status: 'success', symbol, action };

    } catch (error) {
      logger.error(`❌ ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 处理交易（开仓/加仓统一处理）
   */
  async handleTrade(symbol, side, amount) {
    // 使用订单队列串行处理，避免API请求过多
    return await this.orderQueue.enqueue(async () => {
      try {
        // 1. 实时查询OKX持仓状态
        const positions = await this.okx.getPositions(symbol);
        const hasPosition = positions && positions.length > 0 && parseFloat(positions[0].pos) !== 0;

        // 2. 如果是开仓，检查并发限制（实时查询OKX持仓数量）
        if (!hasPosition) {
          // 实时查询OKX所有持仓，计算当前实际持仓数量
          const allPositions = await this.okx.getPositions();
          const actualPositionCount = allPositions.filter(pos => parseFloat(pos.pos) !== 0).length;
          
          if (actualPositionCount >= this.config.position.maxConcurrentPositions) {
            logger.warn(`❌ ${symbol} 达到并发限制 (${actualPositionCount}/${this.config.position.maxConcurrentPositions})`);
            return;
          }
          logger.info(`🚀 ${symbol} 开仓 ${amount} [当前${actualPositionCount}个]`);
        } else {
          logger.info(`➕ ${symbol} 加仓 ${amount}`);
        }

      // 4. 获取当前价格
      const candles = await this.okx.getCandles(symbol, '1m', 1);
      const currentPrice = parseFloat(candles[0][4]);
      
      const margin = amount * currentPrice;
      const posSide = side === 'long' ? 'long' : 'short';
      const orderSide = side === 'long' ? 'buy' : 'sell';

      // 5. 设置杠杆（只在无持仓时设置）
      if (!hasPosition) {
        try {
          await this.okx.setLeverage(symbol, this.config.position.leverage, 'isolated', posSide);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (leverageError) {
          logger.error(`❌ 杠杆设置失败: ${leverageError.message}`);
          throw new Error(`杠杆设置失败: ${leverageError.message}`);
        }
      }

      // 6. 下单（不设置止盈止损，由Pine Script控制）
      const order = await this.okx.placeOrder({
        instId: symbol,
        side: orderSide,
        posSide,
        ordType: 'market',
        sz: amount,
        tdMode: this.config.position.tdMode
      });

      logger.info(`✅ ${hasPosition ? '加仓' : '开仓'}成功 ${symbol} ${amount} @${currentPrice}`);

      // 发送邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: this.config.name,
        symbol: symbol,
        action: hasPosition ? 'add' : 'open',
        side: side,
        quantity: amount,
        price: currentPrice,
        amount: margin,
        success: true,
        timestamp: new Date().toISOString()
      });
      

    } catch (error) {
        logger.error(`${symbol} 交易失败: ${error.message}`);
        throw error;
      }
    }, { symbol, side, amount });
  }

  /**
   * 计算止盈止损价格
   */
  calculateStopLossTakeProfit(entryPrice, side, takeProfitPct, stopLossPct) {
    let slTriggerPx, tpTriggerPx;
    
    if (side === 'long') {
      // 多头：止盈价格向上，止损价格向下
      tpTriggerPx = entryPrice * (1 + takeProfitPct / 100);
      slTriggerPx = entryPrice * (1 - stopLossPct / 100);
    } else {
      // 空头：止盈价格向下，止损价格向上
      tpTriggerPx = entryPrice * (1 - takeProfitPct / 100);
      slTriggerPx = entryPrice * (1 + stopLossPct / 100);
    }
    
    logger.info(`📊 止盈止损计算: ${side} @ ${entryPrice}`, {
      takeProfit: tpTriggerPx.toFixed(4),
      stopLoss: slTriggerPx.toFixed(4),
      takeProfitPct,
      stopLossPct
    });
    
    return { slTriggerPx, tpTriggerPx };
  }

  /**
   * 处理开仓
   * 
   * 注意：Pine Script 中的"虚拟开仓"（qty=0）已经在 TV 端处理
   * 服务器收到的 amount 如果是 0，只记录虚拟持仓，不下真实单
   * 如果 amount > 0，说明是真实开仓，需要下单
   */
  async handleOpen(symbol, side, amount) {
    try {
      // 1. 检查并发限制
      const limitCheck = await this.concurrentLimiter.checkCanOpen(symbol, side, amount, {
        maxPositions: this.config.position.maxConcurrentPositions,
        accountDrawdownStopPct: this.config.risk.accountDrawdownStopPct,
        marketFilter: this.config.marketFilter
      });

      if (!limitCheck.canOpen) {
        logger.warn(`❌ ${symbol} 不允许开仓: ${limitCheck.reason}`);
        return;
      }

      // 2. 获取当前价格
      const candles = await this.okx.getCandles(symbol, '1m', 1);
      const currentPrice = parseFloat(candles[0][4]);

      const margin = amount * currentPrice;
      const posSide = side === 'long' ? 'long' : 'short';
      const orderSide = side === 'long' ? 'buy' : 'sell';

      // 设置杠杆
      try {
        await this.okx.setLeverage(symbol, this.config.position.leverage, 'isolated', posSide);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (leverageError) {
        logger.error(`❌ 杠杆设置失败: ${leverageError.message}`);
        throw new Error(`杠杆设置失败: ${leverageError.message}`);
      }

      // 计算止盈止损价格
      const { slTriggerPx, tpTriggerPx } = this.calculateStopLossTakeProfit(
        currentPrice,
        side,
        this.config.trading.fixedTakeProfitPct,
        this.config.risk.stopLossPct
      );

      const order = await this.okx.placeOrder({
        instId: symbol,
        side: orderSide,
        posSide,
        ordType: 'market',
        sz: amount,
        tdMode: this.config.position.tdMode,
        leverage: this.config.position.leverage,
        slTriggerPx,
        tpTriggerPx
      });

      logger.info(`✅ 开仓成功: ${symbol} 下单=${amount}ETH 价格=${currentPrice}USDT 方向=${side}`);
      
      // 发送邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: this.config.name,
        symbol: symbol,
        action: 'open',
        side: side,
        quantity: amount,
        price: currentPrice,
        amount: margin,
        success: true,
        orderId: order.ordId,
        signal: { action: 'open', amount, side },
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

    } catch (error) {
      logger.error(`开仓失败 ${symbol}: ${error.message}`);
      
      // 发送失败邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: this.config.name,
        symbol: symbol,
        action: 'open',
        side: side,
        quantity: amount,
        price: 0,
        amount: 0,
        success: false,
        errorMessage: error.message,
        signal: { action: 'open', amount, side },
        marketRegime: marketRegime,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 处理加仓
   */
  async handleAdd(symbol, side, amount) {
    try {
      // 1. 获取当前价格
      const candles = await this.okx.getCandles(symbol, '1m', 1);
      const currentPrice = parseFloat(candles[0][4]);

      // 2. 计算保证金
      const margin = amount * currentPrice;

      // 3. 检查单币保证金占比
      const balance = await this.okx.getAccountBalance();
      const equity = parseFloat(balance.totalEq);
      
      const position = this.positionManager.getPosition(symbol);
      const totalMargin = (position?.margin || 0) + margin;
      const marginPct = (totalMargin / equity) * 100;

      if (marginPct > this.config.position.singleSymbolMaxMarginPct) {
        logger.warn(`❌ ${symbol} 加仓后保证金占比 ${marginPct.toFixed(2)}% 超过上限 ${this.config.position.singleSymbolMaxMarginPct}%`);
        return;
      }

      // 4. 设置杠杆
      const posSide = side === 'long' ? 'long' : 'short';
      const orderSide = side === 'long' ? 'buy' : 'sell';
      
      try {
        await this.okx.setLeverage(symbol, this.config.position.leverage, 'isolated', posSide);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (leverageError) {
        logger.error(`❌ 杠杆设置失败: ${leverageError.message}`);
        throw new Error(`杠杆设置失败: ${leverageError.message}`);
      }

      // 计算止盈止损价格
      const { slTriggerPx, tpTriggerPx } = this.calculateStopLossTakeProfit(
        currentPrice,
        side,
        this.config.trading.fixedTakeProfitPct,
        this.config.risk.stopLossPct
      );

      const order = await this.okx.placeOrder({
        instId: symbol,
        side: orderSide,
        posSide,
        ordType: 'market',
        sz: amount,
        tdMode: this.config.position.tdMode,
        leverage: this.config.position.leverage,
        slTriggerPx,
        tpTriggerPx
      });

      // 6. 记录交易
      logger.info(`✅ 加仓成功: ${symbol} 下单=${amount}ETH 价格=${currentPrice}USDT 方向=${side}`);
      
      // 交易记录（简化版，只记录到日志）

      // 发送邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: this.config.name,
        symbol: symbol,
        action: 'add', // 加仓操作
        side: side,
        quantity: amount, // 使用下单数量
        price: currentPrice,
        amount: actualMargin, // 使用实际保证金
        success: true,
        orderId: order.ordId,
        signal: { action: 'add', amount, side },
        marketRegime: marketRegime,
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

    } catch (error) {
      logger.error(`加仓失败 ${symbol}: ${error.message}`);
      
      // 发送失败邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: this.config.name,
        symbol: symbol,
        action: 'add',
        side: side,
        quantity: amount,
        price: currentPrice,
        amount: margin,
        success: false,
        errorMessage: error.message,
        signal: { action: 'add', amount, side },
        marketRegime: marketRegime,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 处理平仓
   */
  async handleClose(symbol) {
    try {
      // 1. 获取当前持仓
      const positions = await this.okx.getPositions(symbol);
      if (!positions || positions.length === 0 || parseFloat(positions[0].pos) === 0) {
        logger.warn(`❌ ${symbol} 无持仓`);
        return;
      }

      const pos = positions[0];

      // 2. 平仓
      await this.okx.closePosition(symbol, pos.posSide);

      // 3. 获取平仓价格
      const candles = await this.okx.getCandles(symbol, '1m', 1);
      const exitPrice = parseFloat(candles[0][4]);

      const quantity = Math.abs(parseFloat(pos.pos));
      logger.info(`✅ 平仓成功 ${symbol} ${quantity} @${exitPrice}`);

      // 发送邮件通知
      await emailNotifier.sendTradeNotification({
        strategy: this.config.name,
        symbol: symbol,
        action: 'close',
        side: pos.posSide,
        quantity: quantity,
        price: exitPrice,
        success: true,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error(`❌ 平仓失败 ${symbol}: ${error.message}`);
    }
  }

  /**
   * 转换币种格式
   * TradingView: SOONUSDT.P -> OKX: SOON-USDT-SWAP
   * TradingView: ETHUSDT.P -> OKX: ETH-USDT-SWAP
   */
  convertSymbol(instrument) {
    // 移除 .P 后缀
    let symbol = instrument.replace('.P', '');
    // 在 USDT 前面插入 -，然后添加 -SWAP
    symbol = symbol.replace(/USDT$/, '-USDT-SWAP');
    return symbol;
  }

  /**
   * 获取策略状态
   */
  getStatus() {
    return {
      config: {
        name: this.config.name,
        version: this.config.version,
        maxPositions: this.config.position.maxConcurrentPositions,
        singleMarginPct: this.config.position.singleSymbolMaxMarginPct
      },
      stats: this.positionManager.getStats(),
      positions: this.positionManager.getActivePositions()
    };
  }
}

module.exports = XiaoBiFangStrategy;

