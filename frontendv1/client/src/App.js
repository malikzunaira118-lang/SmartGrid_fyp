import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Zap, 
  AlertTriangle, 
  ShieldCheck, 
  Server, 
  Thermometer, 
  Wifi, 
  Home,
  Clock,
  Battery,
  Power
} from 'lucide-react';

const WS_URL = "wss://smartgridxbackend.onrender.com/ws/client"; 

const defaultSystemData = {
  pole: { connected: false, voltage: 0, power: 0, current: 0, energy: 0, frequency: 0, pf: 0 },
  house: { connected: false, voltage: 0, power: 0, current: 0, energy: 0, temperature: 0, pf: 0, relays: [false, false, false, false] },
  alerts: { theft_detected: false, maintenance_risk: false, risk_score: 0, message: "Waiting for connection..." }
};

// --- CSS Styles ---
const styles = `
/* --- Global Variables & Resets --- */
:root {
  --bg-color: #f1f5f9;
  --card-bg: #ffffff;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --border-color: #e2e8f0;
   
  --accent-amber: #f59e0b;
  --accent-purple: #8b5cf6;
  --accent-blue: #3b82f6;
  --accent-green: #10b981;
  --accent-red: #ef4444;
  --accent-orange: #f97316;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--bg-color);
  color: var(--text-primary);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* --- Layout --- */
.dashboard-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
}

/* --- Header --- */
.app-header {
  background: var(--card-bg);
  padding: 1.25rem 2rem;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.header-brand { display: flex; align-items: center; gap: 1rem; }
.brand-icon-wrapper {
  background: linear-gradient(135deg, #1e293b, #0f172a);
  color: white;
  padding: 10px;
  border-radius: 12px;
  display: flex;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
}
.brand-text h1 { font-size: 1.5rem; font-weight: 800; color: var(--text-primary); margin:0; letter-spacing: -0.5px; }
.brand-text p { font-size: 0.875rem; color: var(--text-secondary); margin:0; font-weight: 500; }

.header-status { display: flex; gap: 1rem; align-items: center; }
.status-pill { 
    display: flex; 
    align-items: center; 
    gap: 8px; 
    font-size: 0.85rem; 
    font-weight: 600; 
    padding: 8px 16px;
    border-radius: 99px;
    border: 1px solid transparent;
    transition: all 0.2s;
}
.status-pill.online { background: #ecfdf5; color: var(--accent-green); border-color: #a7f3d0; }
.status-pill.offline { background: #f8fafc; color: var(--text-secondary); border-color: #cbd5e1; }

/* --- Alerts --- */
.alerts-container { margin-bottom: 2rem; display: flex; flex-direction: column; gap: 1rem; }
.alert-banner {
  padding: 1rem 1.5rem;
  border-radius: 16px;
  display: flex;
  align-items: center;
  gap: 1rem;
  animation: slideDown 0.3s ease-out;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
}
@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

.alert-banner.danger { background: #fef2f2; border: 1px solid #fee2e2; color: #991b1b; }
.alert-banner.warning { background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; }
.alert-icon-bg { padding: 8px; border-radius: 50%; background: rgba(255,255,255,0.8); }
.alert-content { display: flex; flex-direction: column; font-size: 0.95rem; font-weight: 500; }

/* --- Main Grid --- */
.main-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  align-items: start;
}
@media (min-width: 1024px) {
  .main-grid { grid-template-columns: 1fr 1fr; }
}

/* --- Section Containers --- */
.panel-section {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1.5rem;
}

/* --- Section Headers --- */
.section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 0.5rem; }
.section-icon { color: var(--text-secondary); opacity: 0.8; }
.section-header h2 { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }

/* --- Stats Cards --- */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: var(--card-bg);
  padding: 1.25rem;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  box-shadow: 0 1px 2px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.2s ease;
  min-height: 110px;
}
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); border-color: #cbd5e1; }

.stat-top { display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem; }
.stat-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.stat-value-wrapper { display: flex; align-items: baseline; gap: 3px; }
.stat-value { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
.stat-unit { font-size: 0.85rem; color: var(--text-secondary); font-weight: 600; }

.icon-badge { padding: 8px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.icon-badge.amber { background: #fffbeb; color: var(--accent-amber); }
.icon-badge.purple { background: #f3e8ff; color: var(--accent-purple); }
.icon-badge.blue { background: #eff6ff; color: var(--accent-blue); }
.icon-badge.green { background: #ecfdf5; color: var(--accent-green); }
.icon-badge.red { background: #fef2f2; color: var(--accent-red); }
.icon-badge.orange { background: #fff7ed; color: var(--accent-orange); }

/* --- Card Containers (Relay & AI) --- */
.card-container {
  background: var(--card-bg);
  padding: 1.5rem;
  border-radius: 24px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
  height: 100%; /* Fill available height */
  display: flex;
  flex-direction: column;
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.card-title { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }

/* --- Relay Buttons (Refined) --- */
.relay-grid { 
    display: grid; 
    grid-template-columns: repeat(2, 1fr); 
    gap: 1.25rem; 
    flex-grow: 1; /* Expand to fill space */
}

.relay-btn {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  padding: 1.25rem;
  border-radius: 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  min-height: 100px;
}

.relay-btn:hover {
    border-color: #cbd5e1;
    background: #f1f5f9;
}

.relay-btn.active { 
    background: #ffffff;
    border-color: var(--accent-blue);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
}
.relay-btn.active .relay-toggle {
    background: var(--accent-blue);
}
.relay-btn.active .relay-toggle::after {
    transform: translateX(20px);
}

.relay-top { width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.relay-label { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.relay-name { font-size: 1rem; font-weight: 700; color: var(--text-primary); }

/* Switch Graphic */
.relay-toggle {
    width: 44px;
    height: 24px;
    background: #cbd5e1;
    border-radius: 99px;
    position: relative;
    transition: background 0.3s ease;
}
.relay-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* --- AI Health Monitor Card (Refined) --- */
.ai-card { 
    background: radial-gradient(circle at top right, #1e293b, #0f172a); 
    color: white; 
    border: 1px solid #334155; 
    position: relative;
    overflow: hidden;
} 
/* Subtle pattern overlay */
.ai-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 20px 20px;
    pointer-events: none;
}

.ai-card h3 { color: white; font-size: 1.1rem; font-weight: 600; position: relative; z-index: 1; }

.ai-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; position: relative; z-index: 1; }
.ai-badge { font-size: 0.75rem; padding: 6px 12px; border-radius: 99px; font-weight: 700; letter-spacing: 0.5px; border: 1px solid transparent; }
.ai-badge.good { background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: rgba(16, 185, 129, 0.3); }
.ai-badge.bad { background: rgba(239, 68, 68, 0.2); color: #f87171; border-color: rgba(239, 68, 68, 0.3); }

.ai-body { position: relative; z-index: 1; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; }

.ai-stats-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 2rem;
}

.risk-metric { display: flex; flex-direction: column; }
.risk-score { font-size: 4rem; font-weight: 800; color: white; line-height: 1; letter-spacing: -3px; text-shadow: 0 4px 20px rgba(0,0,0,0.3); }
.risk-label { font-size: 0.85rem; color: #94a3b8; font-weight: 500; margin-top: 8px; display: flex; align-items: center; gap: 6px; }

.temp-metric { 
    display: flex; 
    flex-direction: column;
    align-items: flex-end; 
    gap: 8px; 
    background: rgba(255,255,255,0.05); 
    padding: 16px; 
    border-radius: 16px; 
    border: 1px solid rgba(255,255,255,0.05);
    backdrop-filter: blur(5px);
}
.temp-value { font-size: 1.75rem; font-weight: 700; color: white; display: flex; align-items: center; gap: 8px; line-height: 1; }
.temp-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }

.ai-footer { margin-top: 1.5rem; }
.ai-message { color: #cbd5e1; font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.5; font-weight: 400; opacity: 0.9; }

.ai-progress-track { background: rgba(255,255,255,0.1); height: 6px; border-radius: 99px; overflow: hidden; }
.ai-progress-fill { height: 100%; border-radius: 99px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
.ai-progress-fill.good { background: #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.6); }
.ai-progress-fill.bad { background: #ef4444; box-shadow: 0 0 15px rgba(239, 68, 68, 0.6); }
`;

