import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check'; // Fix 1: Add this import
import { Connectors } from './collections';

Meteor.methods({
  async 'connectors.insert'(connector) {
    // Basic validation
    if (!connector.id) {
      throw new Meteor.Error('invalid-id', 'Connector ID is required');
    }

    return await Connectors.insertAsync({
      id: connector.id,
      provider: connector.provider,
      parser: connector.parser,
      consumers: connector.consumers,
      enabled: true,
      createdAt: new Date()
    });
  },

  // Fix 2: Make this async and use removeAsync
  async 'connectors.remove'(id) {
    check(id, String); 
    return await Connectors.removeAsync(id);
  },

  // Fix 3: Make this async and use removeAsync
  async 'connectors.removeAll'() {
    // Security note: In a real app, check Meteor.userId() here
    return await Connectors.removeAsync({});
  }
});