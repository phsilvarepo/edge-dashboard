const { MongoClient, ObjectId } = require('mongodb');
const mqtt = require('mqtt');

// --- CONFIGURATION ---
const MONGO_URL = "mongodb://127.0.0.1:3001/meteor"; 
const client = new MongoClient(MONGO_URL);

// --- STATE MANAGEMENT ---
const brokerClients = new Map(); // Key: Broker URL | Value: MQTT Client
const subscribedTopics = new Map(); // Key: Broker URL | Value: Set of Topics

// --- HELPERS ---

/**
 * Replaces dots with underscores so MongoDB doesn't throw errors.
 */
const sanitizeKeys = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  const newObj = Array.isArray(obj) ? [] : {};
  Object.keys(obj).forEach(key => {
    const cleanKey = key.replace(/\./g, '_');
    newObj[cleanKey] = sanitizeKeys(obj[key]);
  });
  return newObj;
};

/**
 * Extracts short ID (e.g., 838A04) from topic HS4U/tele/tasmota_838A04/SENSOR
 */
const getShortId = (topic) => {
  const parts = topic.split('/');
  const rawId = parts[2] || 'UNKNOWN';
  return rawId.replace(/tasmota_|shelly_|thermal_/gi, '').toUpperCase();
};

/**
 * CORE LOGIC: Processes incoming MQTT packets and updates individual sensor docs.
 */
async function processMqttMessage(topic, message, providersCol, templatesCol) {
  const top = topic.toUpperCase();
  const msgStr = message.toString();
  if (!msgStr.startsWith('{')) return; // Skip non-JSON LWT/Status messages

  try {
    const payload = JSON.parse(msgStr);
    const shortId = getShortId(topic);

    // 1. GRANULAR TASMOTA SENSORS
    if (top.startsWith('HS4U/TELE/') && top.endsWith('/SENSOR')) {
      for (const key of Object.keys(payload)) {
        if (['Time', 'TempUnit'].includes(key)) continue;

        const template = await templatesCol.findOne({ name: key });
        if (!template) continue;

        const uniqueId = `${shortId}_${key}`.toUpperCase();
        await providersCol.updateOne(
          { _id: uniqueId },
          {
            $set: {
              lastRun: new Date(),
              latestData: sanitizeKeys(payload[key])
            }
          }
        );
      }
    }

    // 2. THERMAL CAMERA MATRIX
    if (top.startsWith('HS4U/THERMAL/') && top.endsWith('/IMG')) {
      const uniqueId = `${shortId}_THERMAL_CAMERA`.toUpperCase();
      await providersCol.updateOne(
        { _id: uniqueId },
        {
          $set: {
            lastRun: new Date(),
            latestData: sanitizeKeys(payload)
          }
        }
      );
    }
  } catch (e) {
    // Parsing error or missing template, ignore
  }
}

/**
 * Manages persistent connections to all unique brokers in the DB
 */
async function syncLiveStreams(providersCol, templatesCol) {
  const activeProviders = await providersCol.find({}).toArray();
  
  for (const provider of activeProviders) {
    const brokerUrl = provider.params?.broker || provider.params?.brokerUrl;
    if (!brokerUrl) continue;

    // Create client if not exists for this specific broker
    if (!brokerClients.has(brokerUrl)) {
      console.log(`📡 [Live] Connecting to Broker: ${brokerUrl}`);
      
      const newClient = mqtt.connect(brokerUrl, {
        username: provider.params?.username || '',
        password: provider.params?.password || provider.params?.pass || '',
        reconnectPeriod: 5000,
        connectTimeout: 10000
      });

      newClient.on('message', (topic, msg) => {
        processMqttMessage(topic, msg, providersCol, templatesCol);
      });

      newClient.on('error', (err) => console.error(`❌ Broker [${brokerUrl}] Error:`, err.message));

      brokerClients.set(brokerUrl, newClient);
      subscribedTopics.set(brokerUrl, new Set());
    }

    // Subscribe to topic on the correct broker
    const clientForBroker = brokerClients.get(brokerUrl);
    const topicsSet = subscribedTopics.get(brokerUrl);

    if (provider.topic && !topicsSet.has(provider.topic)) {
      console.log(`🎧 [Live] Broker [${brokerUrl}] Subscribing: ${provider.topic}`);
      clientForBroker.subscribe(provider.topic);
      topicsSet.add(provider.topic);
    }
  }
}

