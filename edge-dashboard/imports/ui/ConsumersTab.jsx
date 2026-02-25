import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { ConsumersStatus } from '/imports/api/collections';

export default function ConsumersTab() {
  const consumers = useTracker(() => {
    const sub = Meteor.subscribe('consumers_status');
    if (!sub.ready()) return [];
    return ConsumersStatus.find().fetch();
  });

  const threshold = new Date(Date.now() - 30000);

  return (
    <div>
      <h2>Active Consumers</h2>
      <ul>
        {consumers.map(p => {
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