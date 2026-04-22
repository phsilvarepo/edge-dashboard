const { Worker } = require('bullmq');
const { MongoClient } = require('mongodb');
const { createPipeline } = require('./pipeline');
const Redis = require('ioredis');

const MONGO_URL = "mongodb://127.0.0.1:3001/meteor"; 

// 1. Connection Config (Standard)
const REDIS_CONF = { 
  host: 'localhost', 
  port: 6379, 
  maxRetriesPerRequest: null 
};

// 2. Subscriber Config (Special - Disable Ready Check)
const SUB_CONF = { 
  ...REDIS_CONF, 
  enableReadyCheck: false 
};

const activePipelines = new Map();

// Initialize the dedicated subscriber
const redisSub = new Redis(SUB_CONF);

async function start() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();

  // 3. Pass the CONFIG OBJECT to the worker
  // BullMQ will open its own internal connections using this config
  const worker = new Worker('connector-tasks', async (job) => {
    const { config } = job.data;
    const connectorId = config._id.toString();

    if (activePipelines.has(connectorId)) {
      console.log(`♻️  Reloading existing pipeline: ${config.name}`);
      activePipelines.get(connectorId).stop();
    }

    try {
      const pipeline = await createPipeline(config, db);
      activePipelines.set(connectorId, pipeline);
      console.log(`✅ [${config.name}] is now running.`);
    } catch (err) {
      console.error(`❌ Failed to start pipeline [${config.name}]:`, err.message);
    }
  }, { 
    connection: REDIS_CONF, // Pass the object, not the redisSub instance
    concurrency: 50 
  });

  // 4. Subscriber Logic
  redisSub.subscribe('connector-commands');
  
  redisSub.on('message', (channel, message) => {
    try {
      const { action, connectorId } = JSON.parse(message);
      if (action === 'STOP') {
        const pipeline = activePipelines.get(connectorId);
        if (pipeline) {
          pipeline.stop();
          activePipelines.delete(connectorId);
          console.log(`🛑 Killed pipeline: ${connectorId}`);
        }
      }
    } catch (err) {
      console.error("Error parsing Redis message:", err);
    }
  });

  // Handle errors on the sub connection specifically
  redisSub.on('error', (err) => {
    if (err.message.includes('subscriber mode')) return; // Ignore this specific one
    console.error("Redis Sub Error:", err);
  });

  console.log("👷 WORKER: Engine is online and ready for tasks...");
}

start().catch(console.error);