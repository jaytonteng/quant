const logger = require('./logger');

/**
 * 订单队列管理器
 * 
 * 功能：
 * 1. 串行处理订单，避免并发冲突
 * 2. 失败后自动处理下一个
 * 3. 支持并发限制检查
 */
class OrderQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.activeOrders = new Set(); // 正在执行的订单
  }

  /**
   * 添加订单到队列
   * @param {Function} orderFn - 异步订单执行函数
   * @param {Object} metadata - 订单元数据（用于日志）
   * @returns {Promise} - 订单执行结果
   */
  async enqueue(orderFn, metadata = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: orderFn,
        metadata,
        resolve,
        reject
      });

      logger.debug(`📥 订单入队: ${metadata.symbol || 'unknown'}`, {
        queueLength: this.queue.length,
        ...metadata
      });

      // 如果队列没在处理，立即开始
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * 处理队列（串行执行）
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const order = this.queue.shift();
      const { fn, metadata, resolve, reject } = order;

      this.activeOrders.add(metadata.symbol);

      logger.debug(`🔄 处理订单: ${metadata.symbol || 'unknown'}`, {
        remainingInQueue: this.queue.length,
        ...metadata
      });

      try {
        const result = await fn();
        resolve(result);
        logger.debug(`✅ 订单完成: ${metadata.symbol || 'unknown'}`, metadata);
      } catch (error) {
        reject(error);
        logger.error(`❌ 订单失败: ${metadata.symbol || 'unknown'}`, {
          error: error.message,
          ...metadata
        });
      } finally {
        this.activeOrders.delete(metadata.symbol);
      }
    }

    this.processing = false;
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      activeOrders: Array.from(this.activeOrders)
    };
  }

  /**
   * 清空队列
   */
  clear() {
    this.queue = [];
    logger.warn('🗑️ 订单队列已清空');
  }
}

module.exports = OrderQueue;

