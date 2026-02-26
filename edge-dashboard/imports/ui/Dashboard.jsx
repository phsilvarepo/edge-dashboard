import React, { useState } from 'react';
import ProvidersTab from './ProvidersTab';
import ParsersTab from './ParsersTab';
import ConsumersTab from './ConsumersTab';
import ConnectorsList from './ConnectorsList';
import AddConnector from './AddConnector';
import './Dashboard.css'; // Import the new styles

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('connectors');

  const navItems = [
    { id: 'providers', label: 'Providers' },
    { id: 'parsers', label: 'Parsers' },
    { id: 'consumers', label: 'Consumers' },
    { id: 'connectors', label: 'Pipelines' },
  ];

  return (
    <div className="dashboard-wrapper">
      <header className="dashboard-header">
        <h1>EDGE<span style={{color: '#8b949e', fontWeight: 300}}>CORE</span></h1>
        
        <nav className="tab-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`tab-button ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              {item.label.toUpperCase()}
            </button>
          ))}
        </nav>
      </header>

      <main className="content-area">
        {activeTab === 'providers' && <ProvidersTab />}
        {activeTab === 'parsers' && <ParsersTab />}
        {activeTab === 'consumers' && <ConsumersTab />}
        {activeTab === 'connectors' && (
          <div className="full-width-view">
            <ConnectorsList />
          </div>
        )}
      </main>
    </div>
  );
}