module.exports = {
  name: '测试策略',
  version: '1.0.0',
  
  // 信号Token映射（5.5单元测试使用xiaobifang_token，所以这里不需要额外token）
  tokens: {},
  
  // 持仓配置
  position: {
    maxConcurrentPositions: 3,  // 最大并发持仓数
    tdMode: 'cross'  // 交易模式：cross(全仓) / isolated(逐仓)
  },
  
  // 风控配置
  risk: {
    accountDrawdownStopPct: 20  // 账户回撤止损百分比
  },
  
  // 市场过滤配置
  marketFilter: {
    level0: { maxPositions: 3 },  // 正常市场
    level1: { maxPositions: 1 },  // 高波动
    level2: { maxPositions: 0 }   // 极端市场
  }
};

