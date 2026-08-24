import { runLogbookUpdateDB } from './index.js';

runLogbookUpdateDB()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('CLI execution failed for logbookUpdateDB:', err);
    process.exit(1);
  });
