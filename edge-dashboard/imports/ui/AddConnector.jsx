import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { ComponentDefinitions, Connectors } from '/imports/api/collections'; // Added Connectors
import './AddConnectorUI.css'; 

export default function AddConnector({ onComplete }) {
  const [id, setId] = useState('');
  const [error, setError] = useState(''); // New state for validation errors
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [selectedParser, setSelectedParser] = useState(null);
  const [selectedConsumers, setSelectedConsumers] = useState([]);

  const { definitions, existingConnectors, isLoading } = useTracker(() => {
    const handle1 = Meteor.subscribe('component_definitions');
    const handle2 = Meteor.subscribe('connectors'); // Subscribe to check for duplicates
    return {
      definitions: ComponentDefinitions.find().fetch(),
      existingConnectors: Connectors.find().fetch(),
      isLoading: !handle1.ready() || !handle2.ready(),
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

  // Validation Logic
  const handleIdChange = (e) => {
    const rawValue = e.target.value.toUpperCase();
    // 1. Limit to 24 chars. 2. Only allow A-Z, 0-9, and _
    const filteredValue = rawValue.substring(0, 24).replace(/[^A-Z0-9_]/g, '');
    
    setId(filteredValue);

    // 3. Check for duplicates
    const isDuplicate = existingConnectors.some(c => c.id === filteredValue);
    if (isDuplicate) {
      setError('NAME ALREADY IN USE');
    } else {
      setError('');
    }
  };

  const isPipelineValid = id && !error && selectedProvider && selectedParser && selectedConsumers.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isPipelineValid) return;

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
        <div className={`form-step-wrapper ${id && !error ? 'active' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
             <label className="input-label">Node Identity</label>
             {error && <span style={{ color: '#f85149', fontSize: '10px', fontWeight: 'bold' }}>{error}</span>}
          </div>
          <input 
            className="tech-input"
            style={error ? { borderColor: '#f85149', color: '#f85149' } : {}}
            placeholder="Define the name of the pipeline" 
            value={id} 
            onChange={handleIdChange} 
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
            <option value="">Select provider</option>
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
              <option value="">Waiting for source selection...</option>
            ) : (
              <>
                <option value="">Select parser</option>
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
              <p className="pipeline-hint">Define data pipeline components to visualize flow.</p>
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
              {error ? 'Fix naming conflict to proceed.' : 'Complete all configuration steps to deploy.'}
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