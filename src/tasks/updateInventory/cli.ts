import { runUpdateInventory } from './index.js';

runUpdateInventory()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('CLI execution failed for updateInventory:', err);
    process.exit(1);
  });
