const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * 仓位管理器
 * 
 * 功能：
 * 1. 本地JSON持久化（重启不丢失）
 * 2. 与OKX对账（启动时检查一致性）
 * 3. 交易历史记录
 * 4. 风控检查（回撤止损等）
 */
class PositionManager {
  constructor(strategyName, dataDir = './data') {
    this.strategyName = strategyName;
    this.dataDir = dataDir;
    this.positionsFile = path.join(dataDir, `${strategyName}-positions.json`);
    this.tradesFile = path.join(dataDir, `${strategyName}-trades.json`);
    
    // 确保数据目录存在
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // 初始化数据
    this.positions = this.loadPositions();
    this.trades = this.loadTrades();
    this.accountHighWaterMark = 0;
  }

  /**
   * 加载持仓数据
   */
  loadPositions() {
    try {
      if (fs.existsSync(this.positionsFile)) {
        const data = fs.readFileSync(this.positionsFile, 'utf8');
        const positions = JSON.parse(data);
        logger.info(`📂 加载 ${this.strategyName} 持仓数据: ${Object.keys(positions).length} 个`);
        return positions;
      }
    } catch (error) {
      logger.error(`加载持仓数据失败: ${error.message}`);
    }
    return {};
  }

  /**
   * 保存持仓数据
   */
  savePositions() {
    try {
      fs.writeFileSync(
        this.positionsFile, 
        JSON.stringify(this.positions, null, 2)
      );
    } catch (error) {
      logger.error(`保存持仓数据失败: ${error.message}`);
    }
  }

