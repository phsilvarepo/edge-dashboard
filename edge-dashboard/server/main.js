import { Meteor } from 'meteor/meteor';
import './publications';
import { ComponentDefinitions, ProvidersTemplate } from '/imports/api/collections';
import '/imports/api/methods.js';

const seedDefinitions = async () => {

  const count = await ComponentDefinitions.find().countAsync();
  
  if (count > 0) {
    console.log('Definitions already exist, skipping seed.');
    return;
  }

  const definitions = [
    {
      type: 'provider',
      name: 'mqtt_provider',
      label: 'MQTT Broker',
      outputs: ['json', 'image_matrix'],
      parameters: []
    },
    {
      type: 'parser',
      name: 'passthrough',
      label: 'Passthrough',
      inputs: ['json'],
      outputs: ['json'],
      parameters: [],
      code: `(data, connector, options) => { 
        return data; 
      }`
    },
    {
      type: 'parser',
      name: 'convert_Image',
      label: 'Convert to Image',
      inputs: ['image_matrix'],
      outputs: ['jpeg'],
      parameters: [],
      code: `async (data, connector, options) => {
        const sharp = require('sharp');
        try {
          if (!Array.isArray(data) || !Array.isArray(data[0])) return data;
          const rows = data.length;
          const cols = data[0].length;
          const flatData = data.flat();
          const min = Math.min(...flatData);
          const max = Math.max(...flatData);
          const range = max - min || 1;
          const pixels = Uint8Array.from(flatData.map(v => ((v - min) / range) * 255));
          const imageBuffer = await sharp(pixels, { raw: { width: cols, height: rows, channels: 1 } })
            .resize(640, 480, { kernel: 'nearest' })
            .jpeg().toBuffer();
          return { isImage: true, buffer: imageBuffer, mime: 'image/jpeg', stats: { min, max } };
        } catch (err) { console.error("Parser Image Error:", err); return data; }
      }`
    },
    {
      type: 'consumer',
      name: 'console',
      label: 'System Console Log',
      inputs: ['json'],
      parameters: [],
      hidden: true,
      code: `{
        send: (data, connector, options) => {
          console.log('\\n----------------------------------------------------------------------');
          console.log(new Date().toString());
          console.log('Connector:', connector.name);
          console.log('-------------------- Data --------------------');
          let length = 0;
          Object.keys(data).forEach(key => { if (key.length >= length) length = key.length + 1; });
          Object.entries(data).forEach(([key, value]) => {
            console.log((key + ':').padEnd(length), typeof value === 'object' ? JSON.stringify(value) : value);
          });
          console.log('----------------------------------------------');
        }
      }`
    },
    {
      type: 'parser',
      name: 'json_to_csv',
      label: 'Convert JSON to CSV',
      inputs: ['json'],
      outputs: ['csv'],
      parameters: [],
      code: `(data, connector, options) => {
        const keys = Object.keys(data);
        const values = Object.values(data);
        return keys.join(',') + '\\n' + values.join(',');
      }`
    },
    {
      type: 'consumer',
      name: 'minioBucket',
      label: 'MinIO Bucket',
      inputs: ['csv', 'json', 'jpeg'],
      parameters: [
        { name: 'minIO_url', type: 'text', label: 'MinIO URL' },
        { name: 'minIO_port', type: 'number', label: 'Port number' },
        { name: 'minIO_username', type: 'text', label: 'MinIO username' },
        { name: 'minIO_password', type: 'password', label: 'MinIO password' },
        { name: 'minIO_bucket', type: 'text', label: 'Bucket name' },
      ],
      code: `{
        send: async (data, connector, options) => {
          const Minio = require('minio');
          const minioClient = new Minio.Client({
            endPoint: options.minIO_url || 'localhost',
            port: Number(options.minIO_port) || 9000,
            useSSL: false,
            accessKey: options.minIO_username,
            secretKey: options.minIO_password
          });
          const bucketName = options.minIO_bucket || 'sensor-data';
          const timestamp = Date.now();
          let uploadPayload, fileName;
          let metaData = { 'X-Connector-ID': connector.name, 'X-Upload-Timestamp': timestamp.toString() };

          if (data && data.isImage && data.buffer) {
            uploadPayload = data.buffer;
            fileName = \`\${connector.name}/\${timestamp}.jpg\`;
            metaData['Content-Type'] = 'image/jpeg';
            if (data.stats) {
              metaData['X-Thermal-Min'] = data.stats.min.toString();
              metaData['X-Thermal-Max'] = data.stats.max.toString();
            }
          } else {
            uploadPayload = Buffer.from(JSON.stringify(data, null, 2));
            fileName = \`\${connector.name}/\${timestamp}.json\`;
            metaData['Content-Type'] = 'application/json';
          }

          try {
            if (!(await minioClient.bucketExists(bucketName))) await minioClient.makeBucket(bucketName);
            await minioClient.putObject(bucketName, fileName, uploadPayload, uploadPayload.length, metaData);
            console.log(\`[MinIO] Uploaded: \${fileName} (\${uploadPayload.length} bytes)\`);
          } catch (err) { console.error('❌ MinIO Error:', err.message); }
        }
      }`
    },
    {
      type: 'consumer',
      name: 'mqtt',
      label: 'MQTT Forwarder',
      inputs: ['json'],
      parameters: [
        { name: 'mqtt_url', type: 'text', label: 'Remote MQTT URL' },
        { name: 'mqtt_topic', type: 'text', label: 'Base Topic' },
        { name: 'mqtt_username', type: 'text', label: 'Username' },
        { name: 'mqtt_password', type: 'password', label: 'Password' },
        { name: 'mqtt_qos', type: 'number', label: 'QoS (0, 1, 2)', default: 0 }
      ],
      code: `{
        send: async (data, connector, options) => {
          const mqtt = require('mqtt');
          const client = mqtt.connect(options.mqtt_url, {
            username: options.mqtt_username,
            password: options.mqtt_password
          });
          client.on('connect', () => {
            client.publish(options.mqtt_topic, JSON.stringify(data), { qos: options.mqtt_qos || 0 }, () => client.end());
          });
        }
      }`
    }
  ];

  for (const def of definitions) {
    await ComponentDefinitions.insertAsync(def);
  }
  console.log('✅ Component definitions seeded');
};

