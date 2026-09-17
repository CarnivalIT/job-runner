import { runStylesAge } from './index.js';

runStylesAge()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('CLI execution failed for stylesAge:', err);
    process.exit(1);
  });
