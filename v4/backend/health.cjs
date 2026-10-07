// Public liveness only. Do not inspect input, environment, identity or AWS services.
exports.handler = async () => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: '{"status":"ok"}',
  isBase64Encoded: false,
});
