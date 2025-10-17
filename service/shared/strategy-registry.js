/**
 * 策略注册系统
 * 统一管理所有策略的注册和路由
 */

const logger = require('./logger');

class StrategyRegistry {
  constructor() {
    this.strategies = new Map();
    this.tokenToStrategy = new Map();
  }

  /**
   * 注册策略
   * @param {string} name - 策略名称
   * @param {Object} strategy - 策略实例
   * @param {string} signalToken - 信号Token
   */
  register(name, strategy, signalToken) {
    this.strategies.set(name, strategy);
    this.tokenToStrategy.set(signalToken, name);
    
    logger.info(`📝 策略已注册: ${name} (${signalToken})`);
  }

  /**
   * 根据signalToken获取策略
   * @param {string} signalToken 
   * @returns {Object|null}
   */
  getStrategyByToken(signalToken) {
    const strategyName = this.tokenToStrategy.get(signalToken);
    return strategyName ? this.strategies.get(strategyName) : null;
  }

  /**
   * 获取策略名称
   * @param {string} signalToken
   * @returns {string|null}
   */
  getStrategyName(signalToken) {
    return this.tokenToStrategy.get(signalToken) || null;
  }

  /**
   * 获取所有策略
   * @returns {Map}
   */
  getAllStrategies() {
    return this.strategies;
  }

  /**
   * 获取所有可用的signalToken
   * @returns {Object}
   */
  getAvailableTokens() {
    const testTokens = [
      'test_connection_token',
      'test_concurrent_token', 
      'test_positions_token',
      'test_stress_token'
    ];

    const strategyTokens = Array.from(this.tokenToStrategy.keys());

    return {
      test: testTokens,
      strategies: strategyTokens
    };
  }

  /**
   * 获取策略状态
   * @returns {Array}
   */
  async getStrategiesStatus() {
    const status = [];
    for (const [name, strategy] of this.strategies) {
      if (strategy.getStatus) {
        status.push({
          name,
          ...(await strategy.getStatus())
        });
      }
    }
    return status;
  }
}

module.exports = StrategyRegistry;
