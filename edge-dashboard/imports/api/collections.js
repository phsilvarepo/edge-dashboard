import { Mongo } from 'meteor/mongo';

export const Providers = new Mongo.Collection('providers');
export const Parsers = new Mongo.Collection('parsers');
export const Consumers = new Mongo.Collection('consumers');