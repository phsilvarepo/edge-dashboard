import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
// IMPORT the correct collection
import { Connectors } from '/imports/api/collections';
import AddConnector from './AddConnector';
import './Tabs.css'; 
import './ConnectorsList.css'; 

export default function ConnectorsList() {
  const [isModalOpen, setModalOpen] = useState(false);
  const [isDeleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // FETCH from the correct collection and subscription
  const { connectors, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('connectors');
    return {
      connectors: Connectors.find({}, { sort: { createdAt: -1 } }).fetch(),
      isLoading: !handle.ready()
    };
  });

  const hasConnectors = connectors.length > 0;

  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleToggleConnector = (id, currentStatus) => {
    // Note: Ensure your method on server handles Connectors collection
    Meteor.call('pipeline.toggle', id, !currentStatus);
  };

  const handleDeleteSelected = () => {
    if (confirm(`Purge ${selectedIds.length} connector(s)?`)) {
      selectedIds.forEach(id => {
        // Stop the logic before deleting
        Meteor.call('pipeline.toggle', id, false);
        Meteor.call('connectors.remove', id);
      });
      setSelectedIds([]);
      setDeleteMode(false);
    }
  };

  if (isLoading) return <div className="loading-text">RETRIVING CONNECTORS...</div>;

  return (
    <div className="tab-container">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>ACTIVE ENGINE CONNECTORS <span className="text-dim">({connectors.length})</span></h2>
        
        <div className="action-bar" style={{ display: 'flex', gap: '10px' }}>
          {hasConnectors && (
            <button 
              className={`btn-action ${isDeleteMode ? 'btn-danger' : ''}`}
              onClick={() => { setDeleteMode(!isDeleteMode); setSelectedIds([]); }}
            >
              {isDeleteMode ? 'CANCEL' : 'MANAGE'}
            </button>
          )}

          {!isDeleteMode && (
            <button className="btn-add-main" onClick={() => setModalOpen(true)}>
              + NEW DEPLOYMENT
            </button>
          )}
          
          {isDeleteMode && selectedIds.length > 0 && (
            <button className="btn-confirm-delete" onClick={handleDeleteSelected}>
              CONFIRM PURGE ({selectedIds.length})
            </button>
          )}
        </div>
      </div>

      {hasConnectors ? (
        <div className="status-grid">
          {connectors.map(c => (
            <div 
              className={`status-card ${isDeleteMode ? 'selectable' : ''} ${selectedIds.includes(c._id) ? 'selected' : ''}`} 
              key={c._id}
              onClick={() => isDeleteMode && toggleSelect(c._id)}
            >
              <div className="status-header">
                <h4 style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{c.name}</h4>
                <div 
                  className={`pulse-dot ${c.enabled ? 'active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleConnector(c._id, c.enabled);
                  }}
                ></div>
              </div>

              <div className="connector-flow">
                <div className="flow-node" title={c.providerOptions?.sensorType}>{c.providerOptions?.sensorType || 'INPUT'}</div>
                <div className="flow-arrow">→</div>
                <div className="flow-node">{c.parser}</div>
                <div className="flow-arrow">→</div>
                <div className="flow-node">{c.consumers?.length || 0} SINKS</div>
              </div>

              <div className="status-meta">
                <div className="meta-item">
                  <span>ENGINE STATE</span>
                  <span style={{ color: c.enabled ? '#3fb950' : '#8b949e' }}>
                    {c.enabled ? 'RUNNING' : 'STOPPED'}
                  </span>
                </div>
                <div className="meta-item">
                    <span>SOURCE</span>
                    <span style={{ fontSize: '9px' }}>{c.providerOptions?.topic?.substring(0, 20)}...</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state-full">
          <h3>No deployments active</h3>
          <p>The Service Engine is idling.</p>
          <button className="btn-add-main" style={{ marginTop: '20px' }} onClick={() => setModalOpen(true)}>
            DEPLOY FIRST SENSOR
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <AddConnector onComplete={() => setModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}