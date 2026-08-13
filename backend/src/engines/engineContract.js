const fs = require("fs/promises");

/**
 * Shared contract for document engines.
 * Engines receive a local input file and return a local output file.
 * Storage, payment/access, and cleanup remain outside the engine.
 */
async function assertReadableFile(inputPath) {
  await fs.access(inputPath);
}

function assertResult(result) {
  if (!result || !result.outputPath) {
    throw new Error("Engine did not return an outputPath");
  }
  return result;
}

module.exports = { assertReadableFile, assertResult };