/**
 * Handle Auto-Discovery Command
 */
async function handleDiscovery(doc, providersCol, templatesCol) {
  const { brokerUrl, username, password } = doc.params;
  const scanner = mqtt.connect(brokerUrl, { username, password, connectTimeout: 5000 });

  return new Promise((resolve) => {
    scanner.on('connect', () => {
      console.log(`🔍 [Discovery] Scanning ${brokerUrl}...`);
      scanner.subscribe(['HS4U/tele/#', 'HS4U/thermal/#']);
    });

    scanner.on('message', async (topic, message) => {
      const top = topic.toUpperCase();
      const msgStr = message.toString();
      if (!msgStr.startsWith('{')) return;

      try {
        const payload = JSON.parse(msgStr);
        const shortId = getShortId(topic);

        if (top.startsWith('HS4U/TELE/') && top.endsWith('/SENSOR')) {
          for (const key of Object.keys(payload)) {
            if (['Time', 'TempUnit'].includes(key)) continue;
            const template = await templatesCol.findOne({ name: key });
            if (!template) continue;

            const uniqueId = `${shortId}_${key}`.toUpperCase();
            await providersCol.updateOne(
              { _id: uniqueId },
              {
                $set: {
                  id: uniqueId,
                  templateId: template._id,
                  provider: key,
                  label: template.label || key,
                  captureMethod: 'MQTT_TASMOTA',
                  topic: topic,
                  parentId: shortId,
                  dataType: template.outputType || 'json',
                  params: doc.params, // Critical for syncLiveStreams
                  lastRun: new Date(),
                  latestData: sanitizeKeys(payload[key])
                }
              },
              { upsert: true }
            );
          }
        }

        if (top.startsWith('HS4U/THERMAL/') && top.endsWith('/IMG')) {
          const uniqueId = `${shortId}_THERMAL_CAMERA`.toUpperCase();
          await providersCol.updateOne(
            { _id: uniqueId },
            {
              $set: {
                id: uniqueId,
                provider: 'THERMAL CAMERA',
                label: 'Thermal Matrix',
                captureMethod: 'MQTT_SHELLY',
                topic: topic,
                parentId: shortId,
                dataType: 'image_matrix',
                params: doc.params,
                lastRun: new Date(),
                latestData: sanitizeKeys(payload)
              }
            },
            { upsert: true }
          );
        }
      } catch (e) {}
    });

    setTimeout(() => {
      scanner.end();
      console.log("🛑 [Discovery] Scan Finished.");
      resolve();
    }, 15000);
  });
}

/**
 * MAIN BOOTSTRAP
 */
async function run() {
  await client.connect();
  const db = client.db();
  const commandsCol = db.collection('mqtt_commands');
  const providersCol = db.collection('providers_status');
  const templatesCol = db.collection('providers_template');

  console.log("🚀 MQTT Worker Started. Multi-Broker + Granular Sensors Active.");

  // Start persistent streams for existing sensors
  await syncLiveStreams(providersCol, templatesCol);

  // Watch for new UI commands
  const changeStream = commandsCol.watch([{ $match: { 'operationType': 'insert' } }]);

  changeStream.on('change', async (change) => {
    const doc = change.fullDocument;
    if (doc.status !== 'pending') return;

    try {
      if (doc.type === 'DISCOVERY') {
        await handleDiscovery(doc, providersCol, templatesCol);
        await syncLiveStreams(providersCol, templatesCol);
      } 
      
      await commandsCol.updateOne({ _id: doc._id }, { $set: { status: 'done' } });
    } catch (err) {
      console.error("Task Error:", err);
      await commandsCol.updateOne({ _id: doc._id }, { $set: { status: 'error', error: err.message } });
    }
  });
}

run().catch(console.dir);