import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import mqtt from 'mqtt';
import * as Minio from 'minio';
import { Connectors, ParsersStatus, ProvidersStatus, ProvidersTemplate, ConsumerClients, ConsumersStatus, MqttCommands} from './collections';

Meteor.methods({
  //Method to remove Provider from collection
  async 'providers.removeInstance'(instanceId) {
    check(instanceId, String);
    return await ProvidersStatus.removeAsync(instanceId);
  },

  //Method to add Connector to collection
  async 'connectors.insert'(connector) {
    check(connector, Object);
    return await Connectors.insertAsync({ ...connector, enabled: true, createdAt: new Date() });
  },

  //Method to remove Connector from collection
  async 'connectors.remove'(id) {
    check(id, String);
    return await Connectors.removeAsync(id);
  },

  //Method to all Connector from collection
  async 'connectors.removeAll'() {
    return await Connectors.removeAsync({});
  },

  //Method remove Parser based on specific Connector
  async 'parsers.removeByConnector'(connectorName) {
    check(connectorName, String);
    return await ParsersStatus.removeAsync({ connector: connectorName });
  },

  //Add consumer to collection to store useful Consumers
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

  // Remove client from collection
  async 'consumers.removeClient'(clientId) {
    check(clientId, String);
    return await ConsumerClients.removeAsync(clientId);
  },

  //Remove Consumer based on a specific Connector
  async 'consumers.removeByConnector'(connectorName) {
    check(connectorName, String);
    return await ConsumersStatus.removeAsync({ connector: connectorName });
  },

  //Check Consumers connection 
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
  },

  //Method to add flag worker to perform auto Discovery
  async 'providers.autoDiscover'(config) {
    console.log("📡 [Server] Method 'providers.autoDiscover' called with:", config);
    
    try {
      check(config, {
        brokerUrl: String,
        username: Match.Maybe(String),
        password: Match.Maybe(String)
      });
      console.log("📋 [Server] Validation passed.");

      const docId = await MqttCommands.insertAsync({
        type: 'DISCOVERY',
        params: config,
        status: 'pending',
        createdAt: new Date()
      });
      
      console.log("💾 [Server] Command inserted into DB. Doc ID:", docId);
      return docId;
    } catch (e) {
      console.error("🔥 [Server] Method Failure:", e);
      throw new Meteor.Error('500', e.message);
    }
  },

  //Method to add flag worker to create Sensor
  'providers.createInstance'({ templateId, method, params }) {
    return MqttCommands.insertAsync({
      type: 'CREATE_INSTANCE',
      data: { templateId, method, params },
      status: 'pending',
      createdAt: new Date()
    });
  },

  //Method to remove all Providers
  async 'providers.removeAll'() {
    return await ProvidersStatus.removeAsync({});
  }
});