import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ConsumersStatus, ComponentDefinitions, ConsumerClients } from '/imports/api/collections';
import './Tabs.css';

export default function ConsumersTab() {
  const [wizardTemplate, setWizardTemplate] = useState(null);
  const [wizardData, setWizardData] = useState({});
  const [clientLabel, setClientLabel] = useState('');
  
  // --- SEARCH & PAGINATION STATES ---
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 6;

  // Validation States (Wizard)
  const [testStatus, setTestStatus] = useState('idle'); 
  const [testError, setTestError] = useState('');

  // Validation States (Existing Managed Clients)
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResults, setVerifyResults] = useState({});

  const { activeSinks, templates, managedClients, isLoading } = useTracker(() => {
    const h1 = Meteor.subscribe('active_consumers');
    const h2 = Meteor.subscribe('component_definitions');
    const h3 = Meteor.subscribe('consumer_clients');
    
    return {
      activeSinks: ConsumersStatus.find().fetch(),
      templates: ComponentDefinitions.find({ type: 'consumer' }).fetch(),
      managedClients: ConsumerClients.find().fetch(),
      isLoading: !h1.ready() || !h2.ready() || !h3.ready(),
    };
  });

  // --- FILTERING & PAGINATION LOGIC ---
  const filteredTemplates = templates.filter(t => 
    !t.hidden && (
      (t.label || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.inputs || []).join(' ').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const pageCount = Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE);
  const displayedTemplates = filteredTemplates.slice(
    currentPage * ITEMS_PER_PAGE, 
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm]);

  const isOnline = (lastRun) => lastRun && lastRun >= new Date(Date.now() - 30000);

  const isFormValid = () => {
    if (!clientLabel.trim()) return false;
    if (!wizardTemplate) return false;
    return wizardTemplate.parameters.every(param => 
      wizardData[param.name] && wizardData[param.name].toString().trim() !== ''
    );
  };

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

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-circle"></div>
      </div>
    );
  }

  return (
    <div className="tab-container">
      
      {/* SECTION 1: LIVE SINKS */}
      <div className="section-header">
        <h2>DATA CONSUMERS</h2>
      </div>
      <div className="status-grid">
        {activeSinks.map(c => {
          const active = isOnline(c.lastRun);
          return (
            <div className="status-card" key={c._id}>
              <div className="status-header">
                <h4 style={{ color: '#58a6ff' }}>{c.id.toUpperCase()}</h4>
                <div className={`pulse-dot ${active ? 'active' : ''}`}></div>
              </div>
              <div className="status-meta">
                <div className="meta-item"><span>STATE</span><span style={{ color: active ? '#3fb950' : '#8b949e' }}>{active ? 'OPERATIONAL' : 'STANDBY'}</span></div>
                <div className="meta-item"><span>LAST SYNC</span><span>{c.lastRun ? c.lastRun.toLocaleTimeString() : 'NEVER'}</span></div>
                <div className="meta-item"><span>PIPELINE</span><span>{c.connector}</span></div>
              </div>
            </div>
          );
        })}
        {activeSinks.length === 0 && (
          <div className="provider-empty-state-simple">
            <h3>No Consumers Active</h3>
            <p>Go to Pipelines tab to connect a consumer to a provider.</p>
          </div>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #30363d', margin: '40px 0' }} />

      {/* --- SECTION 2: MANAGED CLIENTS --- */}
      {managedClients.length > 0 && (
        <>
          <div className="section-header">
            <h2>MANAGED CONSUMERS</h2>
          </div>
          <div className="managed-grid">
            {managedClients.map(client => {
              const result = verifyResults[client._id];
              const isVerifying = verifyingId === client._id;

              return (
                <div key={client._id} className="managed-card">
                  <div className="managed-card-main">
                    <div className="managed-info">
                      <span className="managed-template-tag">{client.templateName}</span>
                      <strong className="managed-label">{client.label}</strong>
                    </div>
                    
                    {/* Dynamic Status Feedback */}
                    <div className={`managed-status-bar ${result ? (result.success ? 'success' : 'error') : ''} ${isVerifying ? 'verifying' : ''}`}>
                      {isVerifying ? 'VERIFYING...' : (result ? result.message : 'READY')}
                    </div>
                  </div>

                  <div className="managed-card-actions">
                    <button 
                      className="action-btn test" 
                      onClick={() => handleCheckExisting(client)}
                      disabled={isVerifying}
                    >
                      TEST
                    </button>
                    <button 
                      className="action-btn remove" 
                      onClick={() => Meteor.call('consumers.removeClient', client._id)}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid #30363d', margin: '40px 0' }} />
        </>
      )}

      {/* SECTION 3: TEMPLATES WITH SEARCH */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2>CONSUMER TEMPLATES</h2>
        <div className="search-container" style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
          <input 
            type="text" 
            placeholder="Search templates..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="discovery-input"
            maxLength={20}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          {searchTerm && <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}>×</button>}
        </div>
      </div>

      <div className="template-list" style={{ minHeight: '504px', display: 'flex', flexDirection: 'column' }}>
        {displayedTemplates.map(t => (
          <div key={t._id} className="template-item clickable" style={{ background: '#161b22', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              <strong style={{ color: '#c9d1d9' }}>{t.label}</strong>
              <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#8b949e' }}>Supported: {t.inputs.join(', ')}</p>
            </div>
            <button className="add-instance-btn" onClick={() => setWizardTemplate(t)} style={{ background: '#238636' }}>+</button>
          </div>
        ))}

        {filteredTemplates.length === 0 && (
          <div className="provider-empty-state-simple" style={{ flex: 1 }}>
            <h3>No Templates Found</h3>
            <p>We couldn't find anything matching "<strong>{searchTerm}</strong>".</p>
          </div>
        )}
      </div>

      {/* PAGINATION CONTROLS */}
      <div className="pagination" style={{ 
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '30px', padding: '10px 0', borderTop: '1px solid #30363d', minHeight: '45px',
        visibility: pageCount > 1 ? 'visible' : 'hidden'
      }}>
        <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)} className="page-nav-btn">← Prev</button>
        <div style={{ fontSize: '12px', color: '#8b949e', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: '500' }}>
          <span style={{ color: '#c9d1d9' }}>{currentPage + 1}</span> / {pageCount || 1}
        </div>
        <button disabled={currentPage >= pageCount - 1} onClick={() => setCurrentPage(p => p + 1)} className="page-nav-btn">Next →</button>
      </div>

      {/* MODAL (WIZARD) - Logic remains same */}
      {wizardTemplate && (
        <div className="modal-overlay">
          <div className="modal-content discovery-modal" style={{ maxWidth: '450px' }}>
            <div className="modal-header"><h3>CONFIGURE {wizardTemplate.label}</h3><button className="close-btn" onClick={closeWizard}>×</button></div>
            <div className="modal-body">
              <div className="input-group"><label>Client Reference Name</label><input className="discovery-input" placeholder="e.g. Local Storage" value={clientLabel} onChange={e => setClientLabel(e.target.value)} /></div>
              {wizardTemplate.parameters.map(param => (
                <div key={param.name} className="input-group" style={{ marginTop: '15px' }}>
                  <label>{param.label}</label>
                  <input type={param.type === 'number' ? 'text' : param.type} className="discovery-input" placeholder={`Enter ${param.label.toLowerCase()}...`} value={wizardData[param.name] || ''} onChange={e => setWizardData({...wizardData, [param.name]: e.target.value})}/>
                </div>
              ))}
              {testStatus === 'error' && <div className="error-text" style={{ color: '#f85149', marginTop: '15px', textAlign: 'center' }}>{testError}</div>}
              <button className="start-scan-btn" style={{ marginTop: '25px', opacity: isFormValid() ? 1 : 0.5 }} onClick={handleVerifyAndSave} disabled={!isFormValid() || testStatus === 'testing'}>
                {testStatus === 'testing' ? 'CHECKING...' : 'SAVE CONFIGURATION'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}