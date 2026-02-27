import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ProvidersStatus, ComponentDefinitions } from '/imports/api/collections';
import './Tabs.css';

export default function ProvidersTab() {
  const { providers, definitions, isLoading } = useTracker(() => {
    const sub1 = Meteor.subscribe('providers_status');
    const sub2 = Meteor.subscribe('component_definitions');
    
    return {
      providers: ProvidersStatus.find().fetch(),
      definitions: ComponentDefinitions.find({ type: 'provider' }).fetch(),
      isLoading: !sub1.ready() || !sub2.ready(),
    };
  });

  const isOnline = (lastRun) => {
    if (!lastRun) return false;
    const threshold = new Date(Date.now() - 30000);
    return lastRun >= threshold;
  };

  // Helper to find the friendly label
  const getLabel = (providerName) => {
    const def = definitions.find(d => d.name === providerName);
    return def ? def.label : providerName; 
  };

  if (isLoading) return <div className="loading-text">LINKING PROVIDER DATA...</div>;

  return (
    <div className="tab-container">
      <div className="section-header">
        <h2>DATA PROVIDERS</h2>
      </div>

      <div className="status-grid">
        {providers.map(p => {
          const active = isOnline(p.lastRun);
          // Look up the label using the provider name (e.g., 'distanceSensor' -> 'Distance Sensor')
          const displayLabel = getLabel(p.provider || p.id);

          return (
            <div className="status-card" key={p._id}>
              <div className="status-header">
                {/* Now using displayLabel with proper letter spacing for clarity */}
                <h4 style={{ 
                  color: '#58a6ff', 
                  textTransform: 'uppercase', 
                  letterSpacing: '1px' 
                }}>
                  {displayLabel}
                </h4>
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