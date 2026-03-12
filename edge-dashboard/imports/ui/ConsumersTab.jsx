import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ConsumersStatus, ComponentDefinitions, ConsumerClients } from '/imports/api/collections';
import './Tabs.css';

export default function ConsumersTab() {
  const [wizardTemplate, setWizardTemplate] = useState(null);
  const [wizardData, setWizardData] = useState({});
  const [clientLabel, setClientLabel] = useState('');
  
  // Validation States
  const [testStatus, setTestStatus] = useState('idle'); // 'idle' | 'testing' | 'error'
  const [testError, setTestError] = useState('');

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

  // NEW: Validation Logic
  const isFormValid = () => {
    if (!clientLabel.trim()) return false;
    if (!wizardTemplate) return false;
    
    // Ensure every parameter defined in the template has a value in wizardData
    return wizardTemplate.parameters.every(param => 
      wizardData[param.name] && wizardData[param.name].toString().trim() !== ''
    );
  };

  const handleVerifyAndSave = () => {
    if (!isFormValid()) return;
    
    setTestStatus('testing');
    setTestError('');

    Meteor.call('consumers.testConnection', {
      type: wizardTemplate.name,
      params: wizardData
    }, (err, result) => {
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
                  <span className="text-dim" style={{ fontSize: '0.85em', marginLeft: '8px', opacity: 0.6 }}>
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
              <div style={{ marginTop: '4px' }}>
                <span className="tag" style={{ fontSize: '10px', background: '#30363d', padding: '2px 8px', borderRadius: '4px', color: '#8b949e' }}>
                  {client.templateName.toUpperCase()}
                </span>
              </div>
            </div>
            <button className="btn-secondary" style={{ color: '#f85149', background: 'transparent', border: '1px solid #f85149', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer' }} onClick={() => Meteor.call('consumers.removeClient', client._id)}>
              REMOVE
            </button>
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
                  style={{ background: '#238636', border: 'none', color: 'white', borderRadius: '4px', width: '32px', height: '32px', cursor: 'pointer', fontSize: '20px' }}
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
                    // Change: If it's a number, we use 'text' + numeric mode to hide arrows
                    type={param.type === 'number' ? 'text' : param.type} 
                    inputMode={param.type === 'number' ? 'numeric' : 'text'}
                    pattern={param.type === 'number' ? '[0-9]*' : undefined}
                    
                    className="discovery-input"
                    placeholder={`Enter ${param.label.toLowerCase()}...`}
                    value={wizardData[param.name] || ''}
                    onChange={e => {
                        // If it's a number, only allow numeric characters
                        const val = param.type === 'number' 
                          ? e.target.value.replace(/\D/g, '') 
                          : e.target.value;
                          
                        setWizardData({...wizardData, [param.name]: val});
                        if (testStatus === 'error') setTestStatus('idle');
                    }}
                  />
                </div>
              ))}
              
              {/* ERROR FEEDBACK */}
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