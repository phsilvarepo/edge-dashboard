import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import mqtt from 'mqtt';
import { Connectors, ParsersStatus, ProvidersStatus, ProvidersTemplate } from './collections';

let globalMqttClient = null;
let isDiscoveryActive = false; 

const PARSE_STRATEGY = {
  MQTT_TASMOTA: {
    getDeviceId: (input) => {
      const parts = input.split('/');
      return parts.find(p => p.toLowerCase().startsWith('tasmota')) || parts[2] || input;
    },
    getSearchArea: (payload) => (payload.sn ? { ...payload.sn, ...payload } : payload),
    fixTopic: (input) => {
      return input.toUpperCase().endsWith('/SENSOR') ? input : `${input}/SENSOR`;
    }
  },
  MQTT_SHELLY: {
    getDeviceId: (input) => {
      const parts = input.split('/');
      return parts.find(p => p.toLowerCase().includes('thermal') || p.toLowerCase().includes('shelly')) || parts[2] || parts[1] || input;
    },
    getSearchArea: (payload) => {
      // If it's a raw array, we wrap it in IMG as a fallback
      return Array.isArray(payload) ? { IMG: payload } : payload;
    },
    fixTopic: (input) => {
      return input;
    }
  }
};

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
 * MAIN HANDLER: Processes incoming MQTT packets with Heavy Logging
 */
const handleMqttMessage = async (topic, message) => {
  try {
    const rawMessage = message.toString();
    const top = topic.toUpperCase();
    const parts = topic.split('/');

    // 1. FAST EXIT: Ignore LWT/Status noise
    if (top.endsWith('/LWT') || top.endsWith('/STATE')) return;

    let payload;
    try {
      payload = JSON.parse(rawMessage);
    } catch (e) {
      payload = rawMessage; 
    }

    // --- CASE A: THERMAL CAMERA (Direct Topic Mapping) ---
    if (top.startsWith('HS4U/THERMAL/')) {
      const sensorKey = parts[3]; // e.g., "IMG", "CMD", "LWT"

      // 🎯 STRICT FILTER: Only allow "IMG" topics to be processed
      if (!sensorKey || sensorKey.toUpperCase() !== 'IMG') {
        // console.log(`⏩ Ignoring thermal sub-topic: ${sensorKey}`);
        return;
      }

      const deviceId = parts[2] || 'THERMAL_DEV';
      const shortId = deviceId.replace(/thermal_|shelly_/gi, '').toUpperCase();
      const uniqueId = `${shortId}_IMG`.toUpperCase(); // Hardcoded to IMG suffix

      // Check if we already know this camera OR if we are currently searching (Discovery)
      const existing = await ProvidersStatus.findOneAsync(uniqueId);
      if (!existing && !isDiscoveryActive) return;

      if (isDiscoveryActive && !existing) {
        console.log(`✨ Discovery: Registering New Thermal Sensor [${uniqueId}]`);
      }

      const cleanData = sanitizeKeys(payload);

      await ProvidersStatus.upsertAsync(
        { _id: uniqueId },
        {
          $set: {
            id: uniqueId,
            provider: 'THERMAL CAMERA',
            label: `Thermal Matrix`,
            captureMethod: 'MQTT_SHELLY',
            topic: topic,
            lastRun: new Date(),
            latestData: cleanData, 
            parentId: shortId,
            dataType: 'image_matrix' 
          }
        }
      );
      return; 
    }

    // --- CASE B: TASMOTA (JSON Key Search via Templates) ---
    if (top.startsWith('HS4U/TELE/')) {
      if (!top.endsWith('/SENSOR')) return;

      const deviceId = parts[2] || 'TASMOTA_DEV';
      const shortId = deviceId.replace(/tasmota_/gi, '').toUpperCase();
      
      const strategy = PARSE_STRATEGY.MQTT_TASMOTA;
      const searchArea = strategy.getSearchArea(payload);
      const keysToProcess = Object.keys(searchArea);

      for (const key of keysToProcess) {
        if (['Time', 'TempUnit'].includes(key)) continue;

        // Tasmota MUST have a template to be valid
        const template = await ProvidersTemplate.findOneAsync({ name: key });
        if (!template) continue;
        
        const uniqueId = `${shortId}_${key}`.toUpperCase();
        const existing = await ProvidersStatus.findOneAsync(uniqueId);
        
        if (!existing && !isDiscoveryActive) continue;

        await ProvidersStatus.upsertAsync(
          { _id: uniqueId },
          {
            $set: {
              id: uniqueId,
              templateId: template._id,
              provider: key,
              label: template.label,
              captureMethod: 'MQTT_TASMOTA',
              topic: topic,
              lastRun: new Date(),
              latestData: sanitizeKeys(searchArea[key]), 
              parentId: shortId,
              dataType: 'json'
            }
          }
        );
      }
    }
  } catch (e) { 
    console.error("❌ MQTT Handler Failure:", e);
  }
};

