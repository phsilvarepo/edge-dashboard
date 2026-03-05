import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import mqtt from 'mqtt';
import { Connectors, ProvidersStatus, ProvidersTemplate } from './collections';

let globalMqttClient = null;
let isDiscoveryActive = false; 

const PARSE_STRATEGY = {
  MQTT_TASMOTA: {
    // Simply grab the segment after 'tele/'
    getDeviceId: (input) => {
      const parts = input.split('/');
      return parts.find(p => p.toLowerCase().startsWith('tasmota')) || parts[2] || input;
    },
    getSearchArea: (payload) => (payload.sn ? { ...payload.sn, ...payload } : payload),
    fixTopic: (input) => {
      // If the user provided a full topic ending in /SENSOR, use it. 
      // Otherwise, just ensure it ends with /SENSOR.
      return input.toUpperCase().endsWith('/SENSOR') ? input : `${input}/SENSOR`;
    }
  },
  MQTT_SHELLY: {
    getDeviceId: (input) => input.split('/').find(p => p.includes('shelly')) || input.split('/')[1] || input,
    getSearchArea: (payload) => payload,
    fixTopic: (input) => {
      const rawId = PARSE_STRATEGY.MQTT_SHELLY.getDeviceId(input);
      return `shellies/${rawId}/status`;
    }
  }
};

/**
 * HELPER: Replaces dots in keys with underscores so MongoDB doesn't crash
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
 * MAIN HANDLER: Processes incoming MQTT packets
 */
const handleMqttMessage = async (topic, message) => {
  try {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (e) {
      return; 
    }

    let detectedMethod = '';
    let deviceId = 'UNKNOWN';

    // Support case-insensitive check for the prefix
    if (topic.toUpperCase().startsWith('HS4U/TELE/')) {
      detectedMethod = 'MQTT_TASMOTA';
      deviceId = topic.split('/')[2] || 'TASMOTA_DEV';
    } else if (topic.startsWith('shellies/')) {
      detectedMethod = 'MQTT_SHELLY';
      deviceId = topic.split('/')[1] || 'SHELLY_DEV';
    } else {
      return; 
    }

    const searchArea = payload.sn ? { ...payload.sn, ...payload } : payload;
    const shortId = deviceId.replace('tasmota_', '').replace('shelly_', '').toUpperCase();

    for (const key of Object.keys(searchArea)) {
      if (['Time', 'TempUnit'].includes(key)) continue;

      const template = await ProvidersTemplate.findOneAsync({ 
        name: key,
        supportedMethods: detectedMethod 
      });

      if (template) {
        if (detectedMethod === 'MQTT_TASMOTA' && !topic.toUpperCase().endsWith('/SENSOR')) continue;
        
        const uniqueId = `${shortId}_${key}`.toUpperCase();
        const existingInstance = await ProvidersStatus.findOneAsync(uniqueId);
        
        // Guard Check
        if (!existingInstance && !isDiscoveryActive) continue;

        const cleanData = sanitizeKeys(searchArea[key]);

        console.log(`✅ MATCH! Device: ${shortId} | Sensor: ${key}`);
        console.log(`📊 DATA:`, JSON.stringify(cleanData));

        await ProvidersStatus.upsertAsync(
          { _id: uniqueId },
          {
            $set: {
              id: uniqueId,
              templateId: template._id,
              provider: key,
              label: template.label,
              captureMethod: detectedMethod,
              topic: topic,
              lastRun: new Date(),
              latestData: cleanData, 
              parentId: shortId,
              docs: template.docs
            }
          }
        );
      }
    }
  } catch (e) { 
    console.error("❌ MQTT Handler Error:", e.message);
  }
};

