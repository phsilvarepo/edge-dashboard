import { Mongo } from 'meteor/mongo';

export const ProvidersStatus = new Mongo.Collection('providers_status');
export const ParsersStatus = new Mongo.Collection('parsers_status');
export const ConsumersStatus = new Mongo.Collection('consumers_status');
export const ConnectorsStatus = new Mongo.Collection('connectors_status');

export const Connectors = new Mongo.Collection('connectors');
export const ComponentDefinitions = new Mongo.Collection('component_definitions');