// --- Helper Component: Stat Card ---
const StatCard = ({ label, value, unit, icon: Icon, colorClass }) => (
  <div className="stat-card">
    <div className="stat-top">
        <div className={`icon-badge ${colorClass}`}>
            <Icon size={18} />
        </div>
        <p className="stat-label">{label}</p>
    </div>
    <div className="stat-value-wrapper">
      <span className="stat-value">{value}</span>
      <span className="stat-unit">{unit}</span>
    </div>
  </div>
);

// --- Helper Component: Relay Button (Refined) ---
const RelayButton = ({ index, state, onClick }) => (
  <button 
    onClick={() => onClick(index, !state)} 
    className={`relay-btn ${state ? 'active' : ''}`}
  >
    <div className="relay-top">
      <span className="relay-label">Circuit {index + 1}</span>
      <div className="relay-toggle"></div>
    </div>
    <span className="relay-name">Button {index + 1}</span>
  </button>
);

const App = () => {
  const [socket, setSocket] = useState(null);
  const [systemData, setSystemData] = useState(defaultSystemData);

  // --- WebSocket Connection ---
  useEffect(() => {
    let ws;
    const connect = () => {
        ws = new WebSocket(WS_URL);
        ws.onopen = () => { console.log("Connected"); setSocket(ws); };
        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === "update") {
                    setSystemData(payload.data);
                }
            } catch (e) { console.error(e); }
        };
        ws.onclose = () => { setTimeout(connect, 3000); };
    };
    connect();
    return () => { if (ws) ws.close(); };
  }, []);

  // --- Relay Toggle Handler ---
  const toggleRelay = (index, newState) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: "set_relay", relay_index: index, state: newState }));
    } else {
        const newData = {...systemData};
        newData.house.relays[index] = newState;
        setSystemData(newData);
    }
  };

  const pole = systemData.pole || defaultSystemData.pole;
  const house = systemData.house || defaultSystemData.house;
  const alerts = systemData.alerts || defaultSystemData.alerts;

  return (
    <div className="dashboard-container">
      <style>{styles}</style>
      
      {/* --- HEADER --- */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon-wrapper">
            <Activity size={26} className="brand-icon" />
          </div>
          <div className="brand-text">
            <h1>Smart Gridx</h1>
            <p>IoT Monitoring & Predictive Maintenance</p>
          </div>
        </div>

        <div className="header-status">
           <div className={`status-pill ${pole.connected ? 'online' : 'offline'}`}>
              <Wifi size={14} /> 
              <span>Grid: {pole.connected ? 'Online' : 'Offline'}</span>
           </div>
           <div className={`status-pill ${house.connected ? 'online' : 'offline'}`}>
              <Server size={14} /> 
              <span>SPAN: {house.connected ? 'Online' : 'Offline'}</span>
           </div>
        </div>
      </header>

      {/* --- ALERTS SECTION --- */}
      <div className="alerts-container">
        {alerts.theft_detected && (
          <div className="alert-banner danger">
            <div className="alert-icon-bg"><AlertTriangle size={20} /></div>
            <div className="alert-content">
                <strong>THEFT DETECTED</strong>
                <span>Power mismatch detected between Pole and House source.</span>
            </div>
          </div>
        )}
        {alerts.maintenance_risk && (
          <div className="alert-banner warning">
            <div className="alert-icon-bg"><Activity size={20} /></div>
             <div className="alert-content">
                <strong>MAINTENANCE REQUIRED</strong>
                <span>System risk score is {alerts.risk_score}. Check equipment immediately.</span>
            </div>
          </div>
        )}
      </div>

      {/* --- MAIN GRID LAYOUT --- */}
      <main className="main-grid">
        
        {/* --- LEFT COLUMN: GRID SOURCE + RELAY CONTROL --- */}
        <section className="panel-section">
          <div className="section-header">
            <Zap className="section-icon" size={20} />
            <h2>Grid Source (Pole)</h2>
          </div>

          <div className="stats-grid">
            <StatCard label="Voltage" value={(pole.voltage || 0).toFixed(1)} unit="V" icon={Zap} colorClass="amber" />
            <StatCard label="Current" value={(pole.current || 0).toFixed(2)} unit="A" icon={Activity} colorClass="blue" />
            <StatCard label="Power" value={(pole.power || 0).toFixed(0)} unit="W" icon={Zap} colorClass="amber" />
            <StatCard label="Total Energy" value={(pole.energy || 0).toFixed(2)} unit="kWh" icon={Battery} colorClass="green" />
            <StatCard label="Power Factor" value={(pole.pf || 0).toFixed(2)} unit="" icon={ShieldCheck} colorClass="purple" />
          </div>

          {/* RELAY CONTROL (Stretches to fill vertical space) */}
          <div className="card-container relay-container">
            <div className="card-header">
                <div className="card-title">Circuit Control</div>
                <Power size={20} className="text-gray-400" />
            </div>
            <div className="relay-grid">
              {(house.relays || [false, false, false, false]).map((state, idx) => (
                <RelayButton key={idx} index={idx} state={state} onClick={toggleRelay} />
              ))}
            </div>
          </div>
        </section>

        {/* --- RIGHT COLUMN: SMART HOME + AI MONITOR --- */}
        <section className="panel-section">
          <div className="section-header">
            <Server className="section-icon" size={20} />
            <h2>Smart Home (SPAN Panel)</h2>
          </div>
          
          <div className="stats-grid">
            <StatCard label="Voltage" value={(house.voltage || 0).toFixed(1)} unit="V" icon={Zap} colorClass="blue" />
            <StatCard label="Current" value={(house.current || 0).toFixed(2)} unit="A" icon={Activity} colorClass="blue" />
            <StatCard label="Power" value={(house.power || 0).toFixed(0)} unit="W" icon={Home} colorClass="blue" />
            <StatCard label="Total Energy" value={(house.energy || 0).toFixed(2)} unit="kWh" icon={Battery} colorClass="green" />
            <StatCard label="Power Factor" value={(house.pf || 0).toFixed(2)} unit="" icon={ShieldCheck} colorClass="purple" />
          </div>

          {/* AI HEALTH MONITOR (Stretches to fill vertical space) */}
          <div className="card-container ai-card">
              <div className="ai-header-row">
                  <h3>AI Health Monitor</h3>
                  <div className={`ai-badge ${alerts.maintenance_risk ? 'bad' : 'good'}`}>
                      {alerts.maintenance_risk ? 'RISK DETECTED' : 'SYSTEM OPTIMAL'}
                  </div>
              </div>

              <div className="ai-body">
                 <div className="ai-stats-row">
                    {/* Risk Score */}
                    <div className="risk-metric">
                        <span className="risk-score">{(alerts.risk_score || 0).toFixed(2)}</span>
                        <span className="risk-label">
                            <Activity size={14} /> Failure Probability
                        </span>
                    </div>

                    {/* Temperature */}
                    <div className="temp-metric">
                        <span className="temp-label">Panel Temp</span>
                        <span className="temp-value">
                            <Thermometer size={24} className={house.temperature > 40 ? "text-red-400" : "text-emerald-400"} />
                            {(house.temperature || 0).toFixed(1)}°C
                        </span>
                    </div>
                 </div>

                 <div className="ai-footer">
                    <p className="ai-message">{alerts.message || "Monitoring system parameters for anomalies..."}</p>
                    <div className="ai-progress-track">
                        <div 
                            className={`ai-progress-fill ${alerts.maintenance_risk ? 'bad' : 'good'}`}
                            style={{ width: `${Math.min((alerts.risk_score || 0) * 100, 100)}%` }}
                        />
                    </div>
                 </div>
              </div>
          </div>

        </section>
      </main>
    </div>
  );
};

export default App;
