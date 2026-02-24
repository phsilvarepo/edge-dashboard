import { Meteor } from 'meteor/meteor';
import { Providers, Parsers, Consumers } from '/imports/api/collections';

Meteor.publish('providers', function () {
  return Providers.find();
});

Meteor.publish('parsers', function () {
  return Parsers.find();
});

Meteor.publish('consumers', function () {
  return Consumers.find();
});