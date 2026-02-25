import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { ProvidersStatus } from '/imports/api/collections';

export default function ProvidersTab() {
  const providers = useTracker(() => {
    const sub = Meteor.subscribe('providers_status');
    if (!sub.ready()) return [];
    return ProvidersStatus.find().fetch();
  });

  const threshold = new Date(Date.now() - 30000);

  return (
    <div>
      <h2>Active Providers</h2>
      <ul>
        {providers.map(p => {
          const isActive = p.lastRun >= threshold;

          return (
            <li key={p._id}>
              {p.id} | 
              Last Run: {p.lastRun?.toString()} | 
              Status: {isActive ? '🟢 Active' : '🔴 Inactive'}
            </li>
          );
        })}
      </ul>
    </div>
  );
}