import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ParsersStatus } from '/imports/api/collections';
import './Tabs.css';

export default function ParsersTab() {
  const parsers = useTracker(() => {
    const sub = Meteor.subscribe('parsers_status');
    return ParsersStatus.find().fetch();
  });

  // Check if signal was received in the last 30 seconds
  const isHealthy = (lastRun) => {
    if (!lastRun) return false;
    const threshold = new Date(Date.now() - 30000);
    return lastRun >= threshold;
  };

  return (
    <div className="tab-container">
      <div className="section-header">
        <h2>DATA PARSERS</h2>
      </div>

      <div className="status-grid">
        {parsers.map(p => {
          const healthy = isHealthy(p.lastRun);

          return (
            <div className="status-card" key={p._id}>
              <div className="status-header">
                <h4>
                  {p.id.toUpperCase()} 
                  <span className="text-header-dim">
                    ({p.connector})
                  </span>
                </h4>
                <div className={`pulse-dot ${healthy ? 'active' : ''}`}></div>
              </div>

              <div className="status-meta">
                <div className="meta-item">
                  <span>PROCESSING</span>
                  <span style={{ color: healthy ? '#3fb950' : '#8b949e' }}>
                    {healthy ? 'ACTIVE' : 'IDLE'}
                  </span>
                </div>
                
                <div className="meta-item">
                  <span>LAST CYCLE</span>
                  <span>{p.lastRun ? p.lastRun.toLocaleTimeString() : 'N/A'}</span>
                </div>

                <div className="meta-item">
                  <span>VERSION</span>
                  <span className="text-dim">v1.0.2-edge</span>
                </div>
              </div>
            </div>
          );
        })}

        {parsers.length === 0 && (
          <div className="provider-empty-state-simple">
            <h3>No Parsers Active</h3>
            <p>The processing engine is idle. Go to Pipelines tab to deploy real-time parsing.</p>
          </div>
        )}
      </div>
    </div>
  );
}