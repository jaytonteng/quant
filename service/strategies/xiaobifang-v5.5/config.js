/**
 * 小币种防爆 v5.5 策略配置
 * 
 * 说明：此配置文件定义该策略的所有参数
 * 可通过环境变量覆盖部分配置
 */

module.exports = {
  // 策略基本信息
  name: '小币种防爆v5.5',
  version: '5.5.0',
  description: '涨幅异动做空 + DCA加仓',
  
  // 是否需要TradingView信号
  needsTradingView: true,
  
  // Webhook端口和路径
  webhook: {
    port: parseInt(process.env.XIAOBIFANG_PORT) || 3001,
    path: '/webhook/xiaobifang',
    secret: process.env.XIAOBIFANG_WEBHOOK_SECRET || 'xiaobifang_secret_2025'
  },

  // 信号验证Token（需与Pine Script中一致）
  signalToken: process.env.XIAOBIFANG_SIGNAL_TOKEN || 'xiaobifang_token_2025',

  // === 仓位管理 ===
  position: {
    // 最大同时持仓数（这是该策略的全局限制）
    maxConcurrentPositions: parseInt(process.env.XIAOBIFANG_MAX_POSITIONS) || 3,
    
    // 单币最大保证金占账户比例（%）
    singleSymbolMaxMarginPct: parseFloat(process.env.XIAOBIFANG_SINGLE_MARGIN_PCT) || 20,
    
    // 交易模式：'isolated'(逐仓) or 'cross'(全仓)
    tdMode: process.env.XIAOBIFANG_TD_MODE || 'isolated',
    
    // 杠杆倍数
    leverage: parseInt(process.env.XIAOBIFANG_LEVERAGE) || 10
  },

  // === 市场过滤策略 ===
  marketFilter: {
    // Level 0: 正常开仓
    level0: {
      maxPositions: 3  // 允许3个仓位
    },
    
    // Level 1: 高波动，限制开仓
    level1: {
      maxPositions: 1,           // 只允许1个新仓位
      allowAddPosition: false    // 不允许加仓
    },
    
    // Level 2: 极端波动，禁止开仓
    level2: {
      maxPositions: 0,           // 禁止开仓
      allowAddPosition: false,
      autoClose: false           // 是否自动平仓（false=手动决定）
    }
  },

  // === 服务器交易参数（仅服务器需要的参数） ===
  trading: {
    // OKX订单固定止盈（%）- 设置较大值，让Pine Script的移动止盈生效
    fixedTakeProfitPct: 15.0,
    
    // Pine Script参数参考（仅用于邮件通知显示）
    pineScriptParams: {
      takeProfitPct: 3.0,    // Pine Script止盈目标
      trailingPct: 0.2,      // Pine Script移动止盈
      initialMargin: 40,     // Pine Script初次开仓保证金
      addMult: 2.0,          // Pine Script加仓倍数
      maxAdd: 4              // Pine Script最大加仓次数
    }
  },

  // === 风控参数 ===
  risk: {
    // 账户最大回撤止损（%）
    accountDrawdownStopPct: parseFloat(process.env.XIAOBIFANG_DRAWDOWN_STOP) || 20,
    
    // 止损百分比（%，相对开仓价）
    stopLossPct: 30,
    
    // 单笔最大亏损比例（%，相对开仓价）
    singleTradeMaxLossPct: 30,
    
    // 启用紧急止损（距强平价<5%时强制平仓）
    enableEmergencyStop: true,
    emergencyStopDistance: 5  // %
  },

  // === 监控的币种列表 ===
  // 从文件加载或使用默认列表
  symbols: require('./symbols.json'),

  // === 数据存储路径 ===
  storage: {
    positionsFile: './data/xiaobifang-positions.json',
    tradesFile: './data/xiaobifang-trades.json',
    configFile: './data/xiaobifang-config.json'
  },

  // === 日志配置 ===
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    logFile: './logs/xiaobifang.log'
  }
};

