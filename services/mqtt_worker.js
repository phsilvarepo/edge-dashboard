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
/**
 * CORE LOGIC: Processes incoming MQTT packets
 */
async function processMqttMessage(topic, message, providersCol, templatesCol) {
  const top = topic.toUpperCase();
  const msgStr = message.toString().trim();
  
  // 1. Filter out known non-JSON LWT messages immediately to keep logs clean
  if (msgStr === 'Online' || msgStr === 'Offline') {
    return; 
  }

  try {
    // Attempt to parse the payload
    const payload = JSON.parse(msgStr);
    const shortId = getShortId(topic);

    // --- CASE A: TASMOTA SENSORS ---
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

    // --- CASE B: THERMAL CAMERA MATRIX ---
    // Note: We use .includes and .endsWith to be robust
    if (top.includes('/THERMAL/') && top.endsWith('/IMG')) {
      const uniqueId = `${shortId}_THERMAL_CAMERA`.toUpperCase();
      
      await providersCol.updateOne(
        { _id: uniqueId },
        {
          $set: {
            lastRun: new Date(),
            latestData: sanitizeKeys(payload) // This handles both Object and Array
          }
        }
      );
      // Optional: console.log(`📸 [Thermal] Updated ${uniqueId}`);
    }

  } catch (e) {
    // Only log error if it's a topic we expected to be JSON data
    if (top.includes('SENSOR') || top.includes('IMG')) {
      console.log(`⚠️ [MQTT] JSON Parse Error on ${topic}: ${e.message}`);
      console.log(`📝 [MQTT] Raw content attempt: ${msgStr.substring(0, 50)}...`);
    }
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
  // Support both doc.params and doc.data (based on previous logs)
  const discoveryParams = doc.params || doc.data?.params || doc.data;
  const { brokerUrl, username, password } = discoveryParams;

  const scanner = mqtt.connect(brokerUrl, { 
    username, 
    password, 
    connectTimeout: 5000 
  });

  return new Promise((resolve) => {
    scanner.on('connect', () => {
      console.log(`🔍 [Discovery] Connected to ${brokerUrl}. Subscribing...`);
      // Subscribing to wildcards for both Tasmota and Thermal Cameras
      scanner.subscribe(['HS4U/tele/#', 'HS4U/thermal/#']);
    });

    scanner.on('message', async (topic, message) => {
      const top = topic.toUpperCase();
      const msgStr = message.toString();
      
      console.log(`🛰️ [Discovery] Heard Topic: ${topic}`);

      try {
        const payload = JSON.parse(msgStr);
        const shortId = getShortId(topic);

        // --- 1. TASMOTA DISCOVERY ---
        if (top.startsWith('HS4U/TELE/') && top.endsWith('/SENSOR')) {
          console.log(`🌿 [Discovery] Processing Tasmota payload from ${shortId}`);
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
                  params: discoveryParams, 
                  lastRun: new Date(),
                  latestData: sanitizeKeys(payload[key])
                }
              },
              { upsert: true }
            );
          }
        }

        // --- 2. THERMAL CAMERA DISCOVERY ---
        // Changed to .includes for broader matching in case of prefix variations
        if (top.includes('/THERMAL/') && top.endsWith('/IMG')) {
          console.log(`🎯 [Discovery] FOUND THERMAL CAMERA: ${topic}`);
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
                params: discoveryParams,
                lastRun: new Date(),
                latestData: sanitizeKeys(payload)
              }
            },
            { upsert: true }
          );
          console.log(`💾 [Discovery] Thermal Document saved/updated: ${uniqueId}`);
        }

      } catch (e) {
        // Only log parse errors for topics we actually care about
        if (top.includes('SENSOR') || top.includes('IMG')) {
            console.log(`⚠️ [Discovery] Failed to parse JSON on ${topic}`);
        }
      }
    });

    // Scan for 15 seconds then close
    setTimeout(() => {
      scanner.end();
      console.log("🛑 [Discovery] Scan Session Finished.");
      resolve();
    }, 15000);
  });
}

async function handleCreateInstance(doc, providersCol, templatesCol) {
  // CHANGE doc.params TO doc.data
  const { templateId, method, params } = doc.data; 

  if (!templateId || !method || !params) {
    console.error("❌ [Manual] Missing data in command:", doc.data);
    throw new Error("Missing required fields: templateId, method, or params");
  }
  
  console.log(`🛠️ [Manual] Creating instance for template ID: ${templateId}`);

  // The rest remains the same...
  const template = await templatesCol.findOne({ _id: templateId });
  
  if (!template) {
    console.error(`❌ [Manual] Template NOT FOUND for ID: ${templateId}`);
    throw new Error(`Template ${templateId} not found`);
  }

  const mqttTopic = params.topic; 
  if (!mqttTopic) throw new Error("No MQTT topic provided in params");

  const shortId = getShortId(mqttTopic);
  const uniqueId = `${shortId}_${template.name}`.toUpperCase();

  await providersCol.updateOne(
    { _id: uniqueId },
    {
      $set: {
        id: uniqueId,
        templateId: template._id,
        provider: template.name,
        label: template.label || template.name,
        captureMethod: method,
        topic: mqttTopic,
        parentId: shortId,
        dataType: template.outputType || 'json',
        params: params, 
        lastRun: new Date(),
        latestData: { status: "Linked, awaiting data..." }
      }
    },
    { upsert: true }
  );
  
  console.log(`✅ [Manual] Instance ${uniqueId} created successfully.`);
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

      else if (doc.type === 'CREATE_INSTANCE') {
        // --- NEW LOGIC FOR MANUAL CREATION ---
        await handleCreateInstance(doc, providersCol, templatesCol);
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