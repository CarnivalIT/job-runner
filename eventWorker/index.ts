import cron from 'node-cron';
// --- Cron Schedules ---
import updateInventory from './src/tasks/updateInventory.js';

console.log('🚀 Event Worker initialized.');
/**
 *  Schedule format reference:
 *  * * * * * *
 *  | | | | | |
 *  | | | | | day of week
 *  | | | | month
 *  | | | day of month
 *  | | hour
 *  | minute
 *  second (optional)
*/

//Runs at 7:00 AM and 12:00 PM, Monday through Friday
cron.schedule('0 7,12 * * 1-5', () => {
  updateInventory().catch(err => console.error('Cron updateInventory failed:', err));
});
