import { Meteor } from 'meteor/meteor';
import { Connectors } from './collections';

Meteor.methods({
  // Add the 'async' keyword here
  async 'connectors.insert'(connector) {

    if (!connector.id) {
      throw new Meteor.Error('invalid-id', 'Connector ID is required');
    }

    // Use insertAsync and await the result
    return await Connectors.insertAsync({
      id: connector.id,
      provider: connector.provider,
      parser: connector.parser,
      consumers: connector.consumers,
      enabled: true,
      createdAt: new Date()
    });
  },
  'connectors.remove'(id) {
    check(id, String);
    Connectors.remove(id);
  },
  'connectors.removeAll'() {
    // Optional: add a check for admin permissions here
    Connectors.remove({});
  }
});