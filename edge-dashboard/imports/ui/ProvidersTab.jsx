import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ProvidersStatus } from '/imports/api/collections';
import './Tabs.css';

export default function ProvidersTab() {
  const providers = useTracker(() => {
    const sub = Meteor.subscribe('providers_status');
    // Using the same return pattern for consistency
    return ProvidersStatus.find().fetch();
  });

  const isOnline = (lastRun) => {
    if (!lastRun) return false;
    const threshold = new Date(Date.now() - 30000);
    return lastRun >= threshold;
  };

  return (
    <div className="tab-container">
      <div className="section-header">
        <h2>INGRESS NODES <span className="text-dim">(PROVIDERS)</span></h2>
      </div>

      <div className="status-grid">
        {providers.map(p => {
          const active = isOnline(p.lastRun);

          return (
            <div className="status-card" key={p._id}>
              <div className="status-header">
                {/* Monospace style for the Node ID */}
                <h4 style={{ color: '#58a6ff' }}>{p.id.toUpperCase()}</h4>
                <div className={`pulse-dot ${active ? 'active' : ''}`}></div>
              </div>

              <div className="status-meta">
                <div className="meta-item">
                  <span>SIGNAL STATUS</span>
                  <span style={{ color: active ? '#3fb950' : '#8b949e' }}>
                    {active ? 'STREAMING' : 'OFFLINE'}
                  </span>
                </div>
                
                <div className="meta-item">
                  <span>LAST PACKET</span>
                  <span>{p.lastRun ? p.lastRun.toLocaleTimeString() : 'WAITING...'}</span>
                </div>

                <div className="meta-item">
                  <span>INTERFACE</span>
                  <span className="text-dim">MQTT/TCP</span>
                </div>
              </div>
            </div>
          );
        })}

        {providers.length === 0 && (
          <div className="hint" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', border: '1px dashed #30363d' }}>
            NO PROVIDER SIGNALS DETECTED. INITIALIZE HARDWARE...
          </div>
        )}
      </div>
    </div>
  );
}