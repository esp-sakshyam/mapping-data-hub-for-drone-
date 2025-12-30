import http.server
import socketserver
import json
import urllib.request
import urllib.error
import urllib.parse
import os
import sys
import ssl

import time

PORT = 8000
SETTINGS_FILE = 'data/settings.json'
START_TIME = time.time()

# Use unverified context to avoid SSL errors on local machines with outdated certs
ssl_context = ssl._create_unverified_context()

class DroneHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/api/api.php?action=get_telemetry'):
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
            
            # Inject Uptime
            settings['uptime_seconds'] = int(time.time() - START_TIME)
            
            self.wfile.write(json.dumps(settings).encode())
        elif self.path.startswith('/api/api.php?action=get_intel'):
            query_components = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            lat = query_components.get('lat', ['27.7172'])[0]
            lng = query_components.get('lng', ['85.3240'])[0]
            
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
            
            api_key = settings['config'].get('serp_api_key', '')
            if not api_key:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "SerpApi Key Missing", "local_results": []}).encode())
                return

            url = f"https://serpapi.com/search.json?engine=google_maps&q=emergency+hospitals+landing+zones&ll=@{lat},{lng},14z&api_key={api_key}"
            
            try:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, context=ssl_context, timeout=10) as response:
                    res_body = response.read()
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(res_body)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e), "local_results": []}).encode())
        else:
            super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        input_data = json.loads(post_data.decode('utf-8'))

        if self.path == '/api/api.php?action=update_settings':
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
            
            if 'telemetry' in input_data:
                self.deep_merge(settings['telemetry'], input_data['telemetry'])
            
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(settings, f, indent=4)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success'}).encode())

        elif self.path == '/api/api.php?action=chat':
            message = input_data.get('message', '')
            image_data = input_data.get('image', None) # Base64 string
            print(f"[AI] Query: {message[:50]}...{' [With Image]' if image_data else ''}")
            
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
            
            # --- MOCK AI FALLBACK (Improved with keyword detection) ---
            msg_lower = message.lower()
            mock_responses = {
                "status": f"Systems are nominal. Battery at {settings['telemetry']['system']['battery']}%.",
                "temperature": f"Current temp is {settings['telemetry']['temperature']}°C. Internal cooling active.",
                "gas": f"Detected {settings['telemetry']['harmful_gas']['type']} at {settings['telemetry']['harmful_gas']['level']}.",
                "location": f"Currently hovering over {settings['telemetry']['gps']['location']}.",
                "who are you": "I am the AI Drone Hub developed by Sakshyam Upadhayay.",
                "hello": "Hello! Tactical Analysis Core ready. Ask me about the drone status.",
                "air quality": f"AQI is currently {settings['telemetry']['air_quality']}. { 'Hazardous' if settings['telemetry']['air_quality'] > 100 else 'Safe' }."
            }

            if not image_data: # Only mock if no image
                for key in mock_responses:
                    if key in msg_lower:
                        self.send_response(200)
                        self.send_header('Content-type', 'application/json')
                        self.end_headers()
                        mock_json = {"candidates": [{"content": {"parts": [{"text": mock_responses[key]}]}}]}
                        self.wfile.write(json.dumps(mock_json).encode())
                        return

            # --- REAL AI CALL ---
            api_key = settings['config']['gemini_api_key']
            telemetry_context = json.dumps(settings['telemetry'])
            prompt = (
                f"SYSTEM ROLE: You are the AI Brain of an Advanced Agricultural Drone ('Drone AI Pro') in Nepal. "
                f"Your Goal: Assist farmers with precision agriculture data. "
                f"Instructions: "
                f"1. ANALYZE the provided Telemetry Context (Soil, Weather, Pests, Crop Health) deeply. "
                f"2. IDENTIFY risks (e.g., 'High Humidity = Blight Risk', 'Low Soil Moisture = Irrigation Needed'). "
                f"3. LANGUAGE: If the user asks in NEPALI, answer in FLUENT NEPALI. If in English, answer in English but keep it simple for farmers. "
                f"4. TONE: Helpful, Expert, Concise. "
                f"Telemetry Context: {telemetry_context}. "
                f"User Query: {message}"
            )
            
            url = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={api_key}"
            
            # Construct Multimodal Body
            parts = [{"text": prompt}]
            if image_data:
                # Remove data:image/png;base64, prefix if present
                if ',' in image_data:
                    mime, b64 = image_data.split(',')
                    mime = mime.split(':')[1].split(';')[0]
                else:
                    mime = "image/png"
                    b64 = image_data
                parts.append({
                    "inline_data": {
                        "mime_type": mime,
                        "data": b64
                    }
                })

            data = {"contents": [{"parts": parts}]}
            
            req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
            
            try:
                print(f"[AI] Calling Google Gemini API (Key: {api_key[:6]}...)")
                with urllib.request.urlopen(req, context=ssl_context, timeout=15) as response:
                    res_body = response.read()
                    print("[AI] Response Received.")
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(res_body)
            except urllib.error.HTTPError as e:
                err_text = e.read().decode()
                print(f"[AI ERROR] API Error {e.code}: {err_text}")
                self.send_response(e.code)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(err_text.encode())
            except Exception as e:
                self.wfile.write(json.dumps({'error': str(e)}).encode())

        elif self.path == '/api/api.php?action=generate_report':
            with open(SETTINGS_FILE, 'r') as f:
                settings = json.load(f)
            
            api_key = settings['config']['gemini_api_key']
            telemetry = settings['telemetry']
            location = telemetry['gps']['location']
            
            # Specialized Prompt for Report
            prompt = (
                f"ACT AS: Chief Agricultural Officer of Nepal. "
                f"TASK: Write a formal, high-level Agronomy Inspection Report for '{location}'. "
                f"CONTEXT: This is a government/scientific document. NO introductory filler (like 'Here is the report'). Start directly with the content. "
                f"\n\nDATA SNAPSHOT:"
                f"\n- Soil Temp: {telemetry['advanced_env']['soil_temp']}°C"
                f"\n- Humidity: {telemetry['humidity']}%"
                f"\n- Wind: {telemetry['advanced_env']['wind_speed']} km/h (Pressure: {telemetry['advanced_env']['pressure']} hPa)"
                f"\n- Pest Threat Level: {telemetry['ai_detection']['insects']} insects detected."
                f"\n\nSTRUCTURE (Use HTML tags <h2> for headers, <p> for paragraphs, <ul>/<li> for lists):"
                f"\n<h2>1. EXECUTIVE SUMMARY</h2>"
                f"\n<p>[Brief high-level assessment of the zone's current viability].</p>"
                f"\n<h2>2. ENVIRONMENTAL ANALYSIS</h2>"
                f"\n<p>[Detailed breakdown of the telemetry. Is the soil temp ideal for the local crop? Is humidity a blight risk? Use scientific terms like 'Transpiration rates', 'Pathogen vectors', 'Vapor pressure deficit'].</p>"
                f"\n<h2>3. KNOWN CROP COMPATIBILITY</h2>"
                f"\n<p>[Identify crops native to {location} (e.g. Rice, Maize, Tea, Apples) and evaluate if current conditions match their phenological needs].</p>"
                f"\n<h2>4. RISK MITIGATION & PROTOCOLS</h2>"
                f"\n<ul>[3-4 Bullet points on immediate actions for the farmer. Be specific. e.g. 'Apply fungicides due to humidity > 80%'].</ul>"
                f"\n<h2>5. YIELD PROJECTION</h2>"
                f"\n<p>[Estimated yield outcome if current conditions persist].</p>"
            )

            url = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={api_key}"
            data = {"contents": [{"parts": [{"text": prompt}]}]}
            
            req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
            
            try:
                print(f"[REPORT] Generating Report for {location}...")
                with urllib.request.urlopen(req, context=ssl_context, timeout=25) as response:
                    res_body = response.read()
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(res_body)
            except Exception as e:
                print(f"[REPORT ERROR] {e}")
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode())

    def deep_merge(self, base, update):
        for key, value in update.items():
            if isinstance(value, dict) and key in base:
                self.deep_merge(base[key], value)
            else:
                base[key] = value

