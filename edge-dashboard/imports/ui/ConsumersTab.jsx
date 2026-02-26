import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ConsumersStatus } from '/imports/api/collections';
import './Tabs.css';

export default function ConsumersTab() {
  const consumers = useTracker(() => {
    const sub = Meteor.subscribe('consumers_status');
    return ConsumersStatus.find().fetch();
  });

  // Helper to check if status is within the last 30 seconds
  const isOnline = (lastRun) => {
    if (!lastRun) return false;
    const threshold = new Date(Date.now() - 30000);
    return lastRun >= threshold;
  };

  return (
    <div className="tab-container">
      <div className="section-header">
        <h2>SINK STATUS <span className="text-dim">(CONSUMERS)</span></h2>
      </div>

      <div className="status-grid">
        {consumers.map(c => {
          const active = isOnline(c.lastRun);

          return (
            <div className="status-card" key={c._id}>
              <div className="status-header">
                <h4>{c.id.toUpperCase()}</h4>
                <div className={`pulse-dot ${active ? 'active' : ''}`}></div>
              </div>

              <div className="status-meta">
                <div className="meta-item">
                  <span>STATE</span>
                  <span style={{color: active ? '#3fb950' : '#ff4d4d'}}>
                    {active ? 'OPERATIONAL' : 'STANDBY'}
                  </span>
                </div>
                <div className="meta-item">
                  <span>LAST SYNC</span>
                  <span>{c.lastRun ? c.lastRun.toLocaleTimeString() : 'NEVER'}</span>
                </div>
              </div>
            </div>
          );
        })}
        {consumers.length === 0 && <p className="hint">Waiting for consumer signals...</p>}
      </div>
    </div>
  );
}