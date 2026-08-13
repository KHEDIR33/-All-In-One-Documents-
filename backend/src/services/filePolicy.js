const TTL_MINUTES = Number(process.env.PROCESSED_FILE_TTL_MINUTES || 3);

function getDeleteAt(from = Date.now()) {
  return new Date(from + TTL_MINUTES * 60 * 1000).toISOString();
}

module.exports = { TTL_MINUTES, getDeleteAt };
