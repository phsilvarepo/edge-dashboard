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

  // Validation feedback states
  const [sensorLivenessError, setSensorLivenessError] = useState('');
  const [consumerStatus, setConsumerStatus] = useState({}); // { consumerId: { loading, error, success } }

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

  const isSensorValid = id && !error && selectedSensorId && !sensorLivenessError;
  
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

  // Reusable Consumer Validation
  const validateConsumerConnection = (consumerId, consumerName, params) => {
    setConsumerStatus(prev => ({ ...prev, [consumerId]: { loading: true } }));
    
    Meteor.call('consumers.testConnection', {
      type: consumerName,
      params: params
    }, (err, result) => {
      const isOk = !err && result?.success;
      setConsumerStatus(prev => ({
        ...prev,
        [consumerId]: {
          loading: false,
          success: isOk,
          error: isOk ? '' : (err?.reason || result?.message || 'Connection Failed')
        }
      }));
    });
  };

  const handleIdChange = (e) => {
    const rawValue = e.target.value.toUpperCase();
    const filteredValue = rawValue.substring(0, 24).replace(/[^A-Z0-9_]/g, '');
    setId(filteredValue);
    const isDuplicate = existingConnectors.some(c => c.name === filteredValue);
    setError(isDuplicate ? 'NAME ALREADY IN USE' : '');
  };

  const handleParamChange = (consumerId, consumerName, paramName, value) => {
    const newParams = { ...(prevParams = (consumerParams[consumerName] || {})), [paramName]: value };
    setConsumerParams(prev => ({
      ...prev,
      [consumerName]: newParams
    }));
    
    // Trigger validation on manual change
    validateConsumerConnection(consumerId, consumerName, newParams);
  };

  const handleSelectManagedClient = (consumerId, consumerName, clientId) => {
    if (!clientId) {
        setConsumerParams(prev => ({ ...prev, [consumerName]: {} }));
        setConsumerStatus(prev => { const n = {...prev}; delete n[consumerId]; return n; });
        return;
    }
    const client = managedClients.find(c => c._id === clientId);
    if (client) {
        const params = { ...client.params, _managedClientId: client._id };
        setConsumerParams(prev => ({
            ...prev,
            [consumerName]: params
        }));
        // Trigger validation on saved client selection
        validateConsumerConnection(consumerId, consumerName, params);
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
              const val = e.target.value;
              setSelectedSensorId(val);
              
              // Liveness Check
              const selectedSensor = liveSensors.find(s => s._id === val);
              const isLive = selectedSensor?.lastRun && selectedSensor.lastRun >= new Date(Date.now() - 35000);
              setSensorLivenessError(val && !isLive ? 'This sensor is not currently publishing data.' : '');

              setSelectedParserId('');
              setSelectedConsumerIds([]);
          }}>
            <option value="">{liveSensors.length > 0 ? "Select Sensor..." : "No Available Sensors"}</option>
            {liveSensors.map(s => <option key={s._id} value={s._id}>{s.label} ({s.parentId})</option>)}
          </select>
          {sensorLivenessError && <p className="error-text" style={{ fontSize: '11px', marginTop: '5px' }}>{sensorLivenessError}</p>}
        </div>

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

        <div className={`form-step-wrapper ${isParserValid ? 'active' : 'locked'}`} style={getStageStyle(isParserValid)}>
          <label className="input-label" style={{ color: 'inherit' }}>3. Data Consumers</label>
          <div className="checkbox-list">
            {!isParserValid && <p className="hint-text" style={{ color: '#8b949e' }}>Define previous nodes.</p>}
            {isParserValid && compatibleConsumers.length === 0 && <p className="error-text">No Available Consumers</p>}
            {compatibleConsumers.map(c => {
              const relevantClients = managedClients.filter(mc => mc.templateName === c.name);
              const status = consumerStatus[c._id];
              
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
                    {status?.loading && <span className="loading-spinner-inline" style={{ marginLeft: '10px', fontSize: '10px' }}>Checking...</span>}
                    {status?.success && <span style={{ color: '#3fb950', marginLeft: '10px', fontSize: '10px' }}>✓ Available</span>}
                  </label>

                  {selectedConsumerIds.includes(c._id) && (relevantClients.length > 0 || (c.parameters && c.parameters.length > 0)) && (
                    <div className="consumer-params-box">
                      {relevantClients.length > 0 && (
                        <div className="param-input-group" style={{ marginBottom: '15px', borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>
                          <label className="param-label" style={{ color: '#58a6ff' }}>Use Saved Client</label>
                          <select 
                            className="tech-select-small"
                            onChange={(e) => handleSelectManagedClient(c._id, c.name, e.target.value)}
                            value={consumerParams[c.name]?._managedClientId || ''}
                          >
                            <option value="">Manual configuration of consumer</option>
                            {relevantClients.map(rc => (
                              <option key={rc._id} value={rc._id}>{rc.label}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {c.parameters?.map(param => (
                        <div key={param.name} className="param-input-group">
                          <label className="param-label">{param.label}</label>
                          <input 
                            type={param.type || 'text'}
                            className="tech-input-small"
                            value={consumerParams[c.name]?.[param.name] || ''}
                            onChange={(e) => handleParamChange(c._id, c.name, param.name, e.target.value)}
                            disabled={!!consumerParams[c.name]?._managedClientId} 
                          />
                        </div>
                      ))}
                      {status?.error && <p className="error-text" style={{ fontSize: '10px', marginTop: '8px' }}>{status.error}</p>}
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