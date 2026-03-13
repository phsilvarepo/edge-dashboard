import { Meteor } from 'meteor/meteor';
import { ProvidersStatus, ParsersStatus, ConsumersStatus, ProvidersTemplate, ConsumerClients, Connectors, ComponentDefinitions} from '/imports/api/collections';

Meteor.publish('providers_status', function () {
  return ProvidersStatus.find();
});

Meteor.publish('parsers_status', function () {
  return ParsersStatus.find();
});

Meteor.publish('consumers_status', function () {
  return ConsumersStatus.find();
});

Meteor.publish('connectors', function () {
  return Connectors.find();
});

Meteor.publish('component_definitions', function () {
  return ComponentDefinitions.find();
});

Meteor.publish('providers_template', function () {
  return ProvidersTemplate.find();
});

Meteor.publish('consumer_clients', function () {
  return ConsumerClients.find();
});