const logger = require('./logger');

/**
 * 市场状态过滤器
 * 
 * 功能：检测市场是否处于极端波动/趋势状态
 * 
 * 判断逻辑（多维度）：
 * 1. 主流币ATR%突增 - 衡量波动率
 * 2. 多币联动性 - 几个主流币同时高波动
 * 3. 价格偏离MA - 衡量趋势强度
 * 4. 成交量异常 - 检测恐慌/FOMO情绪
 * 
 * 返回值：
 * - level 0: 正常（允许正常开仓）
 * - level 1: 高波动（限制开仓，如只允许1个仓位）
 * - level 2: 极端波动（禁止开仓，考虑平仓）
 */
class MarketFilter {
  constructor(okxClient) {
    this.okx = okxClient;
    
    // 配置阈值（基于历史数据分析：最近3个月max=1.77%, p99=1.76%, p95=1.61%, p90=1.0%）
    this.thresholds = {
      // ATR% 阈值
      normalATR: 1.0,      // 正常波动上限（90分位）
      highATR: 1.6,        // 高波动阈值（95分位）
      extremeATR: 1.8,     // 极端波动阈值（>99分位）
      
      // 价格变化率阈值（%，24h涨跌幅）
      // 历史分析：最大24h跌幅=9.18%（2025-10-10关税事件）
      normalPriceChange: 3.0,   // 24h涨跌<3% 正常
      highPriceChange: 5.0,     // 24h涨跌3-5% 高波动
      extremePriceChange: 8.0,  // 24h涨跌>8% 极端（如关税事件）
      
      // MA偏离度阈值（%）
      normalDeviation: 5.0,   // 放宽到5%
      highDeviation: 8.0,     // 放宽到8%（真正的大行情才限制）
      
      // 成交量倍数
      volumeSpike: 2.5
    };
  }

  /**
   * 检测市场状态
   * @returns {Promise<{level: number, reason: string, details: object}>}
   */
  async detectMarketRegime() {
    try {
      // 1. 计算BTC/ETH的24h价格变化
      const btcPriceChange = await this.calculate24hPriceChange('BTC-USDT-SWAP');
      const ethPriceChange = await this.calculate24hPriceChange('ETH-USDT-SWAP');

      // 2. 🔥 关键：检测多币种联动（系统性风险）
      const altcoinLinkage = await this.detectAltcoinLinkage();

      // 3. 计算BTC ATR%（辅助指标）
      const btcATR = await this.okx.calculateATRPercent('BTC-USDT-SWAP', 24);

      // 4. 计算BTC MA偏离
      const btcDeviation = await this.calculateMADeviation('BTC-USDT-SWAP', 200);

      const details = {
        btcPriceChange: btcPriceChange.toFixed(2),
        ethPriceChange: ethPriceChange.toFixed(2),
        btcATR: btcATR.toFixed(2),
        btcDeviation: btcDeviation.toFixed(2),
        altcoinDropPct: altcoinLinkage.dropPct.toFixed(0),
        altcoinRisePct: altcoinLinkage.risePct.toFixed(0),
        droppingCoins: altcoinLinkage.droppingCount,
        risingCoins: altcoinLinkage.risingCount
      };

      // === 判断逻辑 ===

      // Level 2: 极端波动（禁止开仓）
      // 🔥 关键判断：多币种联动暴跌/暴涨
      if (
        altcoinLinkage.dropPct >= 70 ||    // 70%以上小币种暴跌 → 系统性风险
        altcoinLinkage.risePct >= 70 ||    // 70%以上小币种暴涨 → 系统性FOMO
        Math.abs(btcPriceChange) > 8 ||    // BTC 24h涨跌>8%
        Math.abs(ethPriceChange) > 8       // ETH 24h涨跌>8%
      ) {
        const reason = this.buildSystemicReason(altcoinLinkage, btcPriceChange, ethPriceChange, btcDeviation);
        logger.warn(`🚨 市场状态: Level 2 (极端) - ${reason}`, details);
        
        return {
          level: 2,
          reason,
          details,
          recommendation: '禁止开仓，建议减仓或观望'
        };
      }

      // Level 1: 高波动（限制开仓）
      if (
        altcoinLinkage.dropPct >= 50 ||    // 50-70%小币种下跌
        altcoinLinkage.risePct >= 50 ||    // 50-70%小币种上涨
        Math.abs(btcPriceChange) > 5 ||    // BTC 24h涨跌5-8%
        Math.abs(ethPriceChange) > 5 ||    // ETH 24h涨跌5-8%
        btcDeviation > 4                   // BTC偏离MA>4%
      ) {
        const reason = this.buildSystemicReason(altcoinLinkage, btcPriceChange, ethPriceChange, btcDeviation);
        logger.warn(`⚠️ 市场状态: Level 1 (高波动) - ${reason}`, details);
        
        return {
          level: 1,
          reason,
          details,
          recommendation: '限制开仓（如最多1个新仓位）'
        };
      }

      // Level 0: 正常
      logger.info(`✅ 市场状态: Level 0 (正常)`, details);
      return {
        level: 0,
        reason: '市场正常',
        details,
        recommendation: '可正常开仓'
      };

    } catch (error) {
      logger.error(`市场状态检测失败: ${error.message}`);
      // 出错时保守处理，返回高风险
      return {
        level: 1,
        reason: `检测失败: ${error.message}`,
        details: {},
        recommendation: '暂停开仓'
      };
    }
  }

