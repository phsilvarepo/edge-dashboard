import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import mqtt from 'mqtt';
import { Connectors, ProvidersStatus, ProvidersTemplate } from './collections';

let globalMqttClient = null;

/**
 * Logic to process incoming MQTT messages and match them against 
 * Blueprints (Templates) for auto-discovery and live updates.
 */
const handleMqttMessage = async (topic, message) => {
  try {
    const rawPayload = message.toString();
    const payload = JSON.parse(rawPayload);
    
    console.log(`\n📩 MQTT Received [${topic}]`);

    // Determine Protocol Method based on Topic Structure
    let detectedMethod = '';
    let deviceId = 'UNKNOWN';

    if (topic.startsWith('HS4U/tele/')) {
      detectedMethod = 'MQTT_TASMOTA';
      const parts = topic.split('/');
      deviceId = parts[2] || 'TASMOTA_DEV';
    } else if (topic.startsWith('shellies/')) {
      detectedMethod = 'MQTT_SHELLY';
      const parts = topic.split('/');
      deviceId = parts[1] || 'SHELLY_DEV';
    } else {
      console.log(`⚠️ Ignored Topic: ${topic}`);
      return; 
    }

    const searchArea = payload.sn ? { ...payload.sn, ...payload } : payload;
    const shortId = deviceId.replace('tasmota_', '').replace('shelly_', '').toUpperCase();

    // Check every key in the JSON
    for (const key of Object.keys(searchArea)) {
      // Skip metadata keys
      if (['Time', 'TempUnit'].includes(key)) continue;

      // Log the search
      console.log(`🔍 Checking key: "${key}" for protocol: ${detectedMethod}`);

      const template = await ProvidersTemplate.findOneAsync({ 
        name: key,
        $or: [
          { captureMethod: detectedMethod },
          { supportedMethods: detectedMethod }
        ]
      });

      if (template) {
        // Validation for Tasmota: must be a /SENSOR topic
        if (detectedMethod === 'MQTT_TASMOTA' && !topic.endsWith('/SENSOR')) {
          console.log(`⏭️ Key "${key}" found template, but skipped: Topic is not /SENSOR`);
          continue;
        }
        
        const uniqueId = `${shortId}_${key}`.toUpperCase();
        console.log(`✅ MATCH! Upserting Provider: ${uniqueId}`);

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
              latestData: JSON.stringify(searchArea[key]),
              parentId: shortId,
              docs: template.docs
            }
          }
        );
      } else {
        console.log(`❌ No template found in DB for key: "${key}" with method: ${detectedMethod}`);
      }
    }
  } catch (e) { 
    console.error("❌ MQTT Error:", e.message);
  }
};

Meteor.methods({
  async 'providers.createInstance'({ templateId, method, params }) {
    check(templateId, String);
    check(method, String);
    check(params, Object);

    const template = await ProvidersTemplate.findOneAsync(templateId);
    if (!template) throw new Meteor.Error('not-found', 'Blueprint not found');

    let computedTopic = '';
    let parentId = '';

    if (method === 'MQTT_TASMOTA') {
      computedTopic = `HS4U/tele/${params.topic}/SENSOR`;
      parentId = params.topic.toUpperCase();
    } else if (method === 'MQTT_SHELLY') {
      computedTopic = `shellies/${params.deviceId}/status`;
      parentId = params.deviceId.toUpperCase();
    }

    const instanceId = `${parentId}_${template.name}`.toUpperCase();

    if (globalMqttClient && globalMqttClient.connected) {
        globalMqttClient.subscribe(computedTopic);
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
        globalMqttClient.publish('HS4U/cmnd/tasmota/backlog', 'Status 8');
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
        globalMqttClient = tempClient;
        globalMqttClient.subscribe(['HS4U/tele/#', 'shellies/#']);
        globalMqttClient.publish('HS4U/cmnd/tasmota/backlog', 'Status 8');
        globalMqttClient.on('message', (topic, message) => { handleMqttMessage(topic, message); });
        resolve(true);
      });

      tempClient.on('error', () => {
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

  async 'connectors.insert'(connector) {
    check(connector, Object);
    if (!connector.id) throw new Meteor.Error('invalid-id', 'ID required');
    return await Connectors.insertAsync({ ...connector, enabled: true, createdAt: new Date() });
  },

  async 'connectors.remove'(id) {
    check(id, String);
    return await Connectors.removeAsync(id);
  },

  /**
   * Remove a live provider instance
   */
  async 'providers.removeInstance'(instanceId) {
    check(instanceId, String);
    
    // Optional: If you want to unsubscribe from MQTT when a provider is removed
    // you would need to check if any other providers still use that topic.
    // For now, we simply remove the record from the dashboard.
    
    return await ProvidersStatus.removeAsync(instanceId);
  },

  async 'connectors.removeAll'() {
    return await Connectors.removeAsync({});
  }
});