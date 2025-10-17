const winston = require('winston');
const path = require('path');

// 创建 logs 目录
const logsDir = path.join(__dirname, '../logs');
const fs = require('fs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 简洁的文本格式（用于文件）
const simpleFileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

const logger = winston.createLogger({
  level: 'info',
  transports: [
    // 错误日志
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      format: simpleFileFormat
    }),
    // 所有日志
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      format: simpleFileFormat
    }),
    // 交易日志
    new winston.transports.File({ 
      filename: path.join(logsDir, 'trades.log'),
      level: 'info',
      format: simpleFileFormat
    })
  ]
});

// 开发环境同时输出到控制台
// if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${level}: ${message}`;
      })
    )
  }));
// }

module.exports = logger;

