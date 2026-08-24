import fs from 'fs';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.resolve(process.cwd(), 'logs');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.log(`[${new Date().toISOString()}] [INFO] ${message}`, ...args);
  },

  warn(message: string, ...args: unknown[]): void {
    console.warn(`[${new Date().toISOString()}] [WARN] ${message}`, ...args);
  },

  error(message: string, ...args: unknown[]): void {
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}`, ...args);
  },

  success(message: string, ...args: unknown[]): void {
    console.log(`[${new Date().toISOString()}] [SUCCESS] ${message}`, ...args);
  },

  /**
   * Appends execution summary to a task log file in logs/<taskName>.log
   */
  logToFile(taskName: string, content: string): void {
    try {
      ensureLogDir();
      const filePath = path.join(LOG_DIR, `${taskName}.log`);
      fs.appendFileSync(filePath, content + '\n');
    } catch (err) {
      console.error(`Failed to write to log file ${taskName}.log:`, err);
    }
  }
};