  /**
   * 检测小币种联动性（系统性风险的核心指标）
   * 
   * 逻辑：
   * 1. 检测6-10个代表性小币种的24h涨跌幅
   * 2. 计算有多少比例的币种同时跌>5%或涨>5%
   * 3. 如果>70%联动 → 系统性风险（如关税事件）
   * 
   * @returns {Promise<{dropPct: number, risePct: number, droppingCount: number, risingCount: number}>}
   */
  async detectAltcoinLinkage() {
    // 根据实盘/模拟盘选择不同的币种列表
    const testSymbols = this.okx.simulated ? [
      // 模拟盘币种（较少，用于测试）
      'WIF-USDT-SWAP',
      'PEPE-USDT-SWAP',
      'DOGE-USDT-SWAP',
      'SHIB-USDT-SWAP',
      'FLOKI-USDT-SWAP',
      'BOME-USDT-SWAP',
      'ACT-USDT-SWAP',
      'TURBO-USDT-SWAP'
    ] : [
      // 实盘币种（完整列表，包含之前删除的币种）
      'WIF-USDT-SWAP',
      'PEPE-USDT-SWAP',
      'BONK-USDT-SWAP',  // 恢复
      'DOGE-USDT-SWAP',
      'SHIB-USDT-SWAP',
      'FLOKI-USDT-SWAP',
      'BOME-USDT-SWAP',
      'TRUMP-USDT-SWAP',  // 恢复
      'PNUT-USDT-SWAP',   // 恢复
      'ACT-USDT-SWAP',
      'MOODENG-USDT-SWAP', // 恢复
      'GOAT-USDT-SWAP',   // 恢复
      'PEOPLE-USDT-SWAP', // 恢复
      'TURBO-USDT-SWAP',
      'MEW-USDT-SWAP'     // 恢复
    ];

    const results = [];

    for (const symbol of testSymbols) {
      try {
        const change = await this.calculate24hPriceChange(symbol);
        results.push({ symbol, change });
      } catch (error) {
        logger.error(`检测 ${symbol} 失败: ${error.message}`);
      }
    }

    const droppingCoins = results.filter(r => r.change < -5);
    const risingCoins = results.filter(r => r.change > 5);
    const totalCoins = results.length;

    return {
      dropPct: (droppingCoins.length / totalCoins) * 100,
      risePct: (risingCoins.length / totalCoins) * 100,
      droppingCount: droppingCoins.length,
      risingCount: risingCoins.length,
      totalCount: totalCoins
    };
  }

