import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { 
  Connectors, 
  ProvidersStatus, 
  ComponentDefinitions 
} from '/imports/api/collections';
import './AddConnectorUI.css'; 

export default function AddConnector({ onComplete }) {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [selectedSensorId, setSelectedSensorId] = useState('');
  const [selectedParserId, setSelectedParserId] = useState('');
  const [selectedConsumerIds, setSelectedConsumerIds] = useState([]);
  
  // State to hold dynamic parameters for consumers
  const [consumerParams, setConsumerParams] = useState({});

  const { liveSensors, parsers, consumers, existingConnectors, isLoading } = useTracker(() => {
    const h1 = Meteor.subscribe('providers_status');
    const h2 = Meteor.subscribe('component_definitions');
    const h3 = Meteor.subscribe('connectors');
    
    const ready = h1.ready() && h2.ready() && h3.ready();

    return {
      liveSensors: ProvidersStatus.find().fetch(),
      parsers: ComponentDefinitions.find({ type: 'parser' }).fetch(),
      consumers: ComponentDefinitions.find({ type: 'consumer' }).fetch(),
      existingConnectors: Connectors.find().fetch(),
      isLoading: !ready,
    };
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
      [consumerName]: {
        ...(prev[consumerName] || {}),
        [paramName]: value
      }
    }));
  };

  if (isLoading) return <div className="loading-text">SYNCING ENGINE CORE...</div>;

  const isPipelineValid = id && !error && selectedSensorId && selectedParserId && selectedConsumerIds.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isPipelineValid) return;

    const sensor = liveSensors.find(s => s._id === selectedSensorId);
    const parser = parsers.find(p => p._id === selectedParserId);

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
      consumers: consumers
        .filter(c => selectedConsumerIds.includes(c._id))
        .map(c => c.name),

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

  return (
    <div className="connector-form-container">
      <div className="form-header">
        <h3>Deploy Service Connector</h3>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-step-wrapper active">
          <label className="input-label">Connector Name</label>
          <input 
            className="tech-input"
            style={error ? { borderColor: '#f85149' } : {}}
            value={id} 
            onChange={handleIdChange} 
            placeholder="E.G. LINE_1_TEMP"
          />
        </div>

        <div className="form-step-wrapper active">
          <label className="input-label">1. Live Data Source</label>
          <select 
            className="tech-select"
            value={selectedSensorId}
            onChange={e => setSelectedSensorId(e.target.value)}
          >
            <option value="">Select Sensor...</option>
            {liveSensors.map(s => (
              <option key={s._id} value={s._id}>{s.label} ({s.parentId})</option>
            ))}
          </select>
        </div>

        <div className="form-step-wrapper active">
          <label className="input-label">2. Parser Logic</label>
          <select 
            className="tech-select"
            value={selectedParserId}
            onChange={e => setSelectedParserId(e.target.value)}
          >
            <option value="">Select Parser...</option>
            {parsers.map(p => <option key={p._id} value={p._id}>{p.label}</option>)}
          </select>
        </div>

        <div className="form-step-wrapper active">
          <label className="input-label">3. Destination Sinks</label>
          <div className="checkbox-list">
            {consumers.map(c => (
              <div key={c._id} className="consumer-item-wrapper">
                <label className="tech-checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={selectedConsumerIds.includes(c._id)}
                    onChange={e => {
                      if(e.target.checked) setSelectedConsumerIds([...selectedConsumerIds, c._id]);
                      else setSelectedConsumerIds(selectedConsumerIds.filter(x => x !== c._id));
                    }}
                  /> 
                  {c.label}
                </label>

                {/* DYNAMIC PARAMETER FIELDS */}
                {selectedConsumerIds.includes(c._id) && c.parameters && c.parameters.length > 0 && (
                  <div className="consumer-params-box">
                    {c.parameters.map(param => (
                      <div key={param.name} className="param-input-group">
                        <label className="param-label">{param.label}</label>
                        <input 
                          type={param.type || 'text'}
                          className="tech-input-small"
                          placeholder={param.label}
                          value={consumerParams[c.name]?.[param.name] || ''}
                          onChange={(e) => handleParamChange(c.name, param.name, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-create" type="submit" disabled={!isPipelineValid}>
            Deploy Connector
          </button>
        </div>
      </form>
    </div>
  );
}