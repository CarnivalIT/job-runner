import { runUpdateDimensions } from './index.js';

runUpdateDimensions()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('CLI execution failed for updateDimensions:', err);
    process.exit(1);
  });
