import { Mongo } from 'meteor/mongo';

export const ProvidersStatus = new Mongo.Collection('providers_status');
export const ParsersStatus = new Mongo.Collection('parsers_status');
export const ConsumersStatus = new Mongo.Collection('consumers_status');