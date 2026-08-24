import cron, { type ScheduledTask } from 'node-cron';
import { SCHEDULED_JOBS, ScheduledJob } from './schedules.js';
import { logger } from '../utils/logger.js';

interface RunningTask {
  job: ScheduledJob;
  task: ScheduledTask;
}

const activeTasks: RunningTask[] = [];

/**
 * Initializes and starts all enabled cron jobs
 */
export function startScheduler(): void {
  logger.info('----------------------------------------------------');
  logger.info('   🕒 INITIALIZING CARNIVAL CRON MANAGER');
  logger.info('----------------------------------------------------');

  const enabledJobs = SCHEDULED_JOBS.filter((job) => job.enabled);
  const disabledJobs = SCHEDULED_JOBS.filter((job) => !job.enabled);

  if (disabledJobs.length > 0) {
    logger.info(`Disabled jobs (${disabledJobs.length}): ${disabledJobs.map((j) => j.id).join(', ')}`);
  }

  if (enabledJobs.length === 0) {
    logger.warn('No jobs are currently enabled in scheduler.');
    return;
  }

  for (const job of enabledJobs) {
    if (!cron.validate(job.cronExpression)) {
      logger.error(`Invalid cron expression "${job.cronExpression}" for job [${job.id}]. Skipping.`);
      continue;
    }

    logger.info(`📅 Registering [${job.id}] "${job.name}" => Cron: "${job.cronExpression}"`);

    const scheduledTask = cron.schedule(job.cronExpression, async () => {
      logger.info(`▶️ Triggering scheduled job [${job.id}] (${job.name})...`);
      const jobStart = Date.now();
      try {
        await job.run();
        const duration = ((Date.now() - jobStart) / 1000).toFixed(2);
        logger.success(`🏁 Finished scheduled job [${job.id}] in ${duration}s.`);
      } catch (err) {
        const duration = ((Date.now() - jobStart) / 1000).toFixed(2);
        logger.error(`💥 Scheduled job [${job.id}] failed after ${duration}s:`, err);
      }
    });

    activeTasks.push({ job, task: scheduledTask });
  }

  logger.info(`🚀 Scheduler running with ${activeTasks.length} active cron jobs.`);
  logger.info('----------------------------------------------------\n');
}

/**
 * Stops all active cron tasks for graceful shutdown
 */
export function stopScheduler(): void {
  logger.info('🛑 Stopping all active cron schedules...');
  for (const { job, task } of activeTasks) {
    task.stop();
    logger.info(`   - Stopped job [${job.id}]`);
  }
  activeTasks.length = 0;
  logger.info('All cron jobs stopped.');
}
