import React, { useState } from 'react';
import ProvidersTab from './ProvidersTab';
import ParsersTab from './ParsersTab';
import ConsumersTab from './ConsumersTab';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('providers');

  return (
    <div>
      <h1>Service Connector Dashboard</h1>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setActiveTab('providers')}>Providers</button>
        <button onClick={() => setActiveTab('parsers')}>Parsers</button>
        <button onClick={() => setActiveTab('consumers')}>Consumers</button>
      </div>

      <hr />

      {activeTab === 'providers' && <ProvidersTab />}
      {activeTab === 'parsers' && <ParsersTab />}
      {activeTab === 'consumers' && <ConsumersTab />}
    </div>
  );
}