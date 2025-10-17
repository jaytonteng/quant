const axios = require('axios');
const crypto = require('crypto-js');
const logger = require('./logger');
const config = require('../config');

class OKXClient {
  constructor() {
    this.apiKey = config.okx.apiKey;
    this.secretKey = config.okx.secretKey;
    this.passphrase = config.okx.passphrase;
    this.baseUrl = config.okx.baseUrl;
    this.simulated = config.okx.simulated;
  }

  /**
   * 生成签名
   */
  generateSignature(timestamp, method, path, body = '') {
    const message = timestamp + method + path + body;
    return crypto.HmacSHA256(message, this.secretKey).toString(crypto.enc.Base64);
  }

  /**
   * 发送 API 请求（带重试机制）
   */
  async request(method, endpoint, params = {}, retryCount = 0) {
    const timestamp = new Date().toISOString();
    const queryString = method === 'GET' && Object.keys(params).length > 0 
      ? '?' + new URLSearchParams(params).toString() 
      : '';
    const path = endpoint + queryString;
    const body = method !== 'GET' ? JSON.stringify(params) : '';
    const signature = this.generateSignature(timestamp, method, path, body);

    const headers = {
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
      'Content-Type': 'application/json'
    };

    if (this.simulated) {
      headers['x-simulated-trading'] = '1';
    }

    try {
      const response = await axios({
        method,
        url: this.baseUrl + path,  // path已包含query string
        headers,
        data: method !== 'GET' ? params : undefined,
        timeout: 60000,  // 60秒超时
        // 如果需要代理，可以在这里配置
        // proxy: {
        //   host: 'your-proxy-host',
        //   port: your-proxy-port,
        //   auth: {
        //     username: 'your-username',
        //     password: 'your-password'
        //   }
        // }
      });

      if (response.data.code !== '0') {
        const errorMsg = `OKX API Error [${response.data.code}]: ${response.data.msg}`;
        logger.error(`❌ ${errorMsg}`, { 
          endpoint, 
          method, 
          params,
          responseData: response.data 
        });
        throw new Error(errorMsg);
      }

      return response.data.data;
    } catch (error) {
      // 如果是axios错误，显示更详细的信息
      if (error.response?.data) {
        const okxError = error.response.data;
        const errorMsg = `OKX API Error [${okxError.code}]: ${okxError.msg}`;
        logger.error(`❌ ${errorMsg}`, { 
          endpoint, 
          method, 
          params,
          responseData: okxError 
        });
        throw new Error(errorMsg);
      }
      
      // 网络错误重试机制
      if ((error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') && retryCount < 2) {
        logger.warn(`⚠️ OKX API 网络错误，重试中... (${retryCount + 1}/3)`, { 
          endpoint, 
          method, 
          params,
          error: error.message,
          code: error.code
        });
        
        // 等待2秒后重试
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.request(method, endpoint, params, retryCount + 1);
      }
      
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        logger.error(`❌ OKX API 请求超时`, { 
          endpoint, 
          method, 
          params,
          timeout: '30s',
          retryCount
        });
        throw new Error(`OKX API 请求超时: ${endpoint}`);
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        logger.error(`❌ OKX API 网络连接失败`, { 
          endpoint, 
          method, 
          params,
          error: error.message,
          code: error.code
        });
        throw new Error(`OKX API 网络连接失败: ${error.message}`);
      } else {
        logger.error(`❌ OKX API 请求失败: ${error.message}`, { 
          endpoint, 
          method, 
          params,
          code: error.code
        });
        throw error;
      }
    }
  }

  /**
   * 获取账户余额
   */
  async getAccountBalance() {
    const data = await this.request('GET', '/api/v5/account/balance');
    return data[0];
  }

  /**
   * 获取持仓信息
   */
  async getPositions(instId = '') {
    const params = instId ? { instId } : {};
    return await this.request('GET', '/api/v5/account/positions', params);
  }

  /**
   * 获取单个币种的持仓
   */
  async getPosition(instId) {
    const positions = await this.getPositions(instId);
    return positions.find(p => p.instId === instId) || null;
  }

  /**
   * 设置杠杆
   */
  async setLeverage(instId, lever, mgnMode = 'isolated', posSide = 'net') {
    const params = {
      instId,
      lever: lever.toString(),
      mgnMode,
      posSide  // 双向持仓需要指定long/short
    };
    
    const result = await this.request('POST', '/api/v5/account/set-leverage', params);
    
    if (!result || !Array.isArray(result) || result.length === 0) {
      throw new Error(`杠杆设置响应异常`);
    }
    return result[0];
  }

  /**
   * 获取杠杆信息
   */
  async getLeverageInfo(instId) {
    try {
      // 尝试使用account/positions API获取当前持仓的杠杆信息
      const positions = await this.getPositions(instId);
      if (positions && positions.length > 0) {
        const pos = positions[0];
        return {
          long: pos.longLever || '1',
          short: pos.shortLever || '1'
        };
      }
      
      // 如果没有持仓，返回默认值
      return {
        long: '1',
        short: '1'
      };
    } catch (error) {
      logger.warn(`⚠️ 获取杠杆信息失败: ${error.message}`);
      // 返回默认值，让交易继续进行
      return {
        long: '1',
        short: '1'
      };
    }
  }

