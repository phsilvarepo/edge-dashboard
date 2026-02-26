import { Meteor } from 'meteor/meteor';
import { ProvidersStatus, ParsersStatus, ConsumersStatus, ConnectorsStatus } from '/imports/api/collections';
import { Connectors } from '../imports/api/collections';
import { ComponentDefinitions } from '/imports/api/collections';

Meteor.publish('providers_status', function () {
  return ProvidersStatus.find();
});

Meteor.publish('parsers_status', function () {
  return ParsersStatus.find();
});

Meteor.publish('consumers_status', function () {
  return ConsumersStatus.find();
});

Meteor.publish('connectors_status', function () {
  return ConnectorsStatus.find();
});

Meteor.publish('connectors', function () {
  return Connectors.find();
});

Meteor.publish('component_definitions', function () {
  return ComponentDefinitions.find();
});