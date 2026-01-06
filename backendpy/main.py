import json
import asyncio
import logging
import asyncpg  # Database driver
from typing import Dict, List, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

# ================= CONFIGURATION =================
app = FastAPI(title="Smart Gridx Backend")

# Database Connection String
DATABASE_URL = "postgresql://neondb_owner:npg_KiG3oYvEQaA2@ep-bold-feather-a1sewfka-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# Allow CORS for React Frontend
origins = [
    "http://localhost:5173",           
    "https://smartgridx.onrender.com" 
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SmartGridx")

# ================= STATE MANAGEMENT (Global) =================
# We store the latest values here. 
# When we save to DB, we dump this entire object to ensure "Both in one row".
system_state = {
    "pole": {
        "connected": False,
        "node_id": "Grid_Pole_Master",
        "power": 0.0,
        "voltage": 0.0,
        "current": 0.0,
        "energy": 0.0,
        "pf": 0.0,
        "frequency": 0.0,
        "last_seen": None
    },
    "house": {
        "connected": False,
        "node_id": "House_Unit_1",
        "power": 0.0,
        "voltage": 0.0,
        "current": 0.0,
        "energy": 0.0,
        "temperature": 25.0,
        "frequency": 0.0, 
        "relays": [False, False, False, False],
        "pf": 0.0,
        "last_seen": None
    },
    "alerts": {
        "theft_detected": False,
        "maintenance_risk": False,
        "risk_score": 0.0,
        "message": "System Normal"
    }
}

# ================= DATABASE MANAGER =================
class DatabaseManager:
    def __init__(self):
        self.pool = None

    async def connect(self):
        """Create a connection pool to NeonDB"""
        try:
            self.pool = await asyncpg.create_pool(dsn=DATABASE_URL)
            logger.info("Connected to NeonDB PostgreSQL")
            await self.create_table()
        except Exception as e:
            logger.error(f"Database connection failed: {e}")

    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            logger.info("Disconnected from NeonDB")

    async def create_table(self):
        """
        Creates the table 'smart_grid_data' to store snapshots.
        Columns are renamed to grid_* (for pole) and home_* (for house).
        UPDATED: Added columns for Risk Score and Alerts.
        """
        query = """
        CREATE TABLE IF NOT EXISTS smart_grid_data (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            trigger_source VARCHAR(20), -- Which device caused this update ('pole' or 'house')
            
            -- GRID / POLE MODULE DATA
            grid_id VARCHAR(50),
            grid_voltage REAL,
            grid_current REAL,
            grid_power REAL,
            grid_energy REAL,
            grid_frequency REAL,
            grid_pf REAL,
            
            -- HOME / INDOOR MODULE DATA
            home_id VARCHAR(50),
            home_voltage REAL,
            home_current REAL,
            home_power REAL,
            home_energy REAL,
            home_frequency REAL,
            home_pf REAL,
            home_temperature REAL,
            
            -- AI & ALERTS DATA
            risk_score REAL,
            alert_theft BOOLEAN,
            alert_maintenance BOOLEAN
        );
        """
        async with self.pool.acquire() as connection:
            await connection.execute(query)
            logger.info("Table 'smart_grid_data' checked/created.")

    async def save_snapshot(self, source: str):
        """
        Saves the CURRENT global state of both Pole (Grid) and House (Home) into one row.
        Includes AI predictions and Alert status.
        """
        if not self.pool:
            return

        query = """
        INSERT INTO smart_grid_data (
            trigger_source,
            grid_id, grid_voltage, grid_current, grid_power, grid_energy, grid_frequency, grid_pf,
            home_id, home_voltage, home_current, home_power, home_energy, home_frequency, home_pf, home_temperature,
            risk_score, alert_theft, alert_maintenance
        ) VALUES (
            $1,
            $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19
        )
        """
        
        # Get latest data from memory
        pole = system_state["pole"]
        house = system_state["house"]
        alerts = system_state["alerts"]

        try:
            async with self.pool.acquire() as connection:
                await connection.execute(
                    query,
                    source,
                    # Grid / Pole Values
                    pole.get("node_id"), pole["voltage"], pole["current"], pole["power"], pole["energy"], pole["frequency"], pole["pf"],
                    # Home / House Values
                    house.get("node_id"), house["voltage"], house["current"], house["power"], house["energy"], house["frequency"], house["pf"], house["temperature"],
                    # AI / Alerts Values
                    alerts["risk_score"], alerts["theft_detected"], alerts["maintenance_risk"]
                )
                logger.info(f"Snapshot saved to smart_grid_data. Trigger: {source}")
        except Exception as e:
            logger.error(f"Failed to insert snapshot: {e}")

db_manager = DatabaseManager()

# ================= LOGIC & CALCULATIONS =================
def update_system_logic():
    """
    Run centralized logic: Theft Detection & Maintenance
    """
    pole = system_state["pole"]
    house = system_state["house"]
    alerts = system_state["alerts"]

    # 1. Theft Logic (Simplified)
    if pole["connected"] and house["connected"]:
        loss_threshold = 15.0 
        if (pole["power"] - house["power"]) > loss_threshold:
            alerts["theft_detected"] = True
            alerts["message"] = "THEFT DETECTED: Line Loss Exceeds Threshold!"
        else:
            alerts["theft_detected"] = False
            alerts["message"] = "System Optimal"
    
    # 2. Predictive Maintenance
    risk_score = 0.0
    if pole["pf"] > 0 and pole["pf"] < 0.85: risk_score += 0.4
    if house["pf"] > 0 and house["pf"] < 0.85: risk_score += 0.3
        
    alerts["risk_score"] = min(risk_score, 1.0)
    alerts["maintenance_risk"] = risk_score > 0.6
    
    if alerts["maintenance_risk"] and not alerts["theft_detected"]:
        alerts["message"] = "MAINTENANCE ALERT: High Grid Instability"

# ================= WEBSOCKET MANAGER =================
class ConnectionManager:
    def __init__(self):
        self.hardware_connections: Dict[str, WebSocket] = {}
        self.frontend_connections: List[WebSocket] = []

    async def connect_hardware(self, websocket: WebSocket, device_type: str):
        await websocket.accept()
        self.hardware_connections[device_type] = websocket
        logger.info(f"Hardware connected: {device_type}")
        if device_type in system_state:
            system_state[device_type]["connected"] = True
        await self.broadcast_state()

    def disconnect_hardware(self, device_type: str):
        if device_type in self.hardware_connections:
            del self.hardware_connections[device_type]
        if device_type in system_state:
            system_state[device_type]["connected"] = False
        logger.info(f"Hardware disconnected: {device_type}")

    async def connect_frontend(self, websocket: WebSocket):
        await websocket.accept()
        self.frontend_connections.append(websocket)
        logger.info("Frontend client connected")

    def disconnect_frontend(self, websocket: WebSocket):
        if websocket in self.frontend_connections:
            self.frontend_connections.remove(websocket)
            logger.info("Frontend client disconnected")

    async def broadcast_state(self):
        for connection in self.frontend_connections:
            try:
                await connection.send_json(system_state)
            except Exception as e:
                logger.error(f"Error broadcasting: {e}")

    async def send_command_to_house(self, command: dict):
        if "house" in self.hardware_connections:
            try:
                await self.hardware_connections["house"].send_text(json.dumps(command))
            except Exception as e:
                logger.error(f"Failed to send command to house: {e}")

manager = ConnectionManager()

# ================= LIFECYCLE EVENTS =================
@app.on_event("startup")
async def startup_event():
    await db_manager.connect()

@app.on_event("shutdown")
async def shutdown_event():
    await db_manager.disconnect()

# ================= WEBSOCKET ENDPOINTS =================

@app.websocket("/ws/hardware/{device_type}")
async def websocket_hardware(websocket: WebSocket, device_type: str):
    # device_type should be "pole" or "house"
    await manager.connect_hardware(websocket, device_type)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            # --- UPDATE STATE BASED ON DEVICE ---
            if device_type == "pole":
                system_state["pole"].update({
                    "node_id": payload.get("node_id", "Grid_Pole"),
                    "voltage": payload.get("voltage", 0),
                    "current": payload.get("current", 0),
                    "power": payload.get("power", 0),
                    "energy": payload.get("energy", 0),
                    "frequency": payload.get("frequency", 50),
                    "pf": payload.get("pf", 0),
                    "last_seen": datetime.now().isoformat()
                })
                
            elif device_type == "house":
                sensors = payload.get("sensors", {})
                relays = payload.get("relays", [False, False, False, False])
                
                system_state["house"].update({
                    "node_id": payload.get("node_id", "House_Node"),
                    "voltage": sensors.get("voltage", 0),
                    "current": sensors.get("current", 0),
                    "power": sensors.get("power", 0),
                    "energy": sensors.get("energy", 0),
                    "temperature": sensors.get("temperature", 25),
                    "frequency": sensors.get("frequency", 50),
                    "pf": sensors.get("pf", 0),
                    "relays": relays,
                    "last_seen": datetime.now().isoformat()
                })
            
            # --- SAVE SNAPSHOT TO DATABASE ---
            # This inserts ONE row containing BOTH Pole and House data
            # Now includes Alert State and Risk Score
            asyncio.create_task(db_manager.save_snapshot(device_type))

            update_system_logic()
            await manager.broadcast_state()
            
    except WebSocketDisconnect:
        manager.disconnect_hardware(device_type)
        await manager.broadcast_state()

@app.websocket("/ws/client")
async def websocket_frontend(websocket: WebSocket):
    await manager.connect_frontend(websocket)
    try:
        await manager.broadcast_state()
        while True:
            data = await websocket.receive_text()
            command = json.loads(data)
            if command.get("action") == "set_relay":
                await manager.send_command_to_house(command)
    except WebSocketDisconnect:
        manager.disconnect_frontend(websocket)

@app.get("/")
def read_root():
    return {"status": "SmartGridx Backend Running", "db_status": "Connected" if db_manager.pool else "Disconnected"}
