// server/main.js
import { Meteor } from 'meteor/meteor';
import { ProvidersStatus, ParsersStatus, ConsumersStatus, ConnectorsStatus } from '/imports/api/collections';
//import './serviceConnector';
import './publications';

Meteor.startup(() => {
  console.log('Server started');
});