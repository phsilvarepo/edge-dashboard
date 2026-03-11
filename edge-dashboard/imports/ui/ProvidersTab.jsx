import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { ProvidersStatus, ComponentDefinitions, ProvidersTemplate } from '/imports/api/collections';
import './Tabs.css';
import { useTracker } from 'meteor/react-meteor-data';

// Schema for required parameters per method
const CAPTURE_CONFIGS = {
  MQTT_TASMOTA: {
    label: 'Tasmota MQTT',
    fields: [
      { id: 'broker', label: 'Broker Address', placeholder: 'eg: mqtt://10.0.200.25:1883', type: 'text' },
      { id: 'username', label: 'Broker Username', placeholder: 'Optional', type: 'text' },
      { id: 'pass', label: 'Broker Password', placeholder: 'Optional', type: 'text' },
      { id: 'topic', label: 'Base Topic', placeholder: 'eg: HS4U/tele/tasmota_838A04/SENSOR', type: 'text' }
    ]
  },
  MQTT_SHELLY: {
    label: 'Generic / Thermal / Shelly', // Updated Label
    fields: [
      { id: 'broker', label: 'Broker Address', placeholder: 'eg: mqtt://10.0.200.25:1883', type: 'text' },
      { id: 'username', label: 'Broker Username', placeholder: 'Optional', type: 'text' },
      { id: 'pass', label: 'Broker Password', placeholder: 'Optional', type: 'text' },
      { id: 'topic', label: 'Full MQTT Topic', placeholder: 'eg: HS4U/thermal/thermal_CD4557/IMG', type: 'text' } // Clarified Placeholder
    ]
  }
};

