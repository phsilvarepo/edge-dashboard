import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { Consumers } from '/imports/api/collections';

export default function ConsumersTab() {
  const consumers = useTracker(() => {
    Meteor.subscribe('consumers');
    return Consumers.find().fetch();
  });

  return (
    <div>
      <h2>Active Consumers</h2>
      <ul>
        {consumers.map(p => (
          <li key={p._id}>
            {p.id} | File: {p.file} | Enabled: {p.enabled ? 'Yes' : 'No'}
          </li>
        ))}
      </ul>
    </div>
  );
}