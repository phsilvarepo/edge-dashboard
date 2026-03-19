import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ConsumersStatus, ComponentDefinitions, ConsumerClients } from '/imports/api/collections';
import './Tabs.css';

export default function ConsumersTab() {
  const [wizardTemplate, setWizardTemplate] = useState(null);
  const [wizardData, setWizardData] = useState({});
  const [clientLabel, setClientLabel] = useState('');
  
  // Validation States (Wizard)
  const [testStatus, setTestStatus] = useState('idle'); 
  const [testError, setTestError] = useState('');

  // Validation States (Existing Managed Clients)
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResults, setVerifyResults] = useState({});

  const { activeSinks, templates, managedClients, isLoading } = useTracker(() => {
    const h1 = Meteor.subscribe('consumers_status');
    const h2 = Meteor.subscribe('component_definitions');
    const h3 = Meteor.subscribe('consumer_clients');
    
    return {
      activeSinks: ConsumersStatus.find().fetch(),
      templates: ComponentDefinitions.find({ type: 'consumer' }).fetch(),
      managedClients: ConsumerClients.find().fetch(),
      isLoading: !h1.ready() || !h2.ready() || !h3.ready(),
    };
  });

  const isOnline = (lastRun) => lastRun && lastRun >= new Date(Date.now() - 30000);

  const isFormValid = () => {
    if (!clientLabel.trim()) return false;
    if (!wizardTemplate) return false;
    return wizardTemplate.parameters.every(param => 
      wizardData[param.name] && wizardData[param.name].toString().trim() !== ''
    );
  };

  // --- REUSABLE TEST LOGIC ---
  const performConnectionTest = (type, params, onComplete) => {
    Meteor.call('consumers.testConnection', { type, params }, (err, result) => {
      onComplete(err, result);
    });
  };

  const handleVerifyAndSave = () => {
    if (!isFormValid()) return;
    
    setTestStatus('testing');
    setTestError('');

    performConnectionTest(wizardTemplate.name, wizardData, (err, result) => {
      if (err || !result.success) {
        setTestStatus('error');
        setTestError(err?.reason || result?.message || "Connection Failed");
      } else {
        Meteor.call('consumers.saveClient', {
          templateName: wizardTemplate.name,
          label: clientLabel,
          params: wizardData
        }, (saveErr) => {
          if (saveErr) {
            setTestStatus('error');
            setTestError(saveErr.reason);
          } else {
            closeWizard();
          }
        });
      }
    });
  };

  const handleCheckExisting = (client) => {
    setVerifyingId(client._id);
    performConnectionTest(client.templateName, client.params, (err, result) => {
      setVerifyingId(null);
      const success = !err && result?.success;
      setVerifyResults({
        ...verifyResults,
        [client._id]: { 
          success, 
          message: err?.reason || result?.message || (success ? 'ONLINE' : 'FAILED') 
        }
      });
      // Clear result feedback after 4 seconds
      setTimeout(() => {
        setVerifyResults(prev => {
          const next = { ...prev };
          delete next[client._id];
          return next;
        });
      }, 4000);
    });
  };

  const closeWizard = () => {
    setWizardTemplate(null);
    setClientLabel('');
    setWizardData({});
    setTestStatus('idle');
    setTestError('');
  };

  if (isLoading) return <div className="loading-text">SYNCING CONSUMER HUB...</div>;

  return (
    <div className="tab-container">
      
      {/* --- SECTION 1: ACTIVE LIVE SINKS --- */}
      <div className="section-header">
        <h2>ACTIVE DATA CONSUMERS</h2>
      </div>
      <div className="status-grid">
        {activeSinks.map(c => {
          const active = isOnline(c.lastRun);
          return (
            <div className="status-card" key={c._id}>
              <div className="status-header">
                <h4 style={{ color: '#58a6ff' }}>
                  {c.id.toUpperCase()} 
                  <span className="text-dim" style={{ marginLeft: '8px', color: '#58a6ff' }}>
                    ({c.connector})
                  </span>
                </h4>
                <div className={`pulse-dot ${active ? 'active' : ''}`}></div>
              </div>
              <div className="status-meta">
                <div className="meta-item">
                  <span>STATE</span>
                  <span style={{ color: active ? '#3fb950' : '#8b949e' }}>
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
        {activeSinks.length === 0 && <p className="hint" style={{ gridColumn: '1/-1' , textAlign: 'center'}}>NO ACTIVE SINKS DETECTED</p>}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #30363d', margin: '40px 0' }} />

      {/* --- SECTION 2: MANAGED CLIENTS --- */}
      <div className="section-header">
        <h2>MANAGED CONSUMERS</h2>
      </div>
      <div className="template-list">
        {managedClients.map(client => (
          <div key={client._id} className="template-item" style={{ background: '#161b22', border: '1px solid #30363d', padding: '15px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <strong style={{ color: '#58a6ff', fontSize: '15px' }}>{client.label}</strong>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="tag" style={{ fontSize: '10px', background: '#30363d', padding: '2px 8px', borderRadius: '4px', color: '#8b949e' }}>
                  {client.templateName.toUpperCase()}
                </span>
                {verifyResults[client._id] && (
                  <span style={{ fontSize: '11px', color: verifyResults[client._id].success ? '#3fb950' : '#f85149', fontWeight: 'bold' }}>
                    {verifyResults[client._id].success ? '✓ ONLINE' : `✗ ${verifyResults[client._id].message}`}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className={`btn-secondary ${verifyingId === client._id ? 'pulse' : ''}`} 
                style={{ color: '#c9d1d9', background: '#30363d', border: '1px solid #444c56', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                onClick={() => handleCheckExisting(client)}
              >
                {verifyingId === client._id ? 'CHECKING...' : 'TEST'}
              </button>
              <button className="btn-secondary" style={{ color: '#f85149', background: 'transparent', border: '1px solid #f85149', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }} onClick={() => Meteor.call('consumers.removeClient', client._id)}>
                REMOVE
              </button>
            </div>
          </div>
        ))}
        {managedClients.length === 0 && <p className="hint" style={{ gridColumn: '1/-1' , textAlign: 'center'}}>NO SAVED CONSUMERS FOUND</p>}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #30363d', margin: '40px 0' }} />

      {/* --- SECTION 3: TEMPLATES --- */}
      <div className="section-header">
          <h2>CONSUMER TEMPLATES</h2>
        </div>
        <div className="template-list">
          {templates
            .filter(t => !t.hidden)
            .map(t => (
              <div key={t._id} className="template-item" style={{ background: '#161b22', border: '1px solid #30363d', padding: '15px', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <strong style={{ color: '#c9d1d9' }}>{t.label}</strong>
                  <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#8b949e' }}>Supported: {t.inputs.join(', ')}</p>
                </div>
                <button 
                  className="add-instance-btn" 
                  onClick={() => setWizardTemplate(t)} 
                  style={{ background: '#238636', color: 'white', width: '38px', borderRadius: '6px', border: 'none', fontSize: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  +
                </button>
              </div>
            ))}
        </div>

      {/* --- MODAL (WIZARD) --- */}
      {wizardTemplate && (
        <div className="modal-overlay">
          <div className="modal-content discovery-modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3>CONFIGURE {wizardTemplate.label}</h3>
              <button className="close-btn" onClick={closeWizard}>×</button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label>Client Reference Name</label>
                <input className="discovery-input" placeholder="e.g. Local Storage" value={clientLabel} onChange={e => setClientLabel(e.target.value)} />
              </div>
              
              {wizardTemplate.parameters.map(param => (
                <div key={param.name} className="input-group" style={{ marginTop: '15px' }}>
                  <label>{param.label}</label>
                  <input 
                    type={param.type === 'number' ? 'text' : param.type} 
                    inputMode={param.type === 'number' ? 'numeric' : 'text'}
                    pattern={param.type === 'number' ? '[0-9]*' : undefined}
                    className="discovery-input"
                    placeholder={`Enter ${param.label.toLowerCase()}...`}
                    value={wizardData[param.name] || ''}
                    onChange={e => {
                        const val = param.type === 'number' 
                          ? e.target.value.replace(/\D/g, '') 
                          : e.target.value;
                        setWizardData({...wizardData, [param.name]: val});
                        if (testStatus === 'error') setTestStatus('idle');
                    }}
                  />
                </div>
              ))}
              
              {testStatus === 'error' && (
                <div style={{ textAlign: 'center', color: '#f85149', fontSize: '12px', marginTop: '15px', background: 'rgba(248, 81, 73, 0.1)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(248, 81, 73, 0.2)' }}>
                  {testError}
                </div>
              )}

              <button 
                className="start-scan-btn" 
                style={{ 
                  marginTop: '25px', 
                  width: '100%', 
                  transition: 'all 0.2s',
                  opacity: (isFormValid() && testStatus !== 'testing') ? 1 : 0.5,
                  cursor: (isFormValid() && testStatus !== 'testing') ? 'pointer' : 'not-allowed'
                }} 
                onClick={handleVerifyAndSave}
                disabled={!isFormValid() || testStatus === 'testing'}
              >
                {testStatus === 'testing' ? 'CHECKING CONNECTION...' : 'SAVE CONFIGURATION'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}