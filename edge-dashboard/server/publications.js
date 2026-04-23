import { Meteor } from 'meteor/meteor';
import { ProvidersStatus, ParsersStatus, ConsumersStatus, ProvidersTemplate, ConsumerClients, Connectors, ComponentDefinitions, MqttCommands} from '/imports/api/collections';

Meteor.publish('active_providers', function () {
  return ProvidersStatus.find();
});

Meteor.publish('active_parsers', function () {
  return ParsersStatus.find();
});

Meteor.publish('active_consumers', function () {
  return ConsumersStatus.find();
});

Meteor.publish('active_connectors', function () {
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

Meteor.publish('mqtt_commands', function () {
  return MqttCommands.find();
});