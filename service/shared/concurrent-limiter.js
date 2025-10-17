const logger = require('./logger');
const MarketFilter = require('./market-filter');
const PositionManager = require('./position-manager');
const OKXClient = require('./okx-api');

/**
 * 并发限制器 - 公共的并发限制逻辑
 */
class ConcurrentLimiter {
  constructor(positionManager = null) {
    this.okx = new OKXClient();
    this.marketFilter = new MarketFilter(this.okx);
    // 如果传入了 positionManager，就用传入的；否则创建新的
    this.positionManager = positionManager || new PositionManager('test', './data');
    // 市场状态缓存（5秒过期）
    this.marketRegimeCache = null;
    this.marketRegimeCacheTime = 0;
    this.CACHE_TTL = 5000; // 5秒
  }

  /**
   * 检查是否可以开仓（公共逻辑）
   * @param {string} symbol - 币种
   * @param {string} side - 方向 (short/long)
   * @param {number} amount - 数量
   * @param {object} config - 配置对象
   * @returns {object} - { canOpen: boolean, reason: string, marketRegime: object }
   */
  async checkCanOpen(symbol, side, amount, config = {}) {
    try {
      // 默认配置
      const defaultConfig = {
        maxPositions: 3,
        accountDrawdownStopPct: 20,
        marketFilter: {
          level0: { maxPositions: 3 },
          level1: { maxPositions: 1 },
          level2: { maxPositions: 0 }
        }
      };
      
      const finalConfig = { ...defaultConfig, ...config };

      // 1. 检测市场状态（使用缓存）
      const now = Date.now();
      let marketRegime;
      if (this.marketRegimeCache && (now - this.marketRegimeCacheTime) < this.CACHE_TTL) {
        marketRegime = this.marketRegimeCache;
        logger.debug(`使用缓存的市场状态: Level ${marketRegime.level}`);
      } else {
        marketRegime = await this.marketFilter.detectMarketRegime();
        this.marketRegimeCache = marketRegime;
        this.marketRegimeCacheTime = now;
        logger.debug(`更新市场状态缓存: Level ${marketRegime.level}`);
      }
      
      // 忽略市场状态，使用固定并发限制
      const maxPositions = finalConfig.maxPositions;
      logger.debug(`📊 市场状态: Level ${marketRegime.level} (${marketRegime.reason}) - 仅分析，使用固定并发限制: ${maxPositions}`);

      // 2. 检查并发限制
      if (!this.positionManager.canOpenPosition(symbol, maxPositions)) {
        return {
          canOpen: false,
          reason: `达到最大持仓限制 (${maxPositions}个)`,
          marketRegime
        };
      }

      // 3. 检查账户回撤
      const balance = await this.okx.getAccountBalance();
      const equity = parseFloat(balance.totalEq);
      
      if (this.positionManager.checkAccountDrawdown(equity, finalConfig.accountDrawdownStopPct)) {
        return {
          canOpen: false,
          reason: '账户回撤过大',
          marketRegime
        };
      }

      return {
        canOpen: true,
        reason: '通过所有检查',
        marketRegime
      };

    } catch (error) {
      logger.error(`并发限制检查失败: ${error.message}`);
      return {
        canOpen: false,
        reason: `检查失败: ${error.message}`,
        marketRegime: { level: 1, reason: '检查失败' }
      };
    }
  }

  /**
   * 记录开仓到本地持仓管理
   * @param {string} symbol - 币种
   * @param {string} side - 方向
   * @param {number} amount - 数量
   * @param {number} price - 价格
   */
  recordOpenPosition(symbol, side, amount, price) {
    this.positionManager.recordOpenPosition(symbol, {
      side: side,
      entryPrice: price,
      quantity: amount,
      margin: amount * price, // 简化计算
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ConcurrentLimiter;