export default function ProvidersTab() {
  // Discovery & Global States
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [showDiscModal, setShowDiscModal] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [mqttConfig, setMqttConfig] = useState({ brokerUrl: '', username: '', password: '' });

  // Inspector & Info States
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  // Creation Wizard States
  const [wizardTemplate, setWizardTemplate] = useState(null);
  const [wizardData, setWizardData] = useState({ method: '', params: {} });

  const { providers, templates, definitions, isLoading } = useTracker(() => {
    const sub1 = Meteor.subscribe('providers_status');
    const sub2 = Meteor.subscribe('component_definitions');
    const sub3 = Meteor.subscribe('providers_template');
    
    return {
      providers: ProvidersStatus.find({}, { sort: { id: 1 } }).fetch(),
      templates: ProvidersTemplate.find({}, { sort: { name: 1 } }).fetch(),
      definitions: ComponentDefinitions.find({ type: 'provider' }).fetch(),
      isLoading: !sub1.ready() || !sub2.ready() || !sub3.ready(),
    };
  });

  const handleStartWizard = (t) => {
    const methods = t.supportedMethods || [];
    const defaultMethod = methods.length > 0 ? methods[0] : 'MQTT_TASMOTA';
    setWizardTemplate(t);
    setWizardData({ method: defaultMethod, params: {} });
  };

  const handleCreateInstance = () => {
    const config = CAPTURE_CONFIGS[wizardData.method];
    const missing = config.fields.find(f => !wizardData.params[f.id]);
    if (missing) return alert(`Please enter ${missing.label}`);

    // Ensure we are passing the topic correctly regardless of the method label
    Meteor.call('providers.createInstance', {
      templateId: wizardTemplate._id,
      method: wizardData.method,
      params: wizardData.params
    }, (err) => {
      if (err) alert("Error: " + err.reason);
      else setWizardTemplate(null);
    });
  };

  const handleRemoveInstance = (id) => {
    if (window.confirm("Are you sure you want to remove this live provider?")) {
      Meteor.call('providers.removeInstance', id, (err) => {
        if (err) alert(err.reason);
        else setSelectedSensor(null);
      });
    }
  };

  const handleDiscovery = () => {
    setConnectionError(null);
    setIsTesting(true);
    Meteor.call('providers.autoDiscover', mqttConfig, (err, success) => {
      setIsTesting(false);
      if (err || success === false) { 
        setConnectionError("Error connecting. Please check URL and credentials."); 
      } else { 
        setShowDiscModal(false); 
        setIsDiscovering(true); 
        setTimeout(() => setIsDiscovering(false), 15000); 
      }
    });
  };

  const isOnline = (lastRun) => lastRun && lastRun >= new Date(Date.now() - 35000);
  
  const getLabel = (p) => {
    const def = definitions.find(d => d.name === p.provider);
    return def ? def.label : `${p.provider} (${p.parentId})`; 
  };

  const renderLiveValue = (data) => {
    if (!data) return 'WAITING...';
    
    const entries = Object.entries(data);
    if (entries.length === 0) return 'EMPTY';
    
    let [key, val] = entries[0];
    const displayKey = key.replace(/_/g, '.');

    // Logic for Thermal Arrays: Show dimensions instead of raw data
    if (Array.isArray(val)) {
      const rows = val.length;
      const cols = val[0]?.length || 0;
      return `${displayKey}: [${rows}x${cols} Matrix]`;
    }
    
    // Standard logic for numbers/strings
    return `${displayKey}: ${val}`;
  };

  if (isLoading) return <div className="loading-text">LINKING PROVIDER DATA...</div>;

  return (
    <div className="tab-container">
      {/* --- ACTIVE PROVIDERS SECTION --- */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>DATA PROVIDERS</h2>
        <button className={`btn-primary ${isDiscovering ? 'pulse' : ''}`} onClick={() => {
          setMqttConfig({ brokerUrl: '', username: '', password: '' });
          setConnectionError(null);
          setShowDiscModal(true);
        }}>
          {isDiscovering ? 'SCANNING HUB...' : 'AUTO-DISCOVERY'}
        </button>
      </div>

      <div className="status-grid">
        {providers.map(p => {
          const active = isOnline(p.lastRun);
          return (
            <div className="status-card clickable" key={p._id} onClick={() => setSelectedSensor(p)}>
              <div className="status-header">
                <h4 style={{ color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '1px' }}>{getLabel(p)}</h4>
                <div className={`pulse-dot ${active ? 'active' : ''}`}></div>
              </div>
              
              <div className="status-meta">
                <div className="meta-item" style={{ background: '#0d1117', padding: '6px', borderRadius: '4px', marginBottom: '8px' }}>
                  <span>{active ? 'LIVE DATA' : 'LAST DATA'}</span>
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

      <hr style={{ border: 'none', borderTop: '1px solid #30363d', margin: '40px 0' }} />

      {/* --- PROVIDER TEMPLATES SECTION --- */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>PROVIDER TEMPLATES</h2>
        <button className="btn-secondary" style={{ fontSize: '12px' }}>+ NEW TEMPLATE</button>
      </div>
      
      <div className="template-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {templates.map(t => (
          <div key={t._id} className="template-item clickable" onClick={() => setSelectedTemplate(t)} style={{ 
            background: '#161b22', border: '1px solid #30363d', padding: '15px', borderRadius: '6px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <strong style={{ color: '#c9d1d9' }}>{t.label || t.name}</strong>
                {t.supportedMethods && t.supportedMethods.map(m => (
                  <span key={m} className="tag" style={{ fontSize: '9px', background: '#238636', padding: '2px 6px', borderRadius: '10px', color: 'white' }}>
                    {m.replace('MQTT_', '')}
                  </span>
                ))}
              </div>
              <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#8b949e' }}>{t.description || 'No description provided.'}</p>
            </div>
            <button 
              className="add-instance-btn"
              onClick={(e) => { e.stopPropagation(); handleStartWizard(t); }}
              style={{ background: '#238636', border: 'none', color: 'white', borderRadius: '4px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '20px' }}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {/* --- WIZARD CONFIG MODAL --- */}
      {wizardTemplate && (
        <div className="modal-overlay">
          <div className="modal-content discovery-modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>LINK {wizardTemplate.label}</h3>
              <button className="close-btn" onClick={() => setWizardTemplate(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Acquisition Method</label>
                {(wizardTemplate.supportedMethods && wizardTemplate.supportedMethods.length > 1) ? (
                   <select 
                    className="discovery-input"
                    value={wizardData.method}
                    onChange={e => setWizardData({...wizardData, method: e.target.value, params: {}})}
                  >
                    {wizardTemplate.supportedMethods.map(m => (
                      <option key={m} value={m}>{CAPTURE_CONFIGS[m]?.label || m}</option>
                    ))}
                  </select>
                ) : (
                  <div style={{ padding: '10px', background: '#0d1117', borderRadius: '4px', color: '#58a6ff', border: '1px solid #30363d' }}>
                    {CAPTURE_CONFIGS[wizardData.method]?.label || wizardData.method}
                  </div>
                )}
              </div>

              {CAPTURE_CONFIGS[wizardData.method]?.fields.map(field => (
                <div key={field.id} className="input-group" style={{ marginTop: '15px' }}>
                  <label>{field.label}</label>
                  <input 
                    type={field.type}
                    className="discovery-input"
                    placeholder={field.placeholder}
                    value={wizardData.params[field.id] || ''}
                    onChange={e => setWizardData({
                      ...wizardData, 
                      params: { ...wizardData.params, [field.id]: e.target.value }
                    })}
                  />
                </div>
              ))}

              <button className="start-scan-btn" style={{ marginTop: '25px' }} onClick={handleCreateInstance}>
                CREATE LIVE INSTANCE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SENSOR DETAIL POPUP (INSPECTOR) --- */}
      {selectedSensor && (
        <div className="modal-overlay" onClick={() => setSelectedSensor(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedSensor.provider} INSPECTOR</h3>
              <button className="close-btn" onClick={() => setSelectedSensor(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><small>SOURCE ID:</small> <strong>{selectedSensor.parentId}</strong></p>
              <p><small>METHOD:</small> <strong>{selectedSensor.captureMethod}</strong></p>
              <p><small>TOPIC:</small> <code className="topic-code">{selectedSensor.topic}</code></p>
              
              <div className="telemetry-box" style={{ background: '#0d1117', padding: '10px', borderRadius: '4px', margin: '15px 0' }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#8b949e' }}>LIVE PAYLOAD</h5>
                <pre style={{ fontSize: '12px', color: '#3fb950' }}>{JSON.stringify(selectedSensor.latestData, null, 2)}</pre>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <a href={selectedSensor.docs} target="_blank" className="docs-btn" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>📖 DOCS</a>
                <button 
                  onClick={() => handleRemoveInstance(selectedSensor._id)}
                  style={{ background: '#da3633', border: 'none', color: 'white', padding: '0 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  REMOVE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- BLUEPRINT INFO POPUP --- */}
      {selectedTemplate && (
        <div className="modal-overlay" onClick={() => setSelectedTemplate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>BLUEPRINT: {selectedTemplate.label}</h3>
              <button className="close-btn" onClick={() => setSelectedTemplate(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><small>NAME:</small> <strong>{selectedTemplate.name}</strong></p>
              <p style={{ color: '#8b949e', marginTop: '15px' }}>{selectedTemplate.description}</p>
              <a href={selectedTemplate.docs} target="_blank" className="docs-btn" style={{ display: 'block', textAlign: 'center', marginTop: '20px' }}>📖 VIEW DOCUMENTATION</a>
            </div>
          </div>
        </div>
      )}

      {/* --- DISCOVERY CONFIG MODAL --- */}
      {showDiscModal && (
        <div className="modal-overlay" onClick={() => !isTesting && setShowDiscModal(false)}>
          <div className="modal-content discovery-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>MQTT CONFIGURATION</h3>
              {!isTesting && <button className="close-btn" onClick={() => setShowDiscModal(false)}>×</button>}
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Broker Address</label>
                <input type="text" className="discovery-input" placeholder="e.g. mqtt://192.168.1.50:1883" disabled={isTesting} value={mqttConfig.brokerUrl} onChange={e => setMqttConfig({...mqttConfig, brokerUrl: e.target.value})}/>
              </div>
              <div className="input-row" style={{ display: 'flex', gap: '10px' }}>
                <div className="input-group" style={{ flex: 1 }}><label>Username</label><input type="text" className="discovery-input" placeholder="Optional" disabled={isTesting} value={mqttConfig.username} onChange={e => setMqttConfig({...mqttConfig, username: e.target.value})}/></div>
                <div className="input-group" style={{ flex: 1 }}><label>Password</label><input type="password" className="discovery-input" placeholder="Optional" disabled={isTesting} value={mqttConfig.password} onChange={e => setMqttConfig({...mqttConfig, password: e.target.value})}/></div>
              </div>
              {connectionError && <div className="error-text" style={{ color: '#ff4d4d', marginTop: '10px', fontSize: '12px', textAlign: 'center' }}>{connectionError}</div>}
              <button className={`start-scan-btn ${isTesting ? 'pulse' : ''}`} onClick={handleDiscovery} disabled={!mqttConfig.brokerUrl || isTesting}>
                {isTesting ? 'Checking connection...' : 'START SCANNING'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}