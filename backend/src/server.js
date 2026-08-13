require("dotenv").config();

const app = require("./app");
const { checkDatabase } = require("./config/database");
const { startCleanupWorker } = require("./services/cleanupService");

const PORT = process.env.PORT || 10000;

async function start() {
  await checkDatabase();

  app.listen(PORT, () => {
    console.log(`All-In-One Documents API running on port ${PORT}`);
  });

  startCleanupWorker();
}

start().catch(error => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
