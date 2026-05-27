import { createServer } from 'http';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables (.env.local takes precedence)
config({ path: join(__dirname, '../.env.local') });
config({ path: join(__dirname, '../.env') });

async function main() {
  // Load secrets from SSM in production (before importing app)
  if (process.env.NODE_ENV === 'production') {
    const { loadProductionSecrets } = await import('./config/ssm.js');
    await loadProductionSecrets();
  }

  const {
    shutdownFleetGraphLangfuseTracing,
    startFleetGraphLangfuseTracingFromEnvironment,
  } = await import('./fleetgraph/langfuse.js');
  startFleetGraphLangfuseTracingFromEnvironment();

  // Now import app after secrets are loaded
  const { createApp } = await import('./app.js');
  const { setupCollaboration } = await import('./collaboration/index.js');
  const {
    registerProactiveTriggerShutdownHandlers,
    shouldStartProactiveTriggers,
    shutdown: shutdownProactiveTriggers,
    startProactiveTriggers,
  } = await import('./fleetgraph/triggers.js');

  const PORT = process.env.PORT || 3000;
  const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

  const app = createApp(CORS_ORIGIN);
  const server = createServer(app);

  // DDoS protection: Set server-wide timeouts to prevent slow-read attacks (Slowloris)
  server.timeout = 60000; // 60 seconds max request duration
  server.keepAliveTimeout = 65000; // 65 seconds (slightly longer than timeout)
  server.headersTimeout = 66000; // 66 seconds (slightly longer than keepAlive)

  // Setup WebSocket collaboration server
  setupCollaboration(server);
  if (shouldStartProactiveTriggers({
    FLEETGRAPH_PROACTIVE_TRIGGERS_ENABLED: process.env.FLEETGRAPH_PROACTIVE_TRIGGERS_ENABLED,
  })) {
    startProactiveTriggers();
  } else {
    console.log('fleetgraph.proactive_trigger.disabled', {
      reason: 'FLEETGRAPH_PROACTIVE_TRIGGERS_ENABLED',
    });
  }
  registerProactiveTriggerShutdownHandlers(process, shutdownProactiveTriggers);
  process.prependOnceListener('SIGTERM', () => {
    void shutdownFleetGraphLangfuseTracing().catch((error: unknown) => {
      console.error('fleetgraph.langfuse.shutdown_failed', error);
    });
  });
  process.prependOnceListener('SIGINT', () => {
    void shutdownFleetGraphLangfuseTracing().catch((error: unknown) => {
      console.error('fleetgraph.langfuse.shutdown_failed', error);
    });
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
    console.log(`CORS origin: ${CORS_ORIGIN}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
