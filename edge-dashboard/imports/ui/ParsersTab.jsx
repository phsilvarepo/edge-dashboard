import React from 'react';
import { useTracker } from 'meteor/react-meteor-data';
import { Parsers } from '/imports/api/collections';

export default function ParsersTab() {
  const parsers = useTracker(() => {
    Meteor.subscribe('parsers');
    return Parsers.find().fetch();
  });

  return (
    <div>
      <h2>Active Parsers</h2>
      <ul>
        {parsers.map(p => (
          <li key={p._id}>
            {p.id} | File: {p.file} | Enabled: {p.enabled ? 'Yes' : 'No'}
          </li>
        ))}
      </ul>
    </div>
  );
}