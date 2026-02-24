// server/main.js
import { Meteor } from 'meteor/meteor';
import { Providers, Parsers, Consumers } from '/imports/api/collections';
//import './serviceConnector';
import './publications';

Meteor.startup(() => {
  console.log('Server started');
});