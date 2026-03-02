import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import mqtt from 'mqtt';
import { Connectors, ProvidersStatus } from './collections';

// 1. Keep the client outside the method so it persists
let globalMqttClient = null;

const getDocsLink = (driver) => {
  const links = {
    'ADS1115': 'https://tasmota.github.io/docs/ADS1115/',
    'SR04': 'https://tasmota.github.io/docs/HC-SR04/',
    'SCD40': 'https://tasmota.github.io/docs/SCD40/',
    'ANALOG': 'https://tasmota.github.io/docs/ADC/',
    'BATTERY': 'https://tasmota.github.io/docs/Power-Monitoring-Calibration/'
  };
  return links[driver] || 'https://tasmota.github.io/docs/Peripherals/';
};

// Helper function to handle the incoming messages
const handleMqttMessage = (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const parts = topic.split('/');
    const idPart = parts.find(p => p.includes('tasmota') || p.length > 10) || 'unknown';
    const shortId = idPart.replace('tasmota_', '').slice(-6).toUpperCase();
    const drivers = ['ADS1115', 'SR04', 'SCD40', 'SCD30', 'BME280', 'ANALOG', 'BATTERY'];
    const searchArea = data.sn ? { ...data.sn, ...data } : data;

    Object.keys(searchArea).forEach(async (key) => {
      if (drivers.includes(key)) {
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
                docs: getDocsLink(key)
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
  // --- CONNECTOR MANAGEMENT ---
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

  // --- PERSISTENT AUTO-DISCOVERY WITH VERIFICATION ---
  'providers.autoDiscover'(config) {
    check(config, {
      brokerUrl: String,
      username: Match.Optional(String),
      password: Match.Optional(String),
    });

    if (Meteor.isClient) return;

    return new Promise((resolve) => {
      // 1. Detect if the address is actually different from the current connection
      const currentUrl = globalMqttClient?.options?.href || "";
      const isDifferentAddress = !currentUrl.includes(config.brokerUrl);

      // 2. If already connected to the SAME address, just poke and return success
      if (globalMqttClient && globalMqttClient.connected && !isDifferentAddress) {
        console.log("📡 Already connected to this broker. Re-poking...");
        globalMqttClient.publish('tasmota/cmnd/backlog', 'Status 8');
        globalMqttClient.publish('cmnd/tasmota/Status', '8');
        return resolve(true);
      }

      // 3. If address is different OR we are disconnected, we must perform a fresh test
      const mqttOptions = {
        username: config.username || '',
        password: config.password || '',
        connectTimeout: 5000,
        reconnectPeriod: 10000, 
      };

      // Force close existing client so the new (potentially wrong) address can be tested fairly
      if (globalMqttClient) {
        console.log("🔄 Changing broker. Closing previous connection...");
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
        globalMqttClient.subscribe('#');
        globalMqttClient.publish('tasmota/cmnd/backlog', 'Status 8');
        globalMqttClient.publish('cmnd/tasmota/Status', '8');

        globalMqttClient.on('message', (topic, message) => {
          handleMqttMessage(topic, message);
        });
        
        resolve(true);
      });

      tempClient.on('error', (err) => {
        if (isFinished) return;
        isFinished = true;
        console.error("❌ MQTT Connection Failed:", err.message);
        tempClient.end(true);
        resolve(false);
      });

      // Safety timeout for unresponsive IPs
      setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        console.log("⚠️ MQTT Connection Timeout.");
        tempClient.end(true);
        resolve(false);
      }, 5500);
    });
  },
});