  /**
   * 计算24h价格变化率（绝对值）
   * 
   * 公式：|当前价 - 24h前价格| / 24h前价格 × 100
   * 
   * 用途：捕捉暴涨暴跌（如关税事件导致的9%单日跌幅）
   * 
   * @param {string} instId - 交易对
   * @returns {Promise<number>} 24h涨跌幅百分比（可为正或负）
   */
  async calculate24hPriceChange(instId) {
    try {
      const candles = await this.okx.getCandles(instId, '1H', 25);
      
      if (!candles || candles.length < 25) {
        return 0;
      }

      const currentPrice = parseFloat(candles[0][4]);
      const price24hAgo = parseFloat(candles[24][4]);

      const change = ((currentPrice - price24hAgo) / price24hAgo) * 100;

      return change; // 返回正负值（正=上涨，负=下跌）
    } catch (error) {
      logger.error(`计算24h价格变化失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 计算价格偏离MA的百分比
   * 
   * 公式：|当前价 - MA| / MA × 100
   * 
   * @param {string} instId - 交易对
   * @param {number} period - MA周期
   * @returns {Promise<number>} 偏离度百分比
   */
  async calculateMADeviation(instId, period = 200) {
    try {
      const candles = await this.okx.getCandles(instId, '1H', period + 1);
      
      if (!candles || candles.length < period) {
        return 0;
      }

      // 计算MA
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += parseFloat(candles[i][4]); // close price
      }
      const ma = sum / period;

      // 当前价
      const currentPrice = parseFloat(candles[0][4]);

      // 偏离度
      const deviation = Math.abs(currentPrice - ma) / ma * 100;

      return deviation;
    } catch (error) {
      logger.error(`计算MA偏离度失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 计算成交量异常倍数
   * 
   * 逻辑：当前1h成交量 / 过去7天1h成交量均值
   * 
   * @param {string} instId - 交易对
   * @returns {Promise<number>} 倍数（1=正常，2=翻倍，3=3倍...）
   */
  async calculateVolumeSpike(instId) {
    try {
      const candles = await this.okx.getCandles(instId, '1H', 7 * 24 + 1);
      
      if (!candles || candles.length < 7 * 24) {
        return 1;
      }

      // 当前1h成交量
      const currentVolume = parseFloat(candles[0][5]);

      // 过去7天均值
      let sum = 0;
      for (let i = 1; i <= 7 * 24; i++) {
        sum += parseFloat(candles[i][5]);
      }
      const avgVolume = sum / (7 * 24);

      // 倍数
      const spike = currentVolume / avgVolume;

      return spike;
    } catch (error) {
      logger.error(`计算成交量异常失败: ${error.message}`);
      return 1;
    }
  }

  /**
   * 构建系统性风险原因描述
   */
  buildSystemicReason(altcoinLinkage, btcPriceChange, ethPriceChange, btcDeviation) {
    const reasons = [];

    // 小币种联动（最重要的指标）
    if (altcoinLinkage.dropPct >= 70) {
      reasons.push(`系统性暴跌(${altcoinLinkage.droppingCount}/${altcoinLinkage.totalCount}币种跌>5%)`);
    } else if (altcoinLinkage.dropPct >= 50) {
      reasons.push(`多币种下跌(${altcoinLinkage.droppingCount}/${altcoinLinkage.totalCount}币种跌>5%)`);
    }

    if (altcoinLinkage.risePct >= 70) {
      reasons.push(`系统性暴涨(${altcoinLinkage.risingCount}/${altcoinLinkage.totalCount}币种涨>5%)`);
    } else if (altcoinLinkage.risePct >= 50) {
      reasons.push(`多币种上涨(${altcoinLinkage.risingCount}/${altcoinLinkage.totalCount}币种涨>5%)`);
    }

    // BTC/ETH价格变化
    if (Math.abs(btcPriceChange) > 8) {
      reasons.push(`BTC 24h${btcPriceChange > 0 ? '涨' : '跌'}${Math.abs(btcPriceChange).toFixed(1)}%`);
    } else if (Math.abs(btcPriceChange) > 5) {
      reasons.push(`BTC 24h${btcPriceChange > 0 ? '涨' : '跌'}${Math.abs(btcPriceChange).toFixed(1)}%`);
    }

    if (Math.abs(ethPriceChange) > 8) {
      reasons.push(`ETH 24h${ethPriceChange > 0 ? '涨' : '跌'}${Math.abs(ethPriceChange).toFixed(1)}%`);
    } else if (Math.abs(ethPriceChange) > 5) {
      reasons.push(`ETH 24h${ethPriceChange > 0 ? '涨' : '跌'}${Math.abs(ethPriceChange).toFixed(1)}%`);
    }

    // BTC MA偏离
    if (btcDeviation > 4) {
      reasons.push(`BTC偏离MA ${btcDeviation.toFixed(1)}%`);
    }

    return reasons.length > 0 ? reasons.join('; ') : '市场正常';
  }

  /**
   * 构建原因描述（旧函数，保留兼容）
   */
  buildReason(level, highVolCoins, deviation, volumeSpike, btcPriceChange, ethPriceChange) {
    const reasons = [];

    // 价格变化（暴涨暴跌）
    if (Math.abs(btcPriceChange) > this.thresholds.extremePriceChange) {
      reasons.push(`BTC 24h${btcPriceChange > 0 ? '涨' : '跌'}${Math.abs(btcPriceChange).toFixed(1)}%`);
    } else if (Math.abs(btcPriceChange) > this.thresholds.highPriceChange) {
      reasons.push(`BTC 24h${btcPriceChange > 0 ? '涨' : '跌'}${Math.abs(btcPriceChange).toFixed(1)}%`);
    }

    if (Math.abs(ethPriceChange) > this.thresholds.extremePriceChange) {
      reasons.push(`ETH 24h${ethPriceChange > 0 ? '涨' : '跌'}${Math.abs(ethPriceChange).toFixed(1)}%`);
    }

    // ATR高波动
    if (highVolCoins.length > 0) {
      const coins = highVolCoins.map(c => `${c.symbol}(${c.atr.toFixed(1)}%)`).join(', ');
      reasons.push(`${coins} 高波动`);
    }

    // MA偏离
    if (deviation > this.thresholds.highDeviation) {
      reasons.push(`BTC偏离MA ${deviation.toFixed(1)}%`);
    }

    // 成交量异常
    if (volumeSpike > this.thresholds.volumeSpike) {
      reasons.push(`成交量${volumeSpike.toFixed(1)}倍`);
    }

    return reasons.length > 0 ? reasons.join('; ') : level;
  }

  /**
   * 更新阈值配置
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('市场过滤器阈值已更新', this.thresholds);
  }
}

module.exports = MarketFilter;

