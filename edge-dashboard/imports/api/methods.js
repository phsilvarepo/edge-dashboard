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
    console.log(`\n📩 INCOMING MQTT [${topic}]`);
    
    let payload;
    try {
      payload = JSON.parse(rawMessage);
    } catch (e) {
      console.log(`   ❌ Failed to parse JSON: ${e.message.substring(0, 50)}...`);
      return; 
    }

    let detectedMethod = '';
    let deviceId = 'UNKNOWN';
    let sensorKeyFromTopic = null;
    
    const top = topic.toUpperCase();
    const parts = topic.split('/');

    // 1. PREFIX DETECTION LOGIC
    if (top.startsWith('HS4U/TELE/')) {
      detectedMethod = 'MQTT_TASMOTA';
      deviceId = parts[2] || 'TASMOTA_DEV';
      console.log(`   🔍 Detected: TASMOTA | DeviceId: ${deviceId}`);
    } 
    else if (top.startsWith('HS4U/THERMAL/')) {
      detectedMethod = 'MQTT_SHELLY';
      deviceId = parts[2] || 'THERMAL_DEV';
      sensorKeyFromTopic = parts[3]; // e.g. "IMG"
      console.log(`   🔍 Detected: HS4U THERMAL | DeviceId: ${deviceId} | PathKey: ${sensorKeyFromTopic}`);
    } 
    else if (top.startsWith('SHELLIES/')) {
      detectedMethod = 'MQTT_SHELLY';
      deviceId = parts[1] || 'SHELLY_DEV';
      console.log(`   🔍 Detected: SHELLY NATIVE | DeviceId: ${deviceId}`);
    } 
    else {
      console.log(`   ⏩ Ignored Prefix: ${topic}`);
      return; 
    }

    const strategy = PARSE_STRATEGY[detectedMethod];
    
    // 2. SEARCH AREA PREP
    const searchArea = sensorKeyFromTopic 
      ? { [sensorKeyFromTopic]: payload } 
      : strategy.getSearchArea(payload);
    
    const keysToProcess = Object.keys(searchArea);
    console.log(`   📦 Search Area Keys: [${keysToProcess.join(', ')}]`);

    const shortId = deviceId.replace(/tasmota_|shelly_|thermal_/gi, '').toUpperCase();

    // 3. TEMPLATE MATCHING
    for (const key of keysToProcess) {
      if (['Time', 'TempUnit'].includes(key)) continue;

      console.log(`   🧐 Looking for template for key: "${key}"...`);
      const template = await ProvidersTemplate.findOneAsync({ 
        name: key,
        supportedMethods: { $in: ['MQTT_TASMOTA', 'MQTT_SHELLY'] } 
      });

      if (!template) {
        console.log(`   ⚠️  No template found in DB with name: "${key}"`);
        continue;
      }

      // Tasmota specific validation
      if (detectedMethod === 'MQTT_TASMOTA' && !top.endsWith('/SENSOR')) {
        console.log(`   ⏩ Tasmota key "${key}" ignored because topic doesn't end in /SENSOR`);
        continue;
      }
      
      const uniqueId = `${shortId}_${key}`.toUpperCase();
      console.log(`   🎯 Match found! UniqueId: ${uniqueId}`);

      const existingInstance = await ProvidersStatus.findOneAsync(uniqueId);
      
      if (!existingInstance && !isDiscoveryActive) {
        console.log(`   🚫 Instance not found in DB and Discovery is OFF. Dropping packet.`);
        continue;
      }

      if (isDiscoveryActive && !existingInstance) {
        console.log(`   ✨ Discovery ACTIVE: Creating new provider status for ${uniqueId}`);
      }

      const cleanData = sanitizeKeys(searchArea[key]);

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
      console.log(`   ✅ DB Updated successfully for ${uniqueId}`);
    }
  } catch (e) { 
    console.error("❌ MQTT Handler Total Failure:", e);
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
          docs: template.docs
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
        const scanTopics = ['HS4U/tele/#', 'HS4U/thermal/#', 'shellies/#'];
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

  'parsers.removeByConnector'(connectorName) {
    check(connectorName, String);
    return ParsersStatus.remove({ connector: connectorName });
  },

});