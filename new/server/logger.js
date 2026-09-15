const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, 'logs');
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
} catch (_err) {
  // If filesystem is read-only or permission restricted, console logger will still function
}

const transportList = [
  new transports.Console({
    format: format.combine(
      format.colorize(),
      format.printf(({ level, message, timestamp, stack, ...meta }) => {
        const extra = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] ${level}: ${message}${stack ? `\n${stack}` : ''}${extra}`;
      })
    )
  })
];

if (fs.existsSync(logDir)) {
  try {
    transportList.push(
      new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
      new transports.File({ filename: path.join(logDir, 'combined.log') })
    );
  } catch (_err) {
    // Ignore file transport initialization error
  }
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: transportList
});

module.exports = logger;
