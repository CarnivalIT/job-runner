import { runUpdateInventory } from '../tasks/updateInventory/index.js';
import { runUpdateDimensions } from '../tasks/updateDimensions/index.js';
import { runLivedashPush } from '../tasks/livedashPush/index.js';
import { runLogbookUpdateDB } from '../tasks/logbookUpdateDB/index.js';

export interface ScheduledJob {
  id: string;
  name: string;
  cronExpression: string;
  description: string;
  enabled: boolean;
  run: () => Promise<void>;
}

export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    id: 'update-inventory',
    name: 'Update Inventory',
    cronExpression: '0 7,12 * * 1-5', // Mon-Fri at 7:00 AM and 12:00 PM
    description: 'Synchronizes ERP inventory levels to stylesInformation API',
    enabled: true,
    run: runUpdateInventory,
  },
  {
    id: 'update-dimensions',
    name: 'Update Product Dimensions',
    cronExpression: '0 6 * * 1-5', // Mon-Fri at 6:00 AM
    description: 'Synchronizes style sizes and color variations from ECORESPRODUCT',
    enabled: true,
    run: runUpdateDimensions,
  },
  {
    id: 'livedash-push',
    name: 'LiveDash Metrics Push',
    cronExpression: '*/15 8-19 * * 1-5', // Mon-Fri every 15 minutes during working hours
    description: 'Extracts AvanceOEI, EficienciaColaborador, and EficienciaOperacion metrics and pushes to LiveDash',
    enabled: false, // Set to true when ready to enable in scheduler
    run: runLivedashPush,
  },
  {
    id: 'logbook-sync',
    name: 'Logbook & Orders Sync (The Courier)',
    cronExpression: '0 13,19 * * 1-5', // Mon-Fri at 1:00 PM and 7:00 PM
    description: 'Extracts sales orders, tracking details, and order status from AX and SQL Server',
    enabled: false, // Set to true when ready to enable in scheduler
    run: runLogbookUpdateDB,
  },
];
