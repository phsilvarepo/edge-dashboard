// server/main.js
import { Meteor } from 'meteor/meteor';
import './publications';
import '/imports/api/methods';
import { ComponentDefinitions } from '/imports/api/collections';
import { ProvidersTemplate } from '/imports/api/collections';

// Define the function
const seedDefinitions = async () => {
  // Meteor 3.0 uses .countAsync() or .find().countAsync()
  const count = await ComponentDefinitions.find().countAsync();
  
  if (count > 0) {
    console.log('Definitions already exist, skipping seed.');
    return;
  }

  const definitions = [
    /*{
      type: 'provider_template',
      name: 'random',
      label: 'Random Number Generator',
      outputs: ['simple_json'],
      values: [
        readings: 12123,
        unit: Celsius,
      ]
    },*/
    {
      type: 'provider',
      name: 'random',
      label: 'Random Number Generator',
      outputs: ['simple_json'],
      parameters: []
    },
    {
      type: 'provider',
      name: 'humiditySensor',
      label: 'Humidity Sensor',
      outputs: ['simple_json'],
      parameters: []
    },
    {
      type: 'provider',
      name: 'lightSensor',
      label: 'Light Sensor',
      outputs: ['simple_json'],
      parameters: []
    },
    {
      type: 'provider',
      name: 'soundSensor',
      label: 'Sound Sensor',
      outputs: ['simple_json'],
      parameters: []
    },
    {
      type: 'provider',
      name: 'distanceSensor',
      label: 'Distance Sensor',
      outputs: ['simple_json'],
      parameters: []
    },
    {
      type: 'provider',
      name: 'SPLBoard',
      label: 'SPL Sensor Board',
      outputs: ['simple_json'],
      parameters: []
    },
    {
      type: 'provider',
      name: 'mqtt_provider',
      label: 'MQTT Broker',
      outputs: ['simple_json'],
      parameters: []
    },
    /*{
      type: 'provider',
      name: 'mqtt_provider',
      label: 'MQTT Broker',
      outputs: ['raw_json'],
      parameters: [
        { name: 'brokerUrl', type: 'text', label: 'Broker URL (mqtt://...)' },
        { name: 'topic', type: 'text', label: 'Subscription Topic' },
        { name: 'username', type: 'text', label: 'Username' },
        { name: 'password', type: 'password', label: 'Password' }
      ]
    },*/
    {
      type: 'parser',
      name: 'passthrough',
      label: 'Passthrough (No Change)',
      inputs: ['simple_json', 'raw_json'],
      outputs: ['processed_data'],
      parameters: []
    },
    {
      type: 'parser',
      name: 'filter_json',
      label: 'Filter JSON',
      inputs: ['simple_json', 'raw_json'],
      outputs: ['processed_data'],
      parameters: []
    },
    {
      type: 'parser',
      name: 'filter_csv',
      label: 'Filter CSV',
      inputs: ['simple_json', 'raw_json'],
      outputs: ['processed_data'],
      parameters: []
    },
    {
      type: 'consumer',
      name: 'console',
      label: 'System Console Log',
      inputs: ['processed_data'],
      parameters: []
    },
    {
      type: 'consumer',
      name: 'meteorMonitor',
      label: 'Meteor Dashboard Monitor',
      inputs: ['processed_data'],
      parameters: []
    },
    {
      type: 'consumer',
      name: 'mqtt',
      label: 'MQTT Forwarder (Publisher)',
      inputs: ['processed_data'],
      parameters: [
        { name: 'mqtt_url', type: 'text', label: 'Remote MQTT URL' },
        { name: 'mqtt_topic', type: 'text', label: 'Base Topic' },
        { name: 'mqtt_username', type: 'text', label: 'Username' },
        { name: 'mqtt_password', type: 'password', label: 'Password' },
        { name: 'mqtt_qos', type: 'number', label: 'QoS (0, 1, 2)', default: 0 }
      ]
    }
  ];

  for (const def of definitions) {
    await ComponentDefinitions.insertAsync(def);
  }
  console.log('✅ Component definitions seeded');
};

Meteor.startup(async () => {
  console.log('Server starting...');
  
  // Seed general definitions
  await seedDefinitions();
  
  // Seed specific Provider Blueprints (Templates)
  // Fix: Use countAsync() directly on the cursor
  const templateCount = await ProvidersTemplate.find().countAsync();

  if (templateCount === 0) {
    console.log("🌱 Seeding ProvidersTemplate...");

    // Inside your Meteor.startup block in server/main.js
    // Inside your Meteor.startup block
  
    // server/main.js - inside Meteor.startup

    const templates = [
      {
        name: 'ADS1115',
        label: 'Precision ADC (ADS1115)',
        docs: 'https://tasmota.github.io/docs/ADS1115/',
        supportedMethods: ['MQTT_TASMOTA', 'MQTT_SHELLY'],
        outputType: 'json',
        description: '4-Channel 16-bit Analog to Digital Converter for high-accuracy voltage sensing.'
      },
      {
        name: 'ANALOG',
        label: 'Analog Input (A0/A1)',
        docs: 'https://tasmota.github.io/docs/GPIO-Definitions/#analog-inputs',
        supportedMethods: ['MQTT_TASMOTA', 'MQTT_SHELLY'],
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
        name: 'SHELLY_UNI',
        label: 'Shelly Uni System',
        docs: 'https://shelly-api-docs.shelly.cloud/gen1/#shelly-uni',
        supportedMethods: ['MQTT_SHELLY'],
        outputType: 'json',
        description: 'System-level telemetry for the Shelly Uni Smart Implant.'
      }
    ];

    // Use upsert so it updates existing ones and adds new ones
    for (const t of templates) {
      await ProvidersTemplate.upsertAsync({ name: t.name }, { $set: t });
    }
    console.log("✅ Provider Blueprints synchronized.");
  }
});