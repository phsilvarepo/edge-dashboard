import { Mongo } from 'meteor/mongo';

//Active nodes
export const ProvidersStatus = new Mongo.Collection('active_providers');
export const ParsersStatus = new Mongo.Collection('active_parsers');
export const ConsumersStatus = new Mongo.Collection('active_consumers');
export const Connectors = new Mongo.Collection('active_connectors');

//Description of nodes
export const ComponentDefinitions = new Mongo.Collection('component_definitions');

//Stored providers could be integrated in AAS?
export const ProvidersTemplate = new Mongo.Collection('providers_template');

//Stored consumers
export const ConsumerClients = new Mongo.Collection('consumer_clients');

//Commands to trigger backend
export const MqttCommands = new Mongo.Collection('mqtt_commands');