  /**
   * 加载交易历史
   */
  loadTrades() {
    try {
      if (fs.existsSync(this.tradesFile)) {
        const data = fs.readFileSync(this.tradesFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error(`加载交易历史失败: ${error.message}`);
    }
    return [];
  }

  /**
   * 保存交易历史
   */
  saveTrades() {
    try {
      fs.writeFileSync(
        this.tradesFile, 
        JSON.stringify(this.trades, null, 2)
      );
    } catch (error) {
      logger.error(`保存交易历史失败: ${error.message}`);
    }
  }

  /**
   * 与OKX对账（启动时调用）
   * 
   * 逻辑：
   * 1. 获取OKX真实持仓
   * 2. 对比本地记录
   * 3. 同步差异（记录警告）
   * 
   * @param {OKXClient} okxClient - OKX API客户端
   */
  async reconcileWithOKX(okxClient) {
    logger.info(`🔄 ${this.strategyName} 开始与OKX对账...`);
    
    try {
      // 1. 获取OKX真实持仓
      const realPositions = await okxClient.getPositions();
      const realPosMap = new Map(realPositions.map(p => [p.instId, p]));

      // 2. 检查本地记录
      for (const [symbol, localPos] of Object.entries(this.positions)) {
        if (localPos.status !== 'active') continue;

        const realPos = realPosMap.get(symbol);
        
        if (!realPos || parseFloat(realPos.pos) === 0) {
          logger.warn(`⚠️ ${symbol}: 本地有持仓，但OKX无持仓，可能已被手动平仓`);
          localPos.status = 'closed';
          localPos.closeReason = 'manual_close_detected';
          localPos.closeTime = new Date().toISOString();
        } else {
          const localQty = localPos.quantity;
          const realQty = Math.abs(parseFloat(realPos.pos));
          
          if (Math.abs(localQty - realQty) > 0.01) {
            logger.warn(`⚠️ ${symbol}: 数量不一致 - 本地=${localQty}, OKX=${realQty}, 已同步`);
            localPos.quantity = realQty;
            
            // 重新计算平均成本（如果OKX提供）
            if (realPos.avgPx) {
              localPos.entryPrice = parseFloat(realPos.avgPx);
            }
          }
        }
      }

      // 3. 检查OKX有但本地无的持仓（可能是手动开仓）
      for (const realPos of realPositions) {
        if (parseFloat(realPos.pos) === 0) continue;
        
        if (!this.positions[realPos.instId] || this.positions[realPos.instId].status !== 'active') {
          logger.warn(`⚠️ ${realPos.instId}: OKX有持仓但本地无记录，可能是手动开仓`);
          
          // 可选：导入到本地管理
          // this.positions[realPos.instId] = {
          //   status: 'active',
          //   side: realPos.posSide,
          //   entryPrice: parseFloat(realPos.avgPx),
          //   quantity: Math.abs(parseFloat(realPos.pos)),
          //   margin: parseFloat(realPos.imr),
          //   openTime: new Date().toISOString(),
          //   source: 'manual'
          // };
        }
      }

      this.savePositions();
      logger.info(`✅ ${this.strategyName} 对账完成`);

    } catch (error) {
      logger.error(`对账失败: ${error.message}`);
    }
  }

  /**
   * 获取当前活跃持仓数量
   */
  getActivePositionsCount() {
    return Object.keys(this.positions).filter(
      symbol => this.positions[symbol].status === 'active'
    ).length;
  }

  /**
   * 获取所有活跃持仓
   */
  getActivePositions() {
    return Object.entries(this.positions)
      .filter(([_, pos]) => pos.status === 'active')
      .map(([symbol, pos]) => ({ symbol, ...pos }));
  }

  /**
   * 检查是否可以开仓（基础检查，策略可覆盖）
   */
  canOpenPosition(symbol, maxPositions) {
    const activeCount = this.getActivePositionsCount();

    if (activeCount >= maxPositions) {
      logger.warn(`❌ 拒绝开仓 ${symbol}: 已有 ${activeCount} 个活跃仓位（上限 ${maxPositions}）`);
      return false;
    }

    if (this.positions[symbol] && this.positions[symbol].status === 'active') {
      logger.warn(`❌ 拒绝开仓 ${symbol}: 已存在活跃仓位`);
      return false;
    }

    return true;
  }

  /**
   * 记录开仓
   */
  recordOpenPosition(symbol, data) {
    const {
      side,
      entryPrice,
      quantity,
      margin,
      timestamp
    } = data;

    this.positions[symbol] = {
      status: 'active',
      side,
      entryPrice,
      quantity,
      margin,
      totalCost: quantity * entryPrice,
      openTime: timestamp || new Date().toISOString(),
      addCount: 1,
      trades: [{
        action: 'open',
        price: entryPrice,
        quantity,
        margin,
        timestamp: timestamp || new Date().toISOString()
      }]
    };

    this.savePositions();
    logger.info(`✅ 记录开仓: ${symbol} ${side} ${quantity} @ ${entryPrice}`);
  }

  /**
   * 移除持仓记录（用于回滚）
   */
  removePosition(symbol) {
    if (this.positions[symbol]) {
      delete this.positions[symbol];
      this.savePositions();
      logger.warn(`🔄 回滚持仓: ${symbol}`);
      return true;
    }
    return false;
  }

  /**
   * 记录加仓
   */
  recordAddPosition(symbol, data) {
    if (!this.positions[symbol] || this.positions[symbol].status !== 'active') {
      logger.error(`❌ 加仓失败: ${symbol} 没有活跃仓位`);
      return false;
    }

    const { entryPrice, quantity, margin, timestamp } = data;
    const pos = this.positions[symbol];

    // 更新平均成本
    const newTotalCost = pos.totalCost + (quantity * entryPrice);
    const newTotalQuantity = pos.quantity + quantity;
    pos.entryPrice = newTotalCost / newTotalQuantity;
    pos.quantity = newTotalQuantity;
    pos.margin += margin;
    pos.totalCost = newTotalCost;
    pos.addCount += 1;

    pos.trades.push({
      action: 'add',
      price: entryPrice,
      quantity,
      margin,
      timestamp: timestamp || new Date().toISOString()
    });

    this.savePositions();
    logger.info(`✅ 记录加仓 #${pos.addCount}: ${symbol} ${quantity} @ ${entryPrice}, 新平均价=${pos.entryPrice.toFixed(4)}`);
    return true;
  }

  /**
   * 记录平仓
   */
  recordClosePosition(symbol, data) {
    if (!this.positions[symbol] || this.positions[symbol].status !== 'active') {
      logger.error(`❌ 平仓失败: ${symbol} 没有活跃仓位`);
      return false;
    }

    const { exitPrice, pnl, timestamp, reason } = data;
    const pos = this.positions[symbol];

    pos.status = 'closed';
    pos.exitPrice = exitPrice;
    pos.closeTime = timestamp || new Date().toISOString();
    pos.pnl = pnl;
    pos.closeReason = reason || 'manual';

    // 添加到交易历史
    this.trades.push({
      symbol,
      ...pos,
      closedAt: pos.closeTime
    });

    this.savePositions();
    this.saveTrades();

    const pnlSymbol = pnl >= 0 ? '📈' : '📉';
    logger.info(`${pnlSymbol} 平仓: ${symbol} PNL=${pnl.toFixed(2)} USDT, 原因=${reason}`);
    return true;
  }

  /**
   * 获取持仓信息
   */
  getPosition(symbol) {
    return this.positions[symbol] || null;
  }

  /**
   * 检查账户回撤
   */
  checkAccountDrawdown(currentEquity, thresholdPct) {
    if (currentEquity > this.accountHighWaterMark) {
      this.accountHighWaterMark = currentEquity;
    }

    const drawdown = (this.accountHighWaterMark - currentEquity) / this.accountHighWaterMark * 100;

    if (drawdown >= thresholdPct) {
      logger.error(`🚨 账户回撤 ${drawdown.toFixed(2)}% 超过阈值 ${thresholdPct}%`);
      return true;
    }

    return false;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const active = this.getActivePositions();
    const totalPnL = this.trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winTrades = this.trades.filter(t => (t.pnl || 0) > 0).length;
    const winRate = this.trades.length > 0 ? (winTrades / this.trades.length * 100) : 0;

    return {
      strategyName: this.strategyName,
      activePositions: active.length,
      totalTrades: this.trades.length,
      totalPnL: totalPnL.toFixed(2),
      winRate: winRate.toFixed(2) + '%',
      accountHighWaterMark: this.accountHighWaterMark.toFixed(2)
    };
  }
}

module.exports = PositionManager;
