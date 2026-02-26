import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ComponentDefinitions } from '/imports/api/collections';
import './AddConnectorUI.css'; 

export default function AddConnector({ onComplete }) {
  const [id, setId] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedParser, setSelectedParser] = useState(null);
  const [selectedConsumers, setSelectedConsumers] = useState([]);

  const { definitions, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('component_definitions');
    return {
      definitions: ComponentDefinitions.find().fetch(),
      isLoading: !handle.ready(),
    };
  });

  if (isLoading) return <div className="loading-text">SYNCING CORE DATA...</div>;

  const providers = definitions.filter(d => d.type === 'provider');
  const availableParsers = definitions.filter(d => 
    d.type === 'parser' && selectedProvider?.outputs.some(out => d.inputs.includes(out))
  );
  const availableConsumers = definitions.filter(d => 
    d.type === 'consumer' && selectedParser?.outputs.some(out => d.inputs.includes(out))
  );

  const isPipelineValid = id && selectedProvider && selectedParser && selectedConsumers.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    Meteor.call('connectors.insert', {
      id,
      provider: selectedProvider.name,
      parser: selectedParser.name,
      consumers: selectedConsumers,
    }, (err) => {
        if (!err && onComplete) onComplete();
    });
  };

  return (
    <div className="connector-form-container">
      <div className="form-header">
        <h3>Configure Pipeline</h3>
      </div>

      <form onSubmit={handleSubmit}>
        {/* IDENTITY */}
        <div className={`form-step-wrapper ${id ? 'active' : ''}`}>
          <label className="input-label">Node Identity</label>
          <input 
            className="tech-input"
            placeholder="E.G. ENGINE_ROOM_01" 
            value={id} 
            onChange={e => setId(e.target.value.toUpperCase())} 
            required
          />
        </div>

        {/* PROVIDER */}
        <div className={`form-step-wrapper ${selectedProvider ? 'active' : ''}`}>
          <label className="input-label">1. Data Source</label>
          <select 
            className="tech-select"
            value={selectedProvider?.name || ''}
            onChange={e => {
              const p = providers.find(x => x.name === e.target.value);
              setSelectedProvider(p);
              setSelectedParser(null);
              setSelectedConsumers([]);
            }}
          >
            <option value="">-- Select Provider --</option>
            {providers.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
          </select>
        </div>

        {/* PARSER */}
        <div className={`form-step-wrapper ${selectedParser ? 'active' : ''}`}>
          <label className="input-label">2. Logic Engine</label>
          <select 
            className="tech-select"
            disabled={!selectedProvider} 
            value={selectedParser?.name || ''}
            onChange={e => {
              const p = availableParsers.find(x => x.name === e.target.value);
              setSelectedParser(p);
              setSelectedConsumers([]);
            }}
          >
            {!selectedProvider ? (
              <option value="">Waiting for Source selection...</option>
            ) : (
              <>
                <option value="">-- Select Parser --</option>
                {availableParsers.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
              </>
            )}
          </select>
        </div>

        {/* CONSUMERS */}
        <div className={`form-step-wrapper ${selectedConsumers.length > 0 ? 'active' : ''}`}>
          <label className="input-label">3. Target Sinks</label>
          <div className="checkbox-list">
            {!selectedParser ? (
              <p className="pipeline-hint">Define Logic Engine to reveal compatible Sinks.</p>
            ) : (
              availableConsumers.map(c => (
                <label key={c.name} className="tech-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={selectedConsumers.includes(c.name)}
                    onChange={e => {
                      if(e.target.checked) setSelectedConsumers([...selectedConsumers, c.name]);
                      else setSelectedConsumers(selectedConsumers.filter(x => x !== c.name));
                    }}
                  /> 
                  {c.label}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="form-footer">
          {isPipelineValid ? (
            <div className="pipeline-preview">
              READY: {selectedProvider.label} ➔ {selectedParser.label} ➔ {selectedConsumers.length} Target(s)
            </div>
          ) : (
            <div className="pipeline-hint">
              Complete all configuration steps to deploy.
            </div>
          )}
          
          <button 
            className="btn-create" 
            type="submit" 
            disabled={!isPipelineValid}
          >
            Deploy Pipeline
          </button>
        </div>
      </form>
    </div>
  );
}