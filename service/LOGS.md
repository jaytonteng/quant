# 日志说明文档

## 📋 日志存储位置

### 生产环境（服务器）

日志文件存储在项目的 `logs/` 目录下：

```
~/quant/service/logs/
├── error.log      # 错误日志（只记录 error 级别）
├── combined.log   # 综合日志（记录所有级别）
└── trades.log     # 交易日志（记录 info 级别）
```

**完整路径**：
- 错误日志: `~/quant/service/logs/error.log`
- 综合日志: `~/quant/service/logs/combined.log`
- 交易日志: `~/quant/service/logs/trades.log`

### 开发环境（本地）

日志文件在同样的位置：
```
/Users/jeffteng/Documents/development/quant/quant/service/logs/
```

---

## 🔍 查看日志的方法

### 1. 使用 PM2 查看实时日志（推荐）

```bash
# 实时查看所有日志
pm2 logs quant-service

# 只查看最近20行
pm2 logs quant-service --lines 20

# 查看错误日志
pm2 logs quant-service --err

# 查看输出日志
pm2 logs quant-service --out
```

### 2. 使用 tail 查看文件日志

```bash
# 实时查看综合日志
tail -f ~/quant/service/logs/combined.log

# 实时查看错误日志
tail -f ~/quant/service/logs/error.log

# 实时查看交易日志
tail -f ~/quant/service/logs/trades.log

# 查看最近100行
tail -n 100 ~/quant/service/logs/combined.log
```

### 3. 使用 grep 搜索日志

```bash
# 搜索特定币种的交易
grep "ETH-USDT-SWAP" ~/quant/service/logs/trades.log

# 搜索错误信息
grep "❌" ~/quant/service/logs/combined.log

# 搜索开仓记录
grep "开仓成功" ~/quant/service/logs/trades.log

# 搜索最近1小时的日志
grep "$(date +'%Y-%m-%d %H')" ~/quant/service/logs/combined.log
```

### 4. 使用 less 浏览日志

```bash
# 分页浏览日志（按空格翻页，按q退出）
less ~/quant/service/logs/combined.log

# 从底部开始浏览（最新日志）
less +G ~/quant/service/logs/combined.log
```

---

## 📊 日志内容说明

### 控制台输出格式（PM2 logs）

简洁格式，只显示必要信息：
```
info: 📉开仓/加仓 ETH-USDT-SWAP 0.01
info: 🚀 ETH-USDT-SWAP 开仓 0.01 [当前0个]
info: ✅ 开仓成功 ETH-USDT-SWAP 0.01 @3796.67
```

### 文件日志格式（combined.log, trades.log）

JSON格式，包含完整信息：
```json
{
  "level": "info",
  "message": "✅ 开仓成功 ETH-USDT-SWAP 0.01 @3796.67",
  "service": "trading-service",
  "timestamp": "2025-10-17 15:28:03"
}
```

---

## 🗂️ 日志轮转配置

为防止日志文件过大，建议配置 logrotate：

### 创建 logrotate 配置

```bash
sudo nano /etc/logrotate.d/quant-service
```

添加以下内容：

```
/home/your-username/quant/service/logs/*.log {
    daily                 # 每天轮转
    rotate 7              # 保留7天
    compress              # 压缩旧日志
    delaycompress         # 延迟一天再压缩
    missingok             # 日志文件不存在不报错
    notifempty            # 空文件不轮转
    create 0644 your-username your-username
    postrotate
        # 轮转后重启服务（可选）
        pm2 reloadLogs
    endscript
}
```

### 测试 logrotate

```bash
# 测试配置（不实际执行）
sudo logrotate -d /etc/logrotate.d/quant-service

# 强制执行一次
sudo logrotate -f /etc/logrotate.d/quant-service
```

---

## 🔧 调整日志级别

如果需要更详细的调试信息，可以修改环境变量：

### 方法1：在 .env 文件中设置

```bash
# .env
LOG_LEVEL=debug  # 可选: error, warn, info, debug
```

### 方法2：在 logger.js 中修改

```javascript
// quant/service/shared/logger.js
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',  // 从环境变量读取
  // ...
});
```

---

## 📈 常用日志监控命令

### 监控开仓/平仓操作

```bash
# 实时监控交易操作
tail -f ~/quant/service/logs/trades.log | grep -E "开仓|加仓|平仓"

# 统计今天的交易次数
grep "$(date +'%Y-%m-%d')" ~/quant/service/logs/trades.log | grep "开仓成功" | wc -l
```

### 监控错误

```bash
# 实时监控错误
tail -f ~/quant/service/logs/error.log

# 统计今天的错误数
grep "$(date +'%Y-%m-%d')" ~/quant/service/logs/error.log | wc -l
```

### 监控特定币种

```bash
# 监控 ETH 的所有操作
tail -f ~/quant/service/logs/combined.log | grep "ETH-USDT-SWAP"
```

---

## 🚨 日志告警（可选）

如果需要在出现错误时收到通知，可以使用以下方法：

### 使用 PM2 的日志监控

```bash
# 当日志中出现 "error" 时发送邮件
pm2 install pm2-logrotate
pm2 set pm2-logrotate:retain 7
```

### 使用自定义脚本

```bash
#!/bin/bash
# ~/quant/check-errors.sh

ERROR_COUNT=$(grep "$(date +'%Y-%m-%d')" ~/quant/service/logs/error.log | wc -l)

if [ $ERROR_COUNT -gt 10 ]; then
    echo "警告: 今天已出现 $ERROR_COUNT 个错误" | mail -s "Quant Service Alert" your-email@gmail.com
fi
```

添加到 crontab：
```bash
# 每小时检查一次
0 * * * * ~/quant/check-errors.sh
```

---

## 📊 日志分析工具

### 1. 使用 jq 分析 JSON 日志

```bash
# 安装 jq
sudo apt install jq

# 统计不同级别的日志数量
cat ~/quant/service/logs/combined.log | jq -r '.level' | sort | uniq -c

# 提取所有错误消息
cat ~/quant/service/logs/error.log | jq -r '.message'

# 按时间筛选
cat ~/quant/service/logs/combined.log | jq 'select(.timestamp | startswith("2025-10-17 15"))'
```

### 2. 导出日志到 CSV

```bash
# 提取交易记录
cat ~/quant/service/logs/trades.log | jq -r '[.timestamp, .message] | @csv' > trades.csv
```

---

## 🔒 日志安全

1. **权限设置**
   ```bash
   chmod 640 ~/quant/service/logs/*.log
   chown your-username:your-username ~/quant/service/logs/*.log
   ```

2. **定期清理敏感信息**
   - 日志中不包含 API 密钥
   - 如果需要，可以过滤掉敏感字段

3. **备份重要日志**
   ```bash
   # 每周备份一次
   tar -czf logs-backup-$(date +%Y%m%d).tar.gz ~/quant/service/logs/
   ```