  /**
   * 下单
   */
  async placeOrder(params) {
    const {
      instId,        // 交易对，如 "BTC-USDT-SWAP"
      side,          // 'buy' or 'sell'
      posSide,       // 'long' or 'short'（双向持仓模式）
      ordType,       // 'market' or 'limit'
      sz,            // 数量
      px,            // 价格（限价单需要）
      tdMode = 'isolated',  // 'isolated'(逐仓) or 'cross'(全仓)
      slTriggerPx,   // 止损触发价格
      tpTriggerPx    // 止盈触发价格
    } = params;

    // 获取交易产品信息，确保数量符合lotSize要求
    const instrumentsData = await this.request('GET', '/api/v5/public/instruments', {
      instType: 'SWAP',
      instId: instId
    });
    
    if (!instrumentsData || instrumentsData.length === 0) {
      throw new Error(`交易产品不存在: ${instId}`);
    }

    const instrument = instrumentsData[0];
    const lotSize = parseFloat(instrument.lotSz);
    const minSize = parseFloat(instrument.minSz);
    const ctVal = parseFloat(instrument.ctVal); // 合约面值
    
    // 将ETH数量转换为张数：数量 ÷ 合约面值 = 张数
    let szInContracts = sz / ctVal;
    
    // 规范化数量：向下取整到lotSize的整数倍
    let normalizedSz = Math.floor(szInContracts / lotSize) * lotSize;
    
    // 确保不小于最小交易量
    if (normalizedSz < minSize) {
      normalizedSz = minSize;
    }
    
    const orderParams = {
      instId,
      tdMode,
      side,
      posSide,
      ordType,
      sz: normalizedSz.toString()
    };

    if (px) {
      orderParams.px = px.toString();
    }

    const result = await this.request('POST', '/api/v5/trade/order', orderParams);
    
    // 下单成功后设置止盈止损
    if (result[0] && result[0].ordId && (slTriggerPx || tpTriggerPx)) {
      try {
        const algoOrderParams = {
          instId,
          tdMode,
          side: side === 'buy' ? 'sell' : 'buy', // 止盈止损方向相反
          ordType: 'conditional',
          posSide,
          sz: normalizedSz.toString()
        };

        if (slTriggerPx) {
          algoOrderParams.slTriggerPx = slTriggerPx.toString();
          algoOrderParams.slOrdPx = '-1'; // 市价
        }

        if (tpTriggerPx) {
          algoOrderParams.tpTriggerPx = tpTriggerPx.toString();
          algoOrderParams.tpOrdPx = '-1'; // 市价
        }

        logger.info(`设置止盈止损: ${instId}`, algoOrderParams);
        const algoResult = await this.request('POST', '/api/v5/trade/order-algo', algoOrderParams);
        logger.info(`✅ 止盈止损设置成功: ${instId}`, algoResult);
      } catch (algoError) {
        logger.error(`❌ 止盈止损设置失败: ${algoError.message}`);
      }
    }

    return result[0];
  }

  /**
   * 平仓
   */
  async closePosition(instId, posSide) {
    const position = await this.getPosition(instId);
    
    if (!position || parseFloat(position.pos) === 0) {
      return null;
    }

    const side = posSide === 'long' ? 'sell' : 'buy';
    const sz = Math.abs(parseFloat(position.pos));

    return await this.placeOrder({
      instId,
      side,
      posSide,
      ordType: 'market',
      sz,
      tdMode: 'isolated'
    });
  }

  /**
   * 获取K线数据（用于计算ATR）
   */
  async getCandles(instId, bar = '1H', limit = 100) {
    const params = {
      instId,
      bar,
      limit: limit.toString()
    };
    return await this.request('GET', '/api/v5/market/candles', params);
  }

  /**
   * 计算ATR百分比
   */
  async calculateATRPercent(instId, period = 24) {
    const candles = await this.getCandles(instId, '1H', period + 14);
    
    if (!candles || candles.length < period) {
      return 0;
    }

    // OKX K线格式: [timestamp, open, high, low, close, vol, volCcy, volCcyQuote, confirm]
    let atrSum = 0;
    for (let i = 1; i < period; i++) {
      const high = parseFloat(candles[i][2]);
      const low = parseFloat(candles[i][3]);
      const prevClose = parseFloat(candles[i + 1][4]);
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      atrSum += tr;
    }

    const atr = atrSum / period;
    const currentPrice = parseFloat(candles[0][4]);
    const atrPercent = (atr / currentPrice) * 100;

    return atrPercent;
  }

  /**
   * 检测市场是否处于极端波动
   */
  async isExtremeVolatility() {
    try {
      const btcATR = await this.calculateATRPercent('BTC-USDT-SWAP', 24);
      const ethATR = await this.calculateATRPercent('ETH-USDT-SWAP', 24);
      
      const threshold = config.risk.btcAtrThreshold;
      const isExtreme = btcATR > threshold || ethATR > threshold;

      if (isExtreme) {
        logger.warn(`🚨 检测到极端波动: BTC ATR=${btcATR.toFixed(2)}%, ETH ATR=${ethATR.toFixed(2)}%`);
      }

      return {
        isExtreme,
        btcATR,
        ethATR,
        threshold
      };
    } catch (error) {
      logger.error(`计算市场波动率失败: ${error.message}`);
      return { isExtreme: false, btcATR: 0, ethATR: 0 };
    }
  }
}

module.exports = OKXClient;

