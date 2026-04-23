const { MongoClient } = require('mongodb');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const MONGO_URL = "mongodb://127.0.0.1:3001/meteor"; 
const REDIS_CONF = { host: 'localhost', port: 6379 };

const connectorQueue = new Queue('connector-tasks', { connection: REDIS_CONF });
const redisPub = new Redis(REDIS_CONF); // For instant STOP signals

async function runManager() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();
  const connectorsCol = db.collection('active_connectors');

  console.log("📑 MANAGER: Watching MongoDB for Connector changes...");

  // Watch for inserts, updates, and deletes
  const stream = connectorsCol.watch([
    { $match: { 'operationType': { $in: ['insert', 'update', 'replace', 'delete'] } } }
  ], { fullDocument: 'updateLookup' });

  stream.on('change', async (change) => {
    const { operationType, documentKey } = change;
    const connectorId = documentKey._id.toString();

    // HANDLE DELETION
    if (operationType === 'delete') {
      console.log(`🗑️  Detected DELETE for ${connectorId}. Killing worker process...`);
      
      // 1. Remove from BullMQ queue if it was waiting
      const job = await connectorQueue.getJob(connectorId);
      if (job) await job.remove();

      // 2. Signal workers to stop
      redisPub.publish('connector-commands', JSON.stringify({ action: 'STOP', connectorId }));
      return;
    }

    // HANDLE INSERT / UPDATE
    const connector = change.fullDocument;
    if (!connector) return;

    if (connector.enabled) {
      console.log(`🚀 Dispatching [${connector.name}] to Redis Queue`);
      await connectorQueue.add('start-pipeline', 
        { connectorId: connector._id, config: connector },
        { jobId: connector._id.toString() } 
      );
    } else {
      console.log(`🛑 [${connector.name}] disabled. Signaling workers to stop...`);
      redisPub.publish('connector-commands', JSON.stringify({ action: 'STOP', connectorId }));
    }
  });

  stream.on('error', (err) => console.error("❌ Mongo Stream Error:", err));
}

runManager().catch(console.dir);