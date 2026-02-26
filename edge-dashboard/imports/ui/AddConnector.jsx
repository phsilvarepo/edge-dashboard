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
  const [options, setOptions] = useState({});

  const { definitions, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('component_definitions');
    return {
      definitions: ComponentDefinitions.find().fetch(),
      isLoading: !handle.ready(),
    };
  });

  if (isLoading) return <div className="loading-text">INITIALIZING SYSTEMS...</div>;

  const providers = definitions.filter(d => d.type === 'provider');
  
  const availableParsers = definitions.filter(d => 
    d.type === 'parser' && 
    selectedProvider && 
    d.inputs.some(i => selectedProvider.outputs.includes(i))
  );

  const availableConsumers = definitions.filter(d => 
    d.type === 'consumer' && 
    selectedParser && 
    d.inputs.some(i => selectedParser.outputs.includes(i))
  );

  const handleOptionChange = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    Meteor.call('connectors.insert', {
      id,
      provider: selectedProvider.name,
      parser: selectedParser.name,
      consumers: selectedConsumers,
      options 
    }, (err) => {
        if (!err) {
            // Reset Form
            setId('');
            setSelectedProvider(null);
            setSelectedParser(null);
            setSelectedConsumers([]);
            setOptions({});
            
            // Close Modal if the prop exists
            if (onComplete) onComplete();
        } else {
            alert(`System Error: ${err.reason}`);
        }
    });
  };

  return (
    <div className="connector-form-container" style={{ border: 'none', boxShadow: 'none' }}>
      <div className="form-header">
        <h3>CONFIGURE NEW PIPELINE</h3>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label>Unique Connector ID</label>
          <input 
            className="tech-input"
            placeholder="e.g. EDGE-01" 
            value={id} 
            onChange={e => setId(e.target.value)} 
            required
          />
        </div>

        <div className="input-group">
          <label>1. Select Provider</label>
          <select 
            className="tech-select"
            value={selectedProvider?.name || ''}
            onChange={e => {
              const p = providers.find(x => x.name === e.target.value);
              setSelectedProvider(p);
              setSelectedParser(null);
              setSelectedConsumers([]);
              setOptions({});
            }}
          >
            <option value="">-- Select Source --</option>
            {providers.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
          </select>
        </div>

        {selectedProvider?.parameters?.map(param => (
          <div className="input-group" key={param.name}>
            <label>{param.label}</label>
            <input 
              className="tech-input"
              type={param.type}
              placeholder={param.label}
              value={options[param.name] || ''}
              onChange={e => handleOptionChange(param.name, e.target.value)}
            />
          </div>
        ))}

        <div className="input-group">
          <label>2. Select Parser</label>
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
            <option value="">-- Select Logic --</option>
            {availableParsers.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
          </select>
        </div>

        <div className="input-group">
          <label>3. Select Consumers</label>
          <div className="checkbox-list">
            {availableConsumers.length === 0 && <p className="hint">Select a parser first...</p>}
            {availableConsumers.map(c => (
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
            ))}
          </div>
        </div>

        <button 
          className="btn-create" 
          type="submit" 
          disabled={!id || !selectedParser || selectedConsumers.length === 0}
        >
          Initialize Pipeline
        </button>
      </form>
    </div>
  );
}