Meteor.startup(async () => {
  console.log('Server starting...');
  
  await seedDefinitions();

  const templateCount = await ProvidersTemplate.find().countAsync();

  if (templateCount === 0) {
    console.log("🌱 Seeding ProvidersTemplate...");

    const templates = [
      {
        name: 'ADS1115',
        label: 'Precision ADC (ADS1115)',
        docs: 'https://tasmota.github.io/docs/ADS1115/',
        supportedMethods: ['MQTT_TASMOTA'],
        outputType: 'json',
        description: '4-Channel 16-bit Analog to Digital Converter for high-accuracy voltage sensing.'
      },
      {
        name: 'ANALOG',
        label: 'Analog Input (A0/A1)',
        docs: 'https://tasmota.github.io/docs/GPIO-Definitions/#analog-inputs',
        supportedMethods: ['MQTT_TASMOTA',],
        outputType: 'json',
        description: 'Generic analog voltage monitoring via onboard ADC pins.'
      },
      {
        name: 'SR04',
        label: 'Ultrasonic Distance (HC-SR04)',
        docs: 'https://tasmota.github.io/docs/HC-SR04/',
        supportedMethods: ['MQTT_TASMOTA'],
        outputType: 'json',
        description: 'Non-contact distance measurement using ultrasonic pulses.'
      },
      {
        name: 'SEN5X',
        label: 'Particulate Matter (SEN5x)',
        docs: 'https://sensirion.com/products/catalog/SEN55/',
        supportedMethods: ['MQTT_TASMOTA'],
        outputType: 'json',
        description: 'Environmental node for PM1, PM2.5, PM10, VOC, and NOx monitoring.'
      },
      {
        name: 'LTR329',
        label: 'Ambient Light (LTR-329)',
        docs: 'https://tasmota.github.io/docs/LTR-303-329-390/',
        supportedMethods: ['MQTT_TASMOTA'],
        outputType: 'json',
        description: 'High dynamic range digital light sensor for Visible and IR spectrum.'
      },
      {
        name: 'SPL',
        label: 'Sound Pressure Level (SPL)',
        docs: 'https://tasmota.github.io/docs/Sound-Pressure-Level/',
        supportedMethods: ['MQTT_TASMOTA'],
        outputType: 'json',
        description: 'Acoustic noise monitoring (LAEq, LASmax) for environment analysis.'
      },
      {
        name: 'SCD40',
        label: 'CO2 Sensor (SCD4x)',
        docs: 'https://tasmota.github.io/docs/SCD40/',
        supportedMethods: ['MQTT_TASMOTA'],
        outputType: 'json',
        description: 'True CO2, Temperature, and Humidity sensor using photoacoustic technology.'
      },
      {
        name: 'THERMAL CAMERA',
        label: 'Thermal Camera',
        docs: 'https://shelly-api-docs.shelly.cloud/gen1/#shelly-uni',
        supportedMethods: ['MQTT_SHELLY'],
        outputType: 'image_matrix',
        description: 'Thermal camera using the Shelly firmware.'
      }
    ];

    for (const t of templates) {
      await ProvidersTemplate.upsertAsync({ name: t.name }, { $set: t });
    }
    console.log("✅ Provider Blueprints synchronized.");
  }
});