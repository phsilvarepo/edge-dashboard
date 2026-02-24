import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { Providers } from '/imports/api/collections';

export default function ProvidersTab() {
  const providers = useTracker(() => {
    Meteor.subscribe('providers');
    return Providers.find().fetch();
  });

  return (
    <div>
      <h2>Active Providers</h2>
      <ul>
        {providers.map(p => (
          <li key={p._id}>
            {p.id} | File: {p.file} | Enabled: {p.enabled ? 'Yes' : 'No'}
          </li>
        ))}
      </ul>
    </div>
  );
}