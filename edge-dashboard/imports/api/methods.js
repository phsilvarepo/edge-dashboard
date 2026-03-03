import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import mqtt from 'mqtt';
import { Connectors, ProvidersStatus } from './collections';

let globalMqttClient = null;

// Returns documentation if known, otherwise returns the Llama placeholder
const getDocsLink = (driver) => {
  const links = {
    'ADS1115': 'https://tasmota.github.io/docs/ADS1115/',
    'SR04': 'https://tasmota.github.io/docs/HC-SR04/',
    'SCD40': 'https://tasmota.github.io/docs/SCD40/',
    'SCD30': 'https://tasmota.github.io/docs/SCD30/',
    'BME280': 'https://tasmota.github.io/docs/BME280/',
    'ANALOG': 'https://tasmota.github.io/docs/ADC/',
    'BATTERY': 'https://tasmota.github.io/docs/Power-Monitoring-Calibration/'
  };
  
  // Placeholder for any dynamic sensor not in the list above
  return links[driver] || 'https://www.llama.com/docs/placeholder'; 
};

const handleMqttMessage = (topic, message) => {
  // STRICT FILTER: Only process topics that start with HS4U/tele/ AND end with /SENSOR
  if (!topic.startsWith('HS4U/tele/') || !topic.endsWith('/SENSOR')) return;

  try {
    const data = JSON.parse(message.toString());
    const parts = topic.split('/');
    
    const idPart = parts.find(p => p.includes('tasmota') || p.length > 10) || 'unknown';
    const shortId = idPart.replace('tasmota_', '').slice(-6).toUpperCase();

    const searchArea = data.sn ? { ...data.sn, ...data } : data;

    // Keys to ignore because they aren't sensors
    const ignoreKeys = ['Time', 'TempUnit', 'Uptime', 'Heap', 'SleepMode', 'Sleep', 'LoadAvg', 'MqttCount', 'Berry'];

    Object.keys(searchArea).forEach(async (key) => {
      // 1. Filter out metadata and ensure value is an object (Tasmota sensors are objects)
      if (!ignoreKeys.includes(key) && typeof searchArea[key] === 'object' && searchArea[key] !== null) {
        
        const docLink = getDocsLink(key);
        const uniqueId = `${shortId}_${key}`.toUpperCase();
        const sensorValue = searchArea[key];

        try {
          await ProvidersStatus.upsertAsync(
            { _id: uniqueId },
            {
              $set: {
                id: uniqueId,
                provider: key,
                topic: topic,
                lastRun: new Date(),
                latestData: sensorValue,
                parentId: shortId,
                docs: docLink
              }
            }
          );
        } catch (dbErr) {
          console.error(`❌ DB Error: ${dbErr.message}`);
        }
      }
    });
  } catch (e) { /* Not JSON */ }
};

Meteor.methods({
  async 'connectors.insert'(connector) {
    check(connector, Object);
    if (!connector.id) throw new Meteor.Error('invalid-id', 'ID required');
    return await Connectors.insertAsync({ ...connector, enabled: true, createdAt: new Date() });
  },

  async 'connectors.remove'(id) {
    check(id, String);
    return await Connectors.removeAsync(id);
  },

  async 'connectors.removeAll'() {
    return await Connectors.removeAsync({});
  },

  'providers.autoDiscover'(config) {
    check(config, {
      brokerUrl: String,
      username: Match.Optional(String),
      password: Match.Optional(String),
    });

    if (Meteor.isClient) return;

    return new Promise((resolve) => {
      const currentUrl = globalMqttClient?.options?.href || "";
      const isDifferentAddress = !currentUrl.includes(config.brokerUrl);

      if (globalMqttClient && globalMqttClient.connected && !isDifferentAddress) {
        // Updated poke topics for HS4U structure
        globalMqttClient.publish('HS4U/cmnd/tasmota/backlog', 'Status 8');
        globalMqttClient.publish('HS4U/cmnd/tasmota/Status', '8');
        return resolve(true);
      }

      const mqttOptions = {
        username: config.username || '',
        password: config.password || '',
        connectTimeout: 5000,
        reconnectPeriod: 10000, 
      };

      if (globalMqttClient) {
        globalMqttClient.end(true); 
        globalMqttClient = null;
      }

      const tempClient = mqtt.connect(config.brokerUrl, mqttOptions);
      let isFinished = false;

      tempClient.on('connect', () => {
        if (isFinished) return;
        isFinished = true;
        console.log("✅ MQTT Connected & Verified.");
        
        globalMqttClient = tempClient;
        
        // Only subscribe to the HS4U telemetry directory
        globalMqttClient.subscribe('HS4U/tele/#');
        
        // Send discovery commands via HS4U path
        globalMqttClient.publish('HS4U/cmnd/tasmota/backlog', 'Status 8');
        globalMqttClient.publish('HS4U/cmnd/tasmota/Status', '8');

        globalMqttClient.on('message', (topic, message) => {
          handleMqttMessage(topic, message);
        });
        
        resolve(true);
      });

      tempClient.on('error', (err) => {
        if (isFinished) return;
        isFinished = true;
        tempClient.end(true);
        resolve(false);
      });

      setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        tempClient.end(true);
        resolve(false);
      }, 5500);
    });
  },
});