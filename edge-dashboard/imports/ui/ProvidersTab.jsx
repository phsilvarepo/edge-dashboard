import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ProvidersStatus, ComponentDefinitions } from '/imports/api/collections';
import './Tabs.css';

export default function ProvidersTab() {
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [showDiscModal, setShowDiscModal] = useState(false);
  const [selectedSensor, setSelectedSensor] = useState(null);
  
  // States for connection verification
  const [isTesting, setIsTesting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  // Discovery Form State
  const [mqttConfig, setMqttConfig] = useState({
    brokerUrl: '', // Reset to empty for clean open
    username: '',
    password: ''
  });

  const { providers, definitions, isLoading } = useTracker(() => {
    const sub1 = Meteor.subscribe('providers_status');
    const sub2 = Meteor.subscribe('component_definitions');
    
    return {
      providers: ProvidersStatus.find({}, { sort: { id: 1 } }).fetch(),
      definitions: ComponentDefinitions.find({ type: 'provider' }).fetch(),
      isLoading: !sub1.ready() || !sub2.ready(),
    };
  });

  const handleDiscovery = () => {
    setConnectionError(null);
    setIsTesting(true);

    Meteor.call('providers.autoDiscover', mqttConfig, (err, success) => {
      setIsTesting(false);
      
      if (err || success === false) {
        setConnectionError("Error connecting. Please retry.");
      } else {
        setShowDiscModal(false);
        setIsDiscovering(true);
        setTimeout(() => setIsDiscovering(false), 15000);
      }
    });
  };

  const openModal = () => {
    setMqttConfig({ brokerUrl: '', username: '', password: '' });
    setConnectionError(null);
    setShowDiscModal(true);
  };

  const isOnline = (lastRun) => {
    if (!lastRun) return false;
    return lastRun >= new Date(Date.now() - 35000); 
  };

  const getLabel = (p) => {
    const def = definitions.find(d => d.name === p.provider);
    return def ? def.label : `${p.provider} (${p.parentId})`; 
  };

  const renderLiveValue = (data) => {
    if (!data) return 'WAITING...';
    const entries = Object.entries(data);
    if (entries.length === 0) return 'EMPTY';
    return `${entries[0][0]}: ${entries[0][1]}`;
  };

  if (isLoading) return <div className="loading-text">LINKING PROVIDER DATA...</div>;

  return (
    <div className="tab-container">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>DATA PROVIDERS</h2>
        <button 
          className={`btn-primary ${isDiscovering ? 'pulse' : ''}`} 
          onClick={openModal}
        >
          {isDiscovering ? 'SCANNING HUB...' : 'AUTO-DISCOVERY'}
        </button>
      </div>

      <div className="status-grid">
        {providers.map(p => {
          const active = isOnline(p.lastRun);
          const displayLabel = getLabel(p);

          return (
            <div className="status-card clickable" key={p._id} onClick={() => setSelectedSensor(p)}>
              <div className="status-header">
                <h4 style={{ color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {displayLabel}
                </h4>
                <div className={`pulse-dot ${active ? 'active' : ''}`}></div>
              </div>

              <div className="status-meta">
                <div className="meta-item" style={{ background: '#0d1117', padding: '6px', borderRadius: '4px', marginBottom: '8px' }}>
                  <span>LIVE DATA</span>
                  <span className="mono-text" style={{ color: active ? '#3fb950' : '#8b949e' }}>
                    {renderLiveValue(p.latestData)}
                  </span>
                </div>

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
                  <span>DRIVER</span>
                  <span className="text-dim">{p.provider}</span>
                </div>
              </div>
            </div>
          );
        })}

        {providers.length === 0 && (
          <div className="hint" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', border: '1px dashed #30363d' }}>
            NO PROVIDER SIGNALS DETECTED. CLICK CONNECT BROKER TO SCAN NETWORK.
          </div>
        )}
      </div>

      {/* --- DISCOVERY CONFIG MODAL --- */}
      {showDiscModal && (
        <div className="modal-overlay" onClick={() => !isTesting && setShowDiscModal(false)}>
          <div className="modal-content discovery-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>MQTT CONFIGURATION</h3>
              {!isTesting && <button className="close-btn" onClick={() => setShowDiscModal(false)}>×</button>}
            </div>
            
            <div className="modal-body">
              <p className="modal-subtitle">Enter your broker details to start auto-discovery</p>
              
              <div className="input-group">
                <label>Broker Address</label>
                <input 
                  type="text" 
                  className="discovery-input"
                  placeholder="eg: mqtt://10.0.200.25:1883"
                  disabled={isTesting}
                  value={mqttConfig.brokerUrl}
                  onChange={e => setMqttConfig({...mqttConfig, brokerUrl: e.target.value})}
                />
              </div>

              <div className="input-row">
                <div className="input-group">
                  <label>Username</label>
                  <input 
                    type="text" 
                    className="discovery-input"
                    placeholder="Optional"
                    disabled={isTesting}
                    value={mqttConfig.username}
                    onChange={e => setMqttConfig({...mqttConfig, username: e.target.value})}
                  />
                </div>
                <div className="input-group">
                  <label>Password</label>
                  <input 
                    type="password" 
                    className="discovery-input"
                    placeholder="Optional"
                    disabled={isTesting}
                    value={mqttConfig.password}
                    onChange={e => setMqttConfig({...mqttConfig, password: e.target.value})}
                  />
                </div>
              </div>

              {connectionError && (
                <div className="error-text" style={{ color: '#ff4d4d', marginTop: '10px', fontSize: '12px', textAlign: 'center' }}>
                  {connectionError}
                </div>
              )}

              <button 
                className={`start-scan-btn ${isTesting ? 'pulse' : ''}`} 
                onClick={handleDiscovery}
                disabled={!mqttConfig.brokerUrl || isTesting}
              >
                {isTesting ? 'Checking connection...' : 'START SCANNING'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SENSOR DETAIL POPUP --- */}
      {selectedSensor && (
        <div className="modal-overlay" onClick={() => setSelectedSensor(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedSensor.provider} INSPECTOR</h3>
              <button className="close-btn" onClick={() => setSelectedSensor(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><small>SOURCE ID:</small> <strong>{selectedSensor.parentId}</strong></p>
              <p><small>TOPIC:</small> <code className="topic-code">{selectedSensor.topic}</code></p>
              <div className="telemetry-box">
                <h5>LIVE PAYLOAD</h5>
                <pre>{JSON.stringify(selectedSensor.latestData, null, 2)}</pre>
              </div>
              <a href={selectedSensor.docs} target="_blank" className="docs-btn">📖 DOCUMENTATION</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}