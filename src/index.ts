import 'dotenv/config';
import { startScheduler, stopScheduler } from './scheduler/index.js';
import { logger } from './utils/logger.js';

console.log('====================================================');
console.log('   🚀 CARNIVAL JOB RUNNER (DATA SYNC SERVICE)');
console.log('====================================================');
logger.info(`Starting process in ${process.env.NODE_ENV || 'development'} mode (PID: ${process.pid})`);

// Start the scheduler
startScheduler();

// Graceful shutdown handlers
const handleShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  stopScheduler();
  logger.info('Process exiting cleanly.');
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
});
