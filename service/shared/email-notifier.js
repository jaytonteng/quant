const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * 邮件通知服务
 * 用于发送交易通知、系统警报等
 */
class EmailNotifier {
  constructor() {
    this.transporter = null;
    this.enabled = 
      process.env.NODE_ENV === 'production' && 
      process.env.GMAIL_ACCOUNT && 
      process.env.GMAIL_PASSWORD;
    
    if (this.enabled) {
      this.initializeTransporter();
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.info('📧 邮件通知服务未启用（非生产环境）');
      } else {
        logger.info('📧 邮件通知服务未启用（缺少邮件配置）');
      }
    }
  }

  /**
   * 初始化邮件传输器
   */
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.GMAIL_ACCOUNT,
          pass: process.env.GMAIL_PASSWORD,
        }
      });
      logger.info('📧 邮件通知服务已启动');
    } catch (error) {
      logger.error(`邮件服务初始化失败: ${error.message}`);
      this.enabled = false;
    }
  }

  /**
   * 发送交易通知邮件
   * @param {Object} tradeInfo - 交易信息
   */
  async sendTradeNotification(tradeInfo) {
    if (!this.enabled) {
      logger.debug('邮件通知已禁用，跳过发送');
      return;
    }

    try {
      const subject = this.formatSubject(tradeInfo);
      const text = this.formatTradeEmail(tradeInfo);
      
      await this.sendEmail(text, subject);
      logger.info(`✅ 交易通知邮件已发送: ${tradeInfo.symbol} ${tradeInfo.action}`);
    } catch (error) {
      logger.error(`发送交易通知失败: ${error.message}`);
    }
  }

  /**
   * 格式化邮件主题
   */
  formatSubject(tradeInfo) {
    const statusIcon = tradeInfo.success ? '✅' : '❌';
    const action = tradeInfo.action === 'open' ? '开仓' : 
                   tradeInfo.action === 'add' ? '加仓' : '平仓';
    
    return `${statusIcon} ${action} ${tradeInfo.symbol} - ${tradeInfo.strategy || 'Quant Trading'}`;
  }

  /**
   * 格式化交易通知邮件内容
   */
  formatTradeEmail(tradeInfo) {
    const {
      strategy,
      symbol,
      action,
      side,
      quantity,
      price,
      amount,
      success,
      orderId,
      errorMessage,
      signal,
      marketRegime,
      timestamp,
      positionInfo,
      pineScriptParams
    } = tradeInfo;

    let content = `
═══════════════════════════════════════
📊 交易执行报告
═══════════════════════════════════════

【基本信息】
策略名称: ${strategy || '未知策略'}
币种: ${symbol}
操作类型: ${action === 'open' ? '开仓' : action === 'add' ? '加仓' : '平仓'}
方向: ${side === 'long' ? '做多' : '做空'}
执行时间: ${timestamp || new Date().toISOString()}

【交易详情】
数量: ${quantity || 'N/A'}
价格: ${price ? `$${price.toFixed(2)}` : 'N/A'}
金额: ${amount ? `$${amount.toFixed(2)}` : 'N/A'}
`;

    // 成功/失败状态
    if (success) {
      content += `
【执行结果】✅ 成功
订单ID: ${orderId || 'N/A'}
`;
    } else {
      content += `
【执行结果】❌ 失败
失败原因: ${errorMessage || '未知错误'}
`;
    }

    // 信号详情
    if (signal) {
      content += `
【信号详情】
原始信号: ${JSON.stringify(signal, null, 2)}
`;
    }

    // Pine Script策略参数
    if (pineScriptParams) {
      content += `
【Pine Script策略参数】
止盈目标: ${pineScriptParams.takeProfitPct}%
移动止盈: ${pineScriptParams.trailingPct}%
OKX固定止盈: ${pineScriptParams.fixedTakeProfitPct}%
`;
    }

    // 市场状态
    if (marketRegime) {
      content += `
【市场状态】
风险等级: Level ${marketRegime.level} (${marketRegime.reason || '正常'})
BTC波动率: ${marketRegime.btcATR || 'N/A'}%
BTC价格变化: ${marketRegime.btcPriceChange || 'N/A'}%
BTC MA偏离: ${marketRegime.btcDeviation || 'N/A'}%
山寨币联动: ${marketRegime.altcoinDropPct || 0}% 下跌, ${marketRegime.altcoinRisePct || 0}% 上涨
`;
    }

    // 持仓信息
    if (positionInfo) {
      content += `
【当前持仓】
活跃持仓数: ${positionInfo.activePositions || 0}
总持仓价值: $${positionInfo.totalValue ? positionInfo.totalValue.toFixed(2) : '0.00'}
总盈亏: $${positionInfo.totalPnL ? positionInfo.totalPnL.toFixed(2) : '0.00'}
`;

      if (positionInfo.positions && positionInfo.positions.length > 0) {
        content += `
【持仓明细】
`;
        positionInfo.positions.forEach((pos, idx) => {
          content += `
${idx + 1}. ${pos.symbol}
   方向: ${pos.side === 'long' ? '做多' : '做空'}
   数量: ${pos.quantity}
   成本: $${pos.entryPrice?.toFixed(2) || '0.00'}
   当前价: $${pos.currentPrice?.toFixed(2) || '0.00'}
   盈亏: $${pos.pnl ? pos.pnl.toFixed(2) : '0.00'} (${pos.pnlPercent ? pos.pnlPercent.toFixed(2) : '0.00'}%)
`;
        });
      }
    }

    content += `
═══════════════════════════════════════
🤖 Automated by Quant Trading System
═══════════════════════════════════════
`;

    return content;
  }

  /**
   * 发送系统警报邮件
   * @param {string} alertType - 警报类型
   * @param {string} message - 警报消息
   * @param {Object} details - 详细信息
   */
  async sendAlert(alertType, message, details = {}) {
    if (!this.enabled) {
      return;
    }

    try {
      const subject = `🚨 ${alertType} - Quant Trading Alert`;
      const text = `
═══════════════════════════════════════
🚨 系统警报
═══════════════════════════════════════

【警报类型】
${alertType}

【警报消息】
${message}

【详细信息】
${JSON.stringify(details, null, 2)}

【发生时间】
${new Date().toISOString()}

═══════════════════════════════════════
🤖 Automated by Quant Trading System
═══════════════════════════════════════
`;
      
      await this.sendEmail(text, subject);
      logger.info(`✅ 警报邮件已发送: ${alertType}`);
    } catch (error) {
      logger.error(`发送警报邮件失败: ${error.message}`);
    }
  }

  /**
   * 发送日报邮件
   * @param {Object} dailyReport - 日报数据
   */
  async sendDailyReport(dailyReport) {
    if (!this.enabled) {
      return;
    }

    try {
      const subject = `📈 日报 ${dailyReport.date} - Quant Trading`;
      const text = `
═══════════════════════════════════════
📈 交易日报
═══════════════════════════════════════

【日期】${dailyReport.date}

【交易统计】
总交易次数: ${dailyReport.totalTrades || 0}
成功次数: ${dailyReport.successTrades || 0}
失败次数: ${dailyReport.failedTrades || 0}
成功率: ${dailyReport.successRate || '0.00'}%

【盈亏统计】
总盈亏: $${dailyReport.totalPnL ? dailyReport.totalPnL.toFixed(2) : '0.00'}
最大单笔盈利: $${dailyReport.maxProfit ? dailyReport.maxProfit.toFixed(2) : '0.00'}
最大单笔亏损: $${dailyReport.maxLoss ? dailyReport.maxLoss.toFixed(2) : '0.00'}

【账户信息】
账户余额: $${dailyReport.accountBalance ? dailyReport.accountBalance.toFixed(2) : '0.00'}
当前持仓数: ${dailyReport.activePositions || 0}
账户回撤: ${dailyReport.drawdown || '0.00'}%

【市场状态】
触发Level 1: ${dailyReport.level1Count || 0} 次
触发Level 2: ${dailyReport.level2Count || 0} 次

═══════════════════════════════════════
🤖 Automated by Quant Trading System
═══════════════════════════════════════
`;
      
      await this.sendEmail(text, subject);
      logger.info(`✅ 日报邮件已发送: ${dailyReport.date}`);
    } catch (error) {
      logger.error(`发送日报邮件失败: ${error.message}`);
    }
  }

  /**
   * 基础邮件发送方法
   * @param {string} text - 邮件正文
   * @param {string} subject - 邮件主题
   */
  async sendEmail(text, subject) {
    if (!this.enabled || !this.transporter) {
      return;
    }

    const mailOptions = {
      from: process.env.EMAIL_SENDER || process.env.GMAIL_ACCOUNT,
      to: process.env.EMAIL_RECEIVER || process.env.GMAIL_ACCOUNT,
      subject: subject || 'Quant Trading Notification',
      text,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      logger.error(`邮件发送失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 测试邮件服务
   */
  async testEmail() {
    const testMessage = `
这是一封测试邮件，用于验证邮件服务配置是否正确。

发送时间: ${new Date().toISOString()}
服务状态: ${this.enabled ? '已启用' : '未启用'}

如果您收到这封邮件，说明邮件服务配置成功！
`;
    
    await this.sendEmail(testMessage, '📧 邮件服务测试 - Quant Trading');
    logger.info('✅ 测试邮件已发送');
  }
}

// 创建单例
const emailNotifier = new EmailNotifier();

module.exports = emailNotifier;