Meteor.methods({
  async 'providers.createInstance'({ templateId, method, params }) {
    console.log(`\n🚀 MANUAL LINK: Method=${method} | Template=${templateId}`);
    
    check(templateId, String);
    check(method, String);
    check(params, Object);

    const template = await ProvidersTemplate.findOneAsync(templateId);
    if (!template) throw new Meteor.Error('not-found', 'Blueprint not found');

    const strategy = PARSE_STRATEGY[method];
    if (!strategy) throw new Meteor.Error('invalid-method', 'Unknown Method');

    const inputVal = params.topic || params.deviceId;
    const computedTopic = strategy.fixTopic(inputVal);
    
    const rawId = strategy.getDeviceId(computedTopic);
    const parentId = rawId.replace(/tasmota_|shelly_|thermal_/gi, '').toUpperCase();
    const instanceId = `${parentId}_${template.name}`.toUpperCase();

    console.log(`   📍 Computed Topic: ${computedTopic}`);
    console.log(`   🆔 Instance ID: ${instanceId}`);

    const setupClient = (client) => {
        console.log(`   📡 Subscribing to: ${computedTopic}`);
        client.subscribe(computedTopic, (err) => {
            if (err) console.error("   ❌ Subscription Error:", err);
            else console.log("   ✔️ Subscription Successful");
        });
        
        if (method === 'MQTT_TASMOTA') {
          const pokeTopic = `HS4U/cmnd/${rawId}/status`;
          console.log(`   📤 Poking Tasmota: ${pokeTopic}`);
          client.publish(pokeTopic, '8');
        }
    };

    if (!globalMqttClient || !globalMqttClient.connected) {
      if (params.broker) {
        console.log(`   🔌 Opening new connection to ${params.broker}...`);
        globalMqttClient = mqtt.connect(params.broker, {
          username: params.username || '',
          password: params.pass || '', 
          connectTimeout: 5000,
        });
        
        globalMqttClient.on('connect', () => {
          console.log("   🟢 MQTT Connected");
          setupClient(globalMqttClient);
        });

        globalMqttClient.on('message', (topic, message) => { handleMqttMessage(topic, message); });
        globalMqttClient.on('error', (err) => console.error("   ❌ MQTT Socket Error:", err.message));
      }
    } else {
        console.log("   ♻️ Using existing MQTT connection.");
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
          docs: template.docs,
          dataType: template.outputType
        }
      }
    );
  },

  'providers.autoDiscover'(config) {
    check(config, { brokerUrl: String, username: Match.Optional(String), password: Match.Optional(String) });
    if (Meteor.isClient) return;

    return new Promise((resolve) => {
      console.log(`\n🔍 AUTODISCOVERY STARTING...`);
      if (globalMqttClient) globalMqttClient.end(true);

      globalMqttClient = mqtt.connect(config.brokerUrl, {
        username: config.username || '',
        password: config.password || '',
        connectTimeout: 5000,
      });

      globalMqttClient.on('connect', () => {
        isDiscoveryActive = true;
        const scanTopics = ['HS4U/tele/#', 'HS4U/thermal/#'];
        console.log(`   📡 Subscribed to scan topics: ${scanTopics.join(', ')}`);
        globalMqttClient.subscribe(scanTopics);
        globalMqttClient.publish('HS4U/cmnd/tasmota/backlog', 'Status 8');
        globalMqttClient.on('message', (topic, message) => { handleMqttMessage(topic, message); });
        
        Meteor.setTimeout(() => { 
            isDiscoveryActive = false; 
            console.log("   ⏱️ Discovery period ended.");
        }, 15000);
        resolve(true);
      });

      globalMqttClient.on('error', (err) => {
        console.error("   ❌ Discovery Broker Error:", err.message);
        resolve(false);
      });

      setTimeout(() => resolve(false), 5500);
    });
  },

  async 'providers.removeInstance'(instanceId) {
    check(instanceId, String);
    console.log(`🗑️ Removing instance: ${instanceId}`);
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
  },

  async 'parsers.removeByConnector'(connectorName) {
    check(connectorName, String);
    console.log(`🧹 Purging parser status for connector: ${connectorName}`);
    return await ParsersStatus.removeAsync({ connector: connectorName });
  },

});