import { Mongo } from 'meteor/mongo';

//Active nodes
export const ProvidersStatus = new Mongo.Collection('providers_status');
export const ParsersStatus = new Mongo.Collection('parsers_status');
export const ConsumersStatus = new Mongo.Collection('consumers_status');
export const Connectors = new Mongo.Collection('connectors');

//Description of nodes
export const ComponentDefinitions = new Mongo.Collection('component_definitions');

//Stored providers/consumers
export const ProvidersTemplate = new Mongo.Collection('providers_template');
export const ConsumerClients = new Mongo.Collection('consumer_clients');