/*
 * FYP: Smart Gridx - Node B (SPAN PANEL / HOUSE SIDE)
 * UPDATED: Replaced DHT11 with DS18B20 Waterproof Sensor
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <PZEM004Tv30.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// ================= CONFIGURATION =================
const char* ssid = "WAJI NIAZI";
const char* password = "idontknow";

// Render URL (Backend)
const char* websocket_server_host = "smartgridxbackend.onrender.com"; 
const uint16_t websocket_server_port = 443; // 443 for SSL
const char* websocket_path = "/ws/hardware/house"; 

const char* DEVICE_ID = "span_panel";

// Pins
#define PZEM_RX_PIN 16 
#define PZEM_TX_PIN 17
#define PZEM_SERIAL Serial2
const int RELAY_PINS[4] = {18, 19, 21, 22}; 

// --- DS18B20 Configuration ---
// Data wire is plugged into GPIO 4 (Remember to add a 4.7k pull-up resistor between Data and 3.3V)
#define ONE_WIRE_BUS 4 
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

PZEM004Tv30 pzem(PZEM_SERIAL, PZEM_RX_PIN, PZEM_TX_PIN);
WebSocketsClient webSocket;

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 2000;
bool relayStates[4] = {false, false, false, false}; 

void setup() {
  Serial.begin(115200);

  // Relays
  for(int i=0; i<4; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], HIGH); // Active LOW -> HIGH is OFF
    relayStates[i] = false;
  }
  
  // Start the DS18B20 Sensor library
  sensors.begin();

  // WiFi
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while(WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println(" Connected!");

  // SSL WebSocket
  webSocket.beginSSL(websocket_server_host, websocket_server_port, websocket_path);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();

  if (millis() - lastSendTime > sendInterval) {
    sendDataAndState();
    lastSendTime = millis();
  }
}

void sendDataAndState() {
  float v = pzem.voltage();
  float i = pzem.current();
  float p = pzem.power();
  float e = pzem.energy();
  float freq = pzem.frequency();
  float pf = pzem.pf();

  // --- Read DS18B20 Temperature ---
  sensors.requestTemperatures(); // Command all devices on bus to read temperature
  float temp = sensors.getTempCByIndex(0); // Get temp from the first sensor

  // Validation
  if(isnan(v)) v = 0.0;
  
  // DS18B20 returns -127 if disconnected
  if(temp == DEVICE_DISCONNECTED_C) {
    temp = 0.0; // Or keep the last known good value if you prefer
    Serial.println("Error: Could not read temperature data");
  }

  DynamicJsonDocument doc(2048);
  doc["node_id"] = DEVICE_ID;
  doc["type"] = "span_panel";
  
  JsonObject sensorsObj = doc.createNestedObject("sensors");
  sensorsObj["voltage"] = v;
  sensorsObj["current"] = i;
  sensorsObj["power"] = p;
  sensorsObj["energy"] = e;
  sensorsObj["frequency"] = freq;
  sensorsObj["pf"] = pf;
  sensorsObj["temperature"] = temp;

  JsonArray relays = doc.createNestedArray("relays");
  for(int k=0; k<4; k++) relays.add(relayStates[k]);

  String output;
  serializeJson(doc, output);
  
  webSocket.sendTXT(output);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("Disconnected!");
      break;
    case WStype_CONNECTED:
      Serial.println("Connected to Server");
      break;
    case WStype_TEXT:
      handleCommand((char*)payload);
      break;
  }
}

void handleCommand(char* jsonMsg) {
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, jsonMsg);

  if (!error) {
    const char* action = doc["action"];
    if (strcmp(action, "set_relay") == 0) {
      int idx = doc["relay_index"];
      bool state = doc["state"];

      if(idx >= 0 && idx < 4) {
        digitalWrite(RELAY_PINS[idx], state ? LOW : HIGH); // Active LOW
        relayStates[idx] = state;
        sendDataAndState(); 
      }
    }
  }
}
