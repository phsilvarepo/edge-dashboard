// server/main.js
import { Meteor } from 'meteor/meteor';
import './publications';
import '/imports/api/methods';
import { ComponentDefinitions } from '/imports/api/collections';

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
  await seedDefinitions();
});