Meteor.methods({
  async 'providers.createInstance'({ templateId, method, params }) {
    const template = await ProvidersTemplate.findOneAsync(templateId);
    if (!template) throw new Meteor.Error('not-found', 'Blueprint not found');

    const strategy = PARSE_STRATEGY[method];
    const inputVal = method === 'MQTT_TASMOTA' ? params.topic : params.deviceId;
    
    // 1. The topic is exactly what the user typed (plus /SENSOR if they forgot it)
    const computedTopic = strategy.fixTopic(inputVal);
    
    // 2. Extract ID for DB indexing (keeping it uppercase for the _id only)
    const rawId = strategy.getDeviceId(computedTopic);
    const parentId = rawId.replace(/tasmota_/i, '').toUpperCase();
    const instanceId = `${parentId}_${template.name}`.toUpperCase();

    console.log(`📡 Subscribing to: ${computedTopic}`);
    console.log(`🆔 Internal ID: ${instanceId}`);

    const setupClient = (client) => {
        client.subscribe(computedTopic, (err) => {
            if (err) console.error("Sub Error:", err);
            else console.log("✔️ Subscribed");
        });
        
        if (method === 'MQTT_TASMOTA') {
          // Poke using the raw casing from the ID to be safe
          const pokeTopic = `HS4U/cmnd/${rawId}/status`;
          client.publish(pokeTopic, '8');
        }
    };

    if (!globalMqttClient || !globalMqttClient.connected) {
      if (params.broker) {
        console.log(`🔌 Initializing connection to ${params.broker}...`);
        globalMqttClient = mqtt.connect(params.broker, {
          username: params.username || '',
          password: params.pass || '', 
          connectTimeout: 5000,
        });
        
        globalMqttClient.on('connect', () => {
          console.log("🟢 MQTT Connected");
          setupClient(globalMqttClient);
        });

        globalMqttClient.on('message', (topic, message) => { handleMqttMessage(topic, message); });
        globalMqttClient.on('error', (err) => console.error("MQTT Error:", err.message));
      }
    } else {
        console.log("Using existing MQTT connection.");
        setupClient(globalMqttClient);
    }

    return await ProvidersStatus.upsertAsync(
      { _id: instanceId },
      {
        $set: {
          id: instanceId,
          templateId: template._id,
          provider: template.name,
          label: template.label,
          captureMethod: method,
          topic: computedTopic,
          params: params,
          lastRun: new Date(),
          latestData: { status: "Linked, awaiting broadcast..." },
          parentId: parentId,
          docs: template.docs
        }
      }
    );
  },

  'providers.autoDiscover'(config) {
    check(config, { brokerUrl: String, username: Match.Optional(String), password: Match.Optional(String) });
    if (Meteor.isClient) return;

    return new Promise((resolve) => {
      console.log(`🔍 AutoDiscovery starting...`);
      const currentUrl = globalMqttClient?.options?.href || "";
      const isDifferentAddress = !currentUrl.includes(config.brokerUrl);

      if (globalMqttClient && globalMqttClient.connected && !isDifferentAddress) {
        isDiscoveryActive = true;
        globalMqttClient.publish('HS4U/cmnd/tasmota/backlog', 'Status 8');
        Meteor.setTimeout(() => { isDiscoveryActive = false; }, 15000);
        return resolve(true);
      }

      if (globalMqttClient) globalMqttClient.end(true);

      globalMqttClient = mqtt.connect(config.brokerUrl, {
        username: config.username || '',
        password: config.password || '',
        connectTimeout: 5000,
      });

      globalMqttClient.on('connect', () => {
        isDiscoveryActive = true;
        globalMqttClient.subscribe(['HS4U/tele/#', 'shellies/#']);
        globalMqttClient.publish('HS4U/cmnd/tasmota/backlog', 'Status 8');
        globalMqttClient.on('message', (topic, message) => { handleMqttMessage(topic, message); });
        Meteor.setTimeout(() => { isDiscoveryActive = false; }, 15000);
        resolve(true);
      });

      globalMqttClient.on('error', (err) => {
        console.error("Discovery Error:", err.message);
        resolve(false);
      });

      setTimeout(() => resolve(false), 5500);
    });
  },

  async 'providers.removeInstance'(instanceId) {
    check(instanceId, String);
    return await ProvidersStatus.removeAsync(instanceId);
  },

  async 'connectors.insert'(connector) {
    check(connector, Object);
    return await Connectors.insertAsync({ ...connector, enabled: true, createdAt: new Date() });
  },

  async 'connectors.remove'(id) {
    check(id, String);
    return await Connectors.removeAsync(id);
  },

  async 'connectors.removeAll'() {
    return await Connectors.removeAsync({});
  }
});