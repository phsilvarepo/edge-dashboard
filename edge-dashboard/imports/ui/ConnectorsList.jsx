import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Connectors } from '/imports/api/collections';
import AddConnector from './AddConnector';
import './Tabs.css'; 
import './ConnectorsList.css'; 

export default function ConnectorsList() {
  const [isModalOpen, setModalOpen] = useState(false);
  const [isDeleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBulkMenu, setShowBulkMenu] = useState(false);

  const connectors = useTracker(() => {
    Meteor.subscribe('connectors');
    return Connectors.find().fetch();
  });

  // Handlers
  const toggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return alert("Select connectors to delete first.");
    
    if (confirm(`Are you sure you want to delete ${selectedIds.length} connector(s)?`)) {
      selectedIds.forEach(id => {
        Meteor.call('connectors.remove', id);
      });
      setSelectedIds([]);
      setDeleteMode(false);
    }
  };

  const handleDeleteAll = () => {
    if (confirm("⚠️ CRITICAL ACTION: Are you sure you want to delete ALL connectors? This cannot be undone.")) {
      Meteor.call('connectors.removeAll');
      setShowBulkMenu(false);
    }
  };

  return (
    <div className="tab-container">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>ACTIVE PIPELINES <span className="text-dim">({connectors.length})</span></h2>
        
        <div className="action-bar" style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
          
          {/* DELETE ACTIONS */}
          <div className="delete-group" style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid #442d2d' }}>
            <button 
              className={`btn-action ${isDeleteMode ? 'btn-danger' : ''}`}
              onClick={() => {
                setDeleteMode(!isDeleteMode);
                setSelectedIds([]);
              }}
            >
              {isDeleteMode ? 'CANCEL' : 'DELETE CONNECTION'}
            </button>
            
            <button className="btn-expand" onClick={() => setShowBulkMenu(!showBulkMenu)}>
              {showBulkMenu ? '▲' : '▼'}
            </button>

            {showBulkMenu && (
              <div className="bulk-dropdown">
                <button onClick={handleDeleteAll} className="dropdown-item danger">DELETE ALL CONNECTIONS</button>
              </div>
            )}
          </div>

          {isDeleteMode && (
            <button className="btn-confirm-delete" onClick={handleDeleteSelected}>
              CONFIRM ({selectedIds.length})
            </button>
          )}

          <button className="btn-add-main" onClick={() => setModalOpen(true)}>
            + NEW CONNECTION
          </button>
        </div>
      </div>

      <div className="status-grid">
        {connectors.map(c => (
          <div 
            className={`status-card ${isDeleteMode ? 'selectable' : ''} ${selectedIds.includes(c._id) ? 'selected' : ''}`} 
            key={c._id}
            onClick={() => isDeleteMode && toggleSelect(c._id)}
          >
            {isDeleteMode && (
              <div className="selection-overlay">
                <input type="checkbox" checked={selectedIds.includes(c._id)} readOnly />
              </div>
            )}
            
            <div className="status-header">
              <h4 style={{ color: '#58a6ff' }}>{c.id}</h4>
              <div className={`pulse-dot ${c.enabled !== false ? 'active' : ''}`}></div>
            </div>

            <div className="connector-flow">
              <div className="flow-node">{c.provider}</div>
              <div className="flow-arrow">→</div>
              <div className="flow-node">{c.parser}</div>
              <div className="flow-arrow">→</div>
              <div className="flow-node">{c.consumers?.length || 0} Sinks</div>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
            <AddConnector onComplete={() => setModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}