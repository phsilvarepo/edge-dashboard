import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import mqtt from 'mqtt';
import * as Minio from 'minio'; // Ensure 'npm install minio' has been run
import { 
  Connectors, 
  ParsersStatus, 
  ProvidersStatus, 
  ProvidersTemplate, 
  ConsumerClients,
  ConsumersStatus 
} from './collections';

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
      return Array.isArray(payload) ? { IMG: payload } : payload;
    },
    fixTopic: (input) => {
      const clean = input.toUpperCase();
      if (clean.startsWith('HS4U/THERMAL/') && !clean.endsWith('/IMG')) {
        return `${input}/IMG`;
      }
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

const handleMqttMessage = async (topic, message) => {
  try {
    const rawMessage = message.toString();
    const top = topic.toUpperCase();
    const parts = topic.split('/');

    if (top.endsWith('/LWT') || top.endsWith('/STATE')) return;

    let payload;
    try { payload = JSON.parse(rawMessage); } catch (e) { payload = rawMessage; }

    if (top.startsWith('HS4U/THERMAL/')) {
      const sensorKey = parts[3]; 
      if (!sensorKey || sensorKey.toUpperCase() !== 'IMG') return;

      const deviceId = PARSE_STRATEGY.MQTT_SHELLY.getDeviceId(topic);
      const shortId = deviceId.replace(/thermal_|shelly_/gi, '').toUpperCase();
      const uniqueId = `${shortId}_THERMAL CAMERA`.toUpperCase(); 

      const existing = await ProvidersStatus.findOneAsync(uniqueId);
      if (!existing && !isDiscoveryActive) return;

      const cleanData = sanitizeKeys(payload);

      await ProvidersStatus.upsertAsync(
        { _id: uniqueId },
        {
          $set: {
            id: uniqueId,
            provider: 'THERMAL CAMERA',
            label: existing ? existing.label : `Thermal Matrix`,
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

    if (top.startsWith('HS4U/TELE/')) {
      if (!top.endsWith('/SENSOR')) return;

      const deviceId = PARSE_STRATEGY.MQTT_TASMOTA.getDeviceId(topic);
      const shortId = deviceId.replace(/tasmota_/gi, '').toUpperCase();
      
      const strategy = PARSE_STRATEGY.MQTT_TASMOTA;
      const searchArea = strategy.getSearchArea(payload);

      for (const key of Object.keys(searchArea)) {
        if (['Time', 'TempUnit'].includes(key)) continue;

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
    check(templateId, String);
    check(method, String);
    check(params, Object);

    const template = await ProvidersTemplate.findOneAsync(templateId);
    if (!template) throw new Meteor.Error('not-found', 'Template not found');

    const strategy = PARSE_STRATEGY[method];
    const computedTopic = strategy.fixTopic(params.topic || params.deviceId);
    const rawDeviceId = strategy.getDeviceId(computedTopic);
    const parentId = rawDeviceId.replace(/tasmota_|shelly_|thermal_/gi, '').toUpperCase();
    
    const instanceId = `${parentId}_${template.name}`.toUpperCase();

    const setupClient = (client) => {
        client.subscribe(computedTopic);
        if (method === 'MQTT_TASMOTA') {
          client.publish(`HS4U/cmnd/${rawDeviceId}/status`, '8');
        }
    };

    if (!globalMqttClient || !globalMqttClient.connected) {
      globalMqttClient = mqtt.connect(params.broker, {
        username: params.username || '',
        password: params.pass || '',
        connectTimeout: 5000,
      });
      globalMqttClient.on('connect', () => setupClient(globalMqttClient));
      globalMqttClient.on('message', (t, m) => handleMqttMessage(t, m));
    } else {
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
          latestData: { status: "Linked, awaiting data..." },
          parentId: parentId,
          dataType: template.outputType || 'json'
        }
      }
    );
  },

  'providers.autoDiscover'(config) {
    check(config, { brokerUrl: String, username: Match.Optional(String), password: Match.Optional(String) });
    return new Promise((resolve) => {
      if (globalMqttClient) globalMqttClient.end(true);
      globalMqttClient = mqtt.connect(config.brokerUrl, { ...config, connectTimeout: 5000 });

      globalMqttClient.on('connect', () => {
        isDiscoveryActive = true;
        globalMqttClient.subscribe(['HS4U/tele/#', 'HS4U/thermal/#']);
        globalMqttClient.on('message', (t, m) => handleMqttMessage(t, m));
        Meteor.setTimeout(() => { isDiscoveryActive = false; }, 15000);
        resolve(true);
      });
      globalMqttClient.on('error', () => resolve(false));
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
  },

  async 'parsers.removeByConnector'(connectorName) {
    check(connectorName, String);
    return await ParsersStatus.removeAsync({ connector: connectorName });
  },

  async 'consumers.saveClient'({ templateName, params, label }) {
    check(templateName, String);
    check(params, Object);
    check(label, String);
    const clientConfigId = `${templateName}_${label.replace(/\s+/g, '_')}`.toUpperCase();
    return await ConsumerClients.upsertAsync(
      { _id: clientConfigId },
      { $set: { id: clientConfigId, templateName, label, params, updatedAt: new Date() } }
    );
  },

  async 'consumers.removeClient'(clientId) {
    check(clientId, String);
    return await ConsumerClients.removeAsync(clientId);
  },

  async 'consumers.removeByConnector'(connectorName) {
    check(connectorName, String);
    return await ConsumersStatus.removeAsync({ connector: connectorName });
  },

  async 'consumers.testConnection'({ type, params }) {
    check(type, String);
    check(params, Object);

    const runTest = () => new Promise((resolve) => {
      // 1. Setup a global timeout to catch "hanging" connections (wrong ports)
      const timeoutId = setTimeout(() => {
        resolve({ success: false, message: "Connection timed out. Check your address and port." });
      }, 5000); // 5 second limit

      const endTest = (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      };

      // --- MQTT CONNECTION TEST ---
      if (type.includes('mqtt')) {
        const client = mqtt.connect(params.brokerUrl || params.mqtt_url, {
          username: params.username || params.mqtt_username,
          password: params.password || params.mqtt_password,
          connectTimeout: 4000,
          reconnectPeriod: 0,
        });

        client.on('connect', () => { 
          client.end(); 
          endTest({ success: true }); 
        });

        client.on('error', (err) => { 
          client.end(); 
          if (err.code === 'ENOTFOUND') endTest({ success: false, message: "Can't find that Broker address." });
          else if (err.code === 'ECONNREFUSED') endTest({ success: false, message: "Connection refused (check port)." });
          else endTest({ success: false, message: "MQTT Connection Failed." });
        });
      } 

      // --- MINIO / S3 CONNECTION TEST ---
      else if (type.includes('minio') || type.includes('s3')) {
        try {
          const endPoint = params.minIO_url || params.endPoint || '';
          if (!endPoint) return endTest({ success: false, message: "Endpoint URL is required." });

          const MinioClient = Minio.Client || Minio;
          if (typeof MinioClient !== 'function') {
            throw new Error("Minio library initialization failed.");
          }

          const minioClient = new MinioClient({
            endPoint: endPoint.replace('http://', '').replace('https://', ''),
            port: parseInt(params.minIO_port || params.port) || 9000,
            useSSL: params.useSSL === 'true' || params.useSSL === true || false,
            accessKey: params.minIO_username || params.accessKey,
            secretKey: params.minIO_password || params.secretKey
          });

          minioClient.listBuckets((err) => {
            if (err) {
              if (err.code === 'ENOTFOUND') {
                endTest({ success: false, message: "Can't find that address. Check the URL/Host." });
              } 
              else if (err.code === 'InvalidAccessKeyId' || err.code === 'AccessDenied') {
                endTest({ success: false, message: "Can't find that username." });
              } 
              else if (err.code === 'SignatureDoesNotMatch') {
                endTest({ success: false, message: "Invalid password." });
              } 
              else if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
                endTest({ success: false, message: "Connection refused. Check if the port is correct." });
              } 
              else {
                endTest({ success: false, message: `Storage Error: ${err.code}` });
              }
            } else {
              endTest({ success: true });
            }
          });
        } catch (e) {
          endTest({ success: false, message: `Configuration error: ${e.message}` });
        }
      } 
      else {
        endTest({ success: true });
      }
    });

    return await runTest();
  }
});