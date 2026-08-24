import { runLivedashPush } from './index.js';

runLivedashPush()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('CLI execution failed for livedashPush:', err);
    process.exit(1);
  });
