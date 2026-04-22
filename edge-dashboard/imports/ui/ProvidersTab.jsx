import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { ProvidersStatus, ComponentDefinitions, ProvidersTemplate } from '/imports/api/collections';
import './Tabs.css';
import { useTracker } from 'meteor/react-meteor-data'

// Configuration for input fields
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
    label: 'Shelly MQTT',
    fields: [
      { id: 'broker', label: 'Broker Address', placeholder: 'eg: mqtt://10.0.200.25:1883', type: 'text' },
      { id: 'username', label: 'Broker Username', placeholder: 'Optional', type: 'text' },
      { id: 'pass', label: 'Broker Password', placeholder: 'Optional', type: 'text' },
      { id: 'topic', label: 'Full MQTT Topic', placeholder: 'eg: HS4U/thermal/thermal_CD4557/IMG', type: 'text' }
    ]
  }
};

export default function ProvidersTab() {
  // --- 1. STATES ---
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [showDiscModal, setShowDiscModal] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [mqttConfig, setMqttConfig] = useState({ brokerUrl: '', username: '', password: '' });

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 6;

  const [selectedSensor, setSelectedSensor] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  const [wizardTemplate, setWizardTemplate] = useState(null);
  const [wizardData, setWizardData] = useState({ method: '', params: {} });

  const [waitingForId, setWaitingForId] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [now, setNow] = useState(Date.now());

  // --- 2. DATA TRACKING ---
  const { providers, templates, definitions, isLoading } = useTracker(() => {
    const sub1 = Meteor.subscribe('active_providers');
    const sub2 = Meteor.subscribe('component_definitions');
    const sub3 = Meteor.subscribe('providers_template');
    
    return {
      providers: ProvidersStatus.find({}, { sort: { id: 1 } }).fetch(),
      templates: ProvidersTemplate.find({}, { sort: { name: 1 } }).fetch(),
      definitions: ComponentDefinitions.find({ type: 'provider' }).fetch(),
      isLoading: !sub1.ready() || !sub2.ready() || !sub3.ready(),
    };
  });

  // --- 3. FILTERING & PAGINATION LOGIC ---
  const filteredTemplates = templates.filter(t => 
    (t.label || t.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pageCount = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);
  const displayedTemplates = filteredTemplates.slice(
    currentPage * ITEMS_PER_PAGE, 
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm]);

  // --- 3. EFFECTS ---
  useEffect(() => {
    const heartbeat = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(heartbeat);
  }, []);

  useEffect(() => {
    if (waitingForId) {
      const found = providers.find(p => p.id === waitingForId);
      if (found) {
        setSuccessMsg(`${found.label || found.id} is now Online!`);
        setWaitingForId(null); 
        setTimeout(() => setSuccessMsg(null), 5000); 
      }
    }
  }, [providers, waitingForId]);

  // --- 4. ACTION HANDLERS ---
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

    const mqttTopic = wizardData.params.topic;
    const parts = mqttTopic.split('/');
    const rawId = parts[2] || 'UNKNOWN';
    const shortId = rawId.replace(/tasmota_|shelly_|thermal_/gi, '').toUpperCase();
    const expectedId = `${shortId}_${wizardTemplate.name}`.toUpperCase();

    const currentLabel = wizardTemplate.label;
    setWizardTemplate(null); 
    setSuccessMsg(`⏳ Linking ${currentLabel}... Waiting for first packet.`);
    setWaitingForId(expectedId); 

    Meteor.call('providers.createInstance', {
      templateId: wizardTemplate._id,
      method: wizardData.method,
      params: wizardData.params
    }, (err) => {
      if (err) {
        alert("Error: " + err.reason);
        setSuccessMsg(null);
        setWaitingForId(null);
      }
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

  const handleClearAll = () => {
    if (window.confirm("⚠️ This will disconnect ALL active providers. Continue?")) {
      Meteor.call('providers.removeAll', (err) => {
        if (err) alert("Failed to clear: " + err.reason);
      });
    }
  };

  const handleDiscovery = () => {
    setConnectionError(null);
    setIsTesting(true);
    Meteor.call('providers.autoDiscover', mqttConfig, (err) => {
      setIsTesting(false);
      if (err) { 
        setConnectionError("Failed to start discovery task."); 
      } else { 
        setShowDiscModal(false); 
        setIsDiscovering(true); 
        setTimeout(() => setIsDiscovering(false), 15000); 
      }
    });
  };

  const isOnline = (lastRun) => lastRun && lastRun >= new Date(now - 35000);
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
    if (Array.isArray(val)) return `${displayKey}: [${val.length}x${val[0]?.length || 0} Matrix]`;
    return `${displayKey}: ${val}`;
  };

  if (isLoading) return <div className="loading-text">LINKING PROVIDER DATA...</div>;

  return (
    <div className="tab-container">
      {successMsg && (
        <div style={{ background: waitingForId ? '#af8600' : '#238636', color: 'white', padding: '12px', borderRadius: '6px', marginBottom: '20px', textAlign: 'center', fontWeight: 'bold' }}>
          {successMsg}
        </div>
      )}

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>DATA PROVIDERS</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          {providers.length > 0 && (
            <button 
              className="btn-primary" // Added this class
              onClick={handleClearAll} 
              style={{ 
                background: '#da3633', 
                color: '#ffffff', 
                border: 'none', 
                padding: '0 15px', 
                borderRadius: '4px', 
                cursor: 'pointer', 
                fontWeight: 'bold',
                height: '34px' // Match height of the discovery button
              }}
            >
              CLEAR ALL
            </button>
          )}
          <button className={`btn-primary ${isDiscovering ? 'pulse' : ''}`} onClick={() => {
            setMqttConfig({ brokerUrl: '', username: '', password: '' });
            setConnectionError(null);
            setShowDiscModal(true);
          }}>
            {isDiscovering ? 'SCANNING HUB...' : 'AUTO-DISCOVERY'}
          </button>
        </div>
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
                <div className="meta-item"><span>SIGNAL STATUS</span><span style={{ color: active ? '#3fb950' : '#8b949e' }}>{active ? 'STREAMING' : 'OFFLINE'}</span></div>
                <div className="meta-item"><span>LAST PACKET</span><span>{p.lastRun ? p.lastRun.toLocaleTimeString() : 'WAITING...'}</span></div>
                <div className="meta-item"><span>DRIVER</span><span className="text-dim">{p.provider}</span></div>
              </div>
            </div>
          );
        })}
        {providers.length === 0 && (
          <div className="provider-empty-state-simple">
            <h3>No Providers Active</h3>
            <p>Use Auto-Discovery to scan your hub or manually link a template below.</p>
          </div>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #30363d', margin: '40px 0' }} />

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>PROVIDER TEMPLATES</h2>
        <div className="search-container" style={{ 
          position: 'relative', 
          width: '100%',       
          maxWidth: '300px',   
          marginLeft: '10px'   
        }}>
          <input 
            type="text" 
            placeholder="Search templates..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="discovery-input"
             maxLength={20}
            style={{ 
              width: '100%', 
              padding: '8px 12px', 
              fontSize: '13px',
              boxSizing: 'border-box'
            }}
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="template-list">
        {displayedTemplates.map(t => (
          <div key={t._id} className="template-item clickable" onClick={() => setSelectedTemplate(t)}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <strong className="template-title" style={{ color: '#c9d1d9' }}>{t.label || t.name}</strong>
                {t.supportedMethods?.map(m => (
                  <span key={m} className="tag" style={{ fontSize: '9px', background: '#238636', padding: '2px 6px', borderRadius: '10px', color: 'white' }}>
                    {m.replace('MQTT_', '')}
                  </span>
                ))}
              </div>
              <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#8b949e' }}>{t.description || 'No description.'}</p>
            </div>
            <button className="add-instance-btn" onClick={(e) => { e.stopPropagation(); handleStartWizard(t); }}>
              +
            </button>
          </div>
        ))}

        {filteredTemplates.length === 0 && (
          <div className="hint" style={{ textAlign: 'center', padding: '20px' }}>
            No templates match "{searchTerm}"
          </div>
        )}
      </div>

      {/* Pagination Controls - Container is ALWAYS here to preserve height */}
      <div className="pagination" style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: '16px', 
        marginTop: '30px',
        padding: '10px 0',
        borderTop: '1px solid #30363d',
        minHeight: '45px',
        opacity: pageCount > 1 ? 1 : 0,
        pointerEvents: pageCount > 1 ? 'auto' : 'none'
      }}>
        <button 
          disabled={currentPage === 0} 
          onClick={() => setCurrentPage(p => p - 1)}
          className="page-nav-btn"
        >
          ← <span style={{ marginLeft: '6px' }}>Prev</span>
        </button>

        <div style={{ 
          fontSize: '12px', 
          color: '#8b949e', 
          letterSpacing: '1px',
          textTransform: 'uppercase',
          fontWeight: '500'
        }}>
          <span style={{ color: '#c9d1d9' }}>{currentPage + 1}</span> 
          <span style={{ margin: '0 8px', opacity: 0.5 }}>/</span> 
          {pageCount || 1} 
        </div>

        <button 
          disabled={currentPage >= pageCount - 1} 
          onClick={() => setCurrentPage(p => p + 1)}
          className="page-nav-btn"
        >
          <span style={{ marginRight: '6px' }}>Next</span> →
        </button>
      </div>

      {/* --- MODALS --- */}

      {/* Template Info Modal */}
      {selectedTemplate && (
        <div className="modal-overlay" onClick={() => setSelectedTemplate(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{selectedTemplate.label} DETAILS</h3><button className="close-btn" onClick={() => setSelectedTemplate(null)}>×</button></div>
            <div className="modal-body">
               <p>{selectedTemplate.description}</p>
               <div className="input-group"><label>DRIVER NAME</label><div className="mono-text">{selectedTemplate.name}</div></div>
               <button className="start-scan-btn" style={{ marginTop: '20px' }} onClick={() => { handleStartWizard(selectedTemplate); setSelectedTemplate(null); }}>FIND SENSOR</button>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Modal */}
      {wizardTemplate && (
        <div className="modal-overlay">
          <div className="modal-content discovery-modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header"><h3>LINK {wizardTemplate.label}</h3><button className="close-btn" onClick={() => setWizardTemplate(null)}>×</button></div>
            <div className="modal-body">
              <div className="input-group">
                <label>Acquisition Method</label>
                {(wizardTemplate.supportedMethods?.length > 1) ? (
                   <select className="discovery-input" value={wizardData.method} onChange={e => setWizardData({...wizardData, method: e.target.value, params: {}})}>
                    {wizardTemplate.supportedMethods.map(m => <option key={m} value={m}>{CAPTURE_CONFIGS[m]?.label || m}</option>)}
                  </select>
                ) : (
                  <div style={{ padding: '10px', background: '#0d1117', borderRadius: '4px', color: '#58a6ff', border: '1px solid #30363d' }}>{CAPTURE_CONFIGS[wizardData.method]?.label || wizardData.method}</div>
                )}
              </div>
              {CAPTURE_CONFIGS[wizardData.method]?.fields.map(field => (
                <div key={field.id} className="input-group" style={{ marginTop: '15px' }}>
                  <label>{field.label}</label>
                  <input type={field.type} className="discovery-input" placeholder={field.placeholder} value={wizardData.params[field.id] || ''} onChange={e => setWizardData({...wizardData, params: { ...wizardData.params, [field.id]: e.target.value }})} />
                </div>
              ))}
              <button className="start-scan-btn" style={{ marginTop: '25px' }} onClick={handleCreateInstance}>CREATE LIVE INSTANCE</button>
            </div>
          </div>
        </div>
      )}

      {/* Sensor Inspector Modal */}
      {selectedSensor && (
        <div className="modal-overlay" onClick={() => setSelectedSensor(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>{selectedSensor.provider} INSPECTOR</h3><button className="close-btn" onClick={() => setSelectedSensor(null)}>×</button></div>
            <div className="modal-body">
              <p><small>SOURCE ID:</small> <strong>{selectedSensor.parentId}</strong></p>
              <p><small>METHOD:</small> <strong>{selectedSensor.captureMethod}</strong></p>
              <p><small>TOPIC:</small> <code className="topic-code">{selectedSensor.topic}</code></p>
              <div className="telemetry-box" style={{ background: '#0d1117', padding: '10px', borderRadius: '4px', margin: '15px 0', maxHeight: '200px', overflowY: 'auto', border: '1px solid #30363d' }}>
                <h5 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#8b949e', position: 'sticky', top: 0, background: '#0d1117' }}>LIVE PAYLOAD</h5>
                <pre style={{ fontSize: '12px', color: '#3fb950', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                  {JSON.stringify(selectedSensor.latestData, null, 2)}
                </pre>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <a href={selectedSensor.docs} target="_blank" className="docs-btn" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>📖 DOCS</a>
                <button onClick={() => handleRemoveInstance(selectedSensor._id)} style={{ background: '#da3633', border: 'none', color: 'white', padding: '0 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>REMOVE</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discovery Modal */}
      {showDiscModal && (
        <div className="modal-overlay" onClick={() => !isTesting && setShowDiscModal(false)}>
          <div className="modal-content discovery-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>MQTT CONFIGURATION</h3>{!isTesting && <button className="close-btn" onClick={() => setShowDiscModal(false)}>×</button>}</div>
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