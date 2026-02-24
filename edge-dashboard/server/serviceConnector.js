import { Meteor } from 'meteor/meteor';
//import { Mongo } from 'meteor/mongo';
const connector = require('service-connector');

// Collections
import { Providers, Parsers, Consumers } from '/imports/api/collections';

Meteor.startup(() => {
  Meteor.setInterval(async () => {
    // Run connectors
    await connector.run();

    // Read config.json dynamically
    const config = require('../../config.json');

    // Update Providers
    Object.entries(config.providers).forEach(([id, p]) => {
      Providers.upsert({ id }, {
        id,
        enabled: p.enabled,
        file: p.file,
        lastSeen: new Date()
      });
    });

    // Update Parsers
    Object.entries(config.parsers).forEach(([id, p]) => {
      Parsers.upsert({ id }, {
        id,
        file: p.file,
        lastSeen: new Date()
      });
    });

    // Update Consumers
    Object.entries(config.consumers).forEach(([id, c]) => {
      Consumers.upsert({ id }, {
        id,
        enabled: c.enabled,
        file: c.file,
        lastSeen: new Date()
      });
    });

  }, 10000);
});