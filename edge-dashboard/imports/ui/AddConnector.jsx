import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Connectors, ProvidersStatus, ComponentDefinitions, ConsumerClients } from '/imports/api/collections';
import './AddConnectorUI.css'; 

export default function AddConnector({ onComplete }) {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [selectedSensorId, setSelectedSensorId] = useState('');
  const [selectedParserId, setSelectedParserId] = useState('');
  const [selectedConsumerIds, setSelectedConsumerIds] = useState([]);
  const [consumerParams, setConsumerParams] = useState({});

  const { liveSensors, parsers, consumers, managedClients, existingConnectors, isLoading } = useTracker(() => {
    const h1 = Meteor.subscribe('providers_status');
    const h2 = Meteor.subscribe('component_definitions');
    const h3 = Meteor.subscribe('connectors');
    const h4 = Meteor.subscribe('consumer_clients'); 
    const ready = h1.ready() && h2.ready() && h3.ready() && h4.ready();

    return {
      liveSensors: ProvidersStatus.find().fetch(),
      parsers: ComponentDefinitions.find({ type: 'parser' }).fetch(),
      consumers: ComponentDefinitions.find({ type: 'consumer' }).fetch(),
      managedClients: ConsumerClients.find().fetch(), 
      existingConnectors: Connectors.find().fetch(),
      isLoading: !ready,
    };
  });

  const sensor = liveSensors.find(s => s._id === selectedSensorId);
  const parser = parsers.find(p => p._id === selectedParserId);

  const isSensorValid = id && !error && selectedSensorId;
  
  const compatibleParsers = parsers.filter(p => {
    if (!sensor) return false;
    const sensorOut = (sensor.dataType || 'json').toLowerCase();
    return p.inputs.some(input => input.toLowerCase() === sensorOut);
  });

  const isParserValid = isSensorValid && selectedParserId;

  const compatibleConsumers = consumers.filter(c => {
    if (!parser) return false;
    return parser.outputs.some(pOut => 
      c.inputs.some(cIn => cIn.toLowerCase() === pOut.toLowerCase())
    );
  });

  const handleIdChange = (e) => {
    const rawValue = e.target.value.toUpperCase();
    const filteredValue = rawValue.substring(0, 24).replace(/[^A-Z0-9_]/g, '');
    setId(filteredValue);
    const isDuplicate = existingConnectors.some(c => c.name === filteredValue);
    setError(isDuplicate ? 'NAME ALREADY IN USE' : '');
  };

  const handleParamChange = (consumerName, paramName, value) => {
    setConsumerParams(prev => ({
      ...prev,
      [consumerName]: { ...(prev[consumerName] || {}), [paramName]: value }
    }));
  };

  const handleSelectManagedClient = (consumerName, clientId) => {
    if (!clientId) {
        setConsumerParams(prev => ({ ...prev, [consumerName]: {} }));
        return;
    }
    const client = managedClients.find(c => c._id === clientId);
    if (client) {
        setConsumerParams(prev => ({
            ...prev,
            [consumerName]: { ...client.params, _managedClientId: client._id }
        }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const connectorDoc = {
      name: id,
      enabled: true,
      provider: 'mqtt_provider', 
      providerOptions: {
        topic: sensor.topic,
        method: sensor.captureMethod,
        sensorType: sensor.provider,
        brokerUrl: sensor.params?.broker || "mqtt://10.0.200.25:1883",
        username: sensor.params?.username || "unparallel",
        password: sensor.params?.pass || "UIuiui123"
      },
      parser: parser.name,
      parserOptions: {},
      consumers: consumers.filter(c => selectedConsumerIds.includes(c._id)).map(c => c.name),
      consumerOptions: consumerParams, 
      createdAt: new Date()
    };

    Meteor.call('connectors.insert', connectorDoc, (err, connectorId) => {
        if (!err) {
          Meteor.call('pipeline.toggle', connectorId, true);
          if (onComplete) onComplete();
        } else {
          alert("Deployment failed: " + err.reason);
        }
    });
  };

  // UI Helper for the grayed-out effect
  const getStageStyle = (isActive) => ({
    color: isActive ? '#c9d1d9' : '#8b949e',
    opacity: isActive ? 1 : 0.6,
    transition: 'all 0.3s ease'
  });

  if (isLoading) return <div className="loading-text">SYNCING ENGINE CORE...</div>;

  return (
    <div className="connector-form-container">
      <div className="form-header">
        <h3>Deploy Service Connector</h3>
      </div>

      <form onSubmit={handleSubmit}>
        
        {/* STEP 1: Always Active */}
        <div className="form-step-wrapper active">
          <label className="input-label">Connector Name</label>
          <input 
            className={`tech-input ${error ? 'error-input' : ''}`} 
            value={id} 
            onChange={handleIdChange} 
            placeholder="E.G. JSON_CONVERTER" 
          />
          {error && <p className="error-text">{error}</p>}

          <label className="input-label" style={{ marginTop: '15px' }}>1. Live Data Source</label>
          <select className="tech-select" value={selectedSensorId} onChange={e => {
              setSelectedSensorId(e.target.value);
              setSelectedParserId('');
              setSelectedConsumerIds([]);
          }}>
            <option value="">{liveSensors.length > 0 ? "Select Sensor..." : "No Available Sensors"}</option>
            {liveSensors.map(s => <option key={s._id} value={s._id}>{s.label} ({s.parentId})</option>)}
          </select>
        </div>

        {/* STEP 2: Grayed out until Step 1 is valid */}
        <div className={`form-step-wrapper ${isSensorValid ? 'active' : 'locked'}`} style={getStageStyle(isSensorValid)}>
          <label className="input-label" style={{ color: 'inherit' }}>2. Data Parser</label>
          <select 
            className="tech-select" 
            style={{ color: 'inherit' }}
            disabled={!isSensorValid || compatibleParsers.length === 0}
            value={selectedParserId}
            onChange={e => {
                setSelectedParserId(e.target.value);
                setSelectedConsumerIds([]);
            }}
          >
            <option value="">{compatibleParsers.length > 0 ? "Select Parser..." : "No Available Parsers"}</option>
            {compatibleParsers.map(p => <option key={p._id} value={p._id}>{p.label}</option>)}
          </select>
        </div>

        {/* STEP 3: Grayed out until Step 2 is valid */}
        <div className={`form-step-wrapper ${isParserValid ? 'active' : 'locked'}`} style={getStageStyle(isParserValid)}>
          <label className="input-label" style={{ color: 'inherit' }}>3. Data Consumers</label>
          <div className="checkbox-list">
            {!isParserValid && <p className="hint-text" style={{ color: '#8b949e' }}>Define previous nodes.</p>}
            {isParserValid && compatibleConsumers.length === 0 && <p className="error-text">No Available Consumers</p>}
            {compatibleConsumers.map(c => {
              const relevantClients = managedClients.filter(mc => mc.templateName === c.name);
              
              return (
                <div key={c._id} className="consumer-item-wrapper" style={{ color: isParserValid ? 'inherit' : '#8b949e' }}>
                  <label className="tech-checkbox-label" style={{ cursor: isParserValid ? 'pointer' : 'not-allowed' }}>
                    <input 
                      type="checkbox" 
                      disabled={!isParserValid}
                      checked={selectedConsumerIds.includes(c._id)}
                      onChange={e => {
                        if(e.target.checked) setSelectedConsumerIds([...selectedConsumerIds, c._id]);
                        else setSelectedConsumerIds(selectedConsumerIds.filter(x => x !== c._id));
                      }}
                    /> 
                    {c.label}
                  </label>

                  {selectedConsumerIds.includes(c._id) && (relevantClients.length > 0 || (c.parameters && c.parameters.length > 0)) && (
                    <div className="consumer-params-box">
                      {/* 1. Show Saved Clients Dropdown if they exist */}
                      {relevantClients.length > 0 && (
                        <div className="param-input-group" style={{ marginBottom: '15px', borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>
                          <label className="param-label" style={{ color: '#58a6ff' }}>Use Saved Client</label>
                          <select 
                            className="tech-select-small"
                            onChange={(e) => handleSelectManagedClient(c.name, e.target.value)}
                            value={consumerParams[c.name]?._managedClientId || ''}
                          >
                            <option value="">Manual configuration of consumer</option>
                            {relevantClients.map(rc => (
                              <option key={rc._id} value={rc._id}>{rc.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* 2. Show Manual Parameters if they exist */}
                      {c.parameters?.map(param => (
                        <div key={param.name} className="param-input-group">
                          <label className="param-label">{param.label}</label>
                          <input 
                            type={param.type || 'text'}
                            className="tech-input-small"
                            value={consumerParams[c.name]?.[param.name] || ''}
                            onChange={(e) => handleParamChange(c.name, param.name, e.target.value)}
                            disabled={!!consumerParams[c.name]?._managedClientId} 
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-create" type="submit" disabled={!isParserValid || selectedConsumerIds.length === 0}>
            Deploy Connector
          </button>
        </div>
      </form>
    </div>
  );
}