import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { ParsersStatus } from '/imports/api/collections';

export default function ParsersTab() {
  const parsers = useTracker(() => {
    const sub = Meteor.subscribe('parsers_status');
    if (!sub.ready()) return [];
    return ParsersStatus.find().fetch();
  });

  const threshold = new Date(Date.now() - 30000);

  return (
    <div>
      <h2>Active Parsers</h2>
      <ul>
        {parsers.map(p => {
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