if __name__ == "__main__":
    # Ensure data dir exists
    if not os.path.exists('data'):
        os.makedirs('data')
    
    # Robustness: Create settings.json if missing
    if not os.path.exists(SETTINGS_FILE):
        print("Settings file missing. Creating default...")
        default_settings = {
            "config": {
                "gemini_api_key": "",
                "serp_api_key": "", 
                "google_api_key": "",
                "camera_ip": "1.2.3.4"
            },
            "telemetry": {
                "gps": { "lat": 27.7172, "lng": 85.3240, "location": "Kathmandu (Default)" },
                "air_quality": 50,
                "temperature": 25.0,
                "humidity": 60,
                "harmful_gas": { "type": "None", "level": "0 ppm" },
                "flame": "Safe",
                "system": { "battery": 100 },
                "ai_detection": { "insects": 0 },
                "gyro": { "x": 0, "y": 0, "z": 0 },
                "gsm": { "signal": 100 },
                "advanced_env": {
                    "co2": "400ppm", "uv_index": "3", "pressure": "1013hPa",
                    "wind_speed": "10km/h", "wind_dir": "NE", "soil_temp": "20C",
                    "light_lvl": "5000lux", "vibration": "0.01g",
                    "pollen": { "tree": "Low", "grass": "None", "weed": "Low" },
                    "solar": { "potential_kw": "10.5", "sunlight_hours": "1200" }
                }
            }
        }
        with open(SETTINGS_FILE, 'w') as f:
            json.dump(default_settings, f, indent=4)

        
    print(f"Starting Drone Dashboard Server on http://localhost:{PORT}")
    print("Zero-Config Python Environment detected.")
    with socketserver.TCPServer(("", PORT), DroneHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            sys.exit(0)
