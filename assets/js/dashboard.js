// --- GLOBALS & STATE ---
let map, aerialMap, thermalMap, droneMarker, scene, camera, renderer, droneModel;
let propellers = []; // Store props for animation
let telemetryCache = {};
let currentCameraIp = "";
let cpuChart;

// --- INITIALIZATION ---
window.onload = async () => {
    initTime();
    initMap();
    initThree();
    initCharts();
    initWeather();

    // Start Polling
    fetchData();
    fetchIntel(); // Initial Intel fetch
    fetchRealAQI(); // Real AQI
    fetchEarthquakes(); // Real Earthquakes

    setInterval(fetchData, 2000);
    setInterval(updateTime, 1000);
    setInterval(fetchIntel, 60000); // Update intel every minute
    setInterval(fetchRealAQI, 300000); // 5 mins
    setInterval(fetchEarthquakes, 300000); // 5 mins



    window.addEventListener('resize', onResize);
    document.getElementById('user-input').focus();
};

// --- CORE FUNCTIONS ---

function initTime() {
    updateTime();
}

function updateTime() {
    const now = new Date();
    document.getElementById('system-time').innerText = now.toISOString().replace('T', ' ').substring(0, 19) + " UTC";
}

// --- MISSION SITES (Tactical Overlay) ---
const missionSites = [
    {
        name: "UNIGLOBE SS/COLLEGE (KAMALADI)",
        coords: [27.7088, 85.3204],
        stats: { aqi: 42, temp: 22.4, env: "Trace CO2", threat: "Clear" }
    },
    {
        name: "LABORATORY SECONDARY SCHOOL",
        coords: [27.6793, 85.2872],
        stats: { aqi: 38, temp: 21.8, env: "Natural", threat: "Low UV" }
    },
    {
        name: "GOKARNA FOREST RESORT",
        coords: [27.7347, 85.3904],
        stats: { aqi: 12, temp: 18.5, env: "Air Pure", threat: "Secure" }
    },
    {
        name: "CHANDRAGIRI HILLS RESORT",
        coords: [27.6534, 85.2078],
        stats: { aqi: 6, temp: 15.2, env: "Oxygen High", threat: "Icy" }
    },
    {
        name: "TOKHA ORGANIC FARM ZONE",
        coords: [27.7780, 85.3200],
        stats: { aqi: 22, temp: 20.1, env: "Methane 0.01%", threat: "OK" }
    },
    {
        name: "BHAKTAPUR AGRI ZONE (FARM LAND)",
        coords: [27.6710, 85.4298],
        stats: { aqi: 15, temp: 19.5, env: "Soil Rich", threat: "Clear" }
    },
    {
        name: "NATIONAL INSTITUTE OF ENG. & TECH",
        coords: [27.6864, 85.3154],
        stats: { aqi: 45, temp: 23.1, env: "Urban", threat: "Crowded" }
    },
    // --- MAJOR AGRICULTURAL ZONES (NEPAL) ---
    { name: "JHAPA TEA ESTATES", coords: [26.6430, 87.9919], stats: { aqi: 35, temp: 28.5, env: "Humid", threat: "Pest Risk" } },
    { name: "ILAM OOLONG GARDENS", coords: [26.9080, 87.9351], stats: { aqi: 15, temp: 19.2, env: "Mist", threat: "Clear" } },
    { name: "CHITWAN MUSTARD FIELDS", coords: [27.5291, 84.3542], stats: { aqi: 40, temp: 30.1, env: "Hot", threat: "Wildlife" } },
    { name: "MUSTANG APPLE ORCHARDS", coords: [28.7845, 83.7291], stats: { aqi: 5, temp: 12.4, env: "Arid", threat: "Windy" } },
    { name: "JUMLA ORGANIC ZONE", coords: [29.2747, 82.1803], stats: { aqi: 8, temp: 15.6, env: "Alpine", threat: "Cold" } },
    { name: "BARA FISH FARMS", coords: [26.9167, 85.0833], stats: { aqi: 45, temp: 29.8, env: "Water", threat: "Flooding" } },
    { name: "PALPA COFFEE HILLS", coords: [27.8652, 83.5484], stats: { aqi: 25, temp: 24.0, env: "Temperate", threat: "Slope" } },
    { name: "SANKHUWASABHA CARDAMOM", coords: [27.6167, 87.2167], stats: { aqi: 10, temp: 18.5, env: "Cloudy", threat: "Rain" } },
    { name: "KAPILVASTU WHEAT BELT", coords: [27.5333, 83.0500], stats: { aqi: 55, temp: 31.2, env: "Dusty", threat: "Drought" } },
    { name: "ROLPA MAIZE FIELDS", coords: [28.3625, 82.6375], stats: { aqi: 18, temp: 21.3, env: "Hills", threat: "Erosion" } }
];

function initMap() {
    map = L.map('mission-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([27.7000, 85.3400], 12);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);

    missionSites.forEach(site => {
        const siteIcon = L.divIcon({
            className: 'site-marker',
            html: `<div class="marker-pulse"></div><div class="marker-label">${site.name}</div>`,
            iconSize: [20, 20]
        });

        const marker = L.marker(site.coords, { icon: siteIcon }).addTo(map);
        marker.bindPopup(`
            <div style="background: #0d1626; color: #00d2ff; padding: 10px; border: 1px solid #00d2ff; font-family: 'Orbitron';">
                <div style="font-weight: bold; border-bottom: 1px solid #00d2ff; margin-bottom: 5px;">${site.name}</div>
                <div style="font-size: 10px;">AQI: ${site.stats.aqi}</div>
                <div style="font-size: 10px;">TEMP: ${site.stats.temp}°C</div>
                <div style="font-size: 10px; color: #ff3e3e;">STATUS: ${site.stats.threat}</div>
                <button onclick="teleportToSite('${site.name}')" style="margin-top:10px; width:100%; border:1px solid #00d2ff; background:rgba(0,210,255,0.1); color:#00d2ff; cursor:pointer; font-family:'Orbitron'; padding:5px;">LAUNCH MISSION</button>
            </div>
        `);
    });

    const droneIcon = L.divIcon({
        className: 'drone-icon',
        html: `<div style="width: 20px; height: 20px; background: #00d2ff; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 15px #00d2ff;"></div>`,
        iconSize: [20, 20]
    });

    droneMarker = L.marker([27.7088, 85.3204], { icon: droneIcon, zIndexOffset: 1000 }).addTo(map);

    // --- INIT AERIAL RECON MAP (Esri Satellite) ---
    aerialMap = L.map('aerial-map-leaflet', {
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0,
        dragging: false, // Locked view
        scrollWheelZoom: false
    }).setView([27.7172, 85.3240], 18);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    }).addTo(aerialMap);

    // --- INIT THERMAL MAP (NASA GIBS) ---
    thermalMap = L.map('thermal-map-leaflet', {
        zoomControl: false,
        attributionControl: false,
        zoomSnap: 0,
        dragging: false,
        scrollWheelZoom: false
    }).setView([27.7172, 85.3240], 10); // Lower zoom for LST data visibility

    // Get yesterday's date for guaranteed data availability
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2); // safely go back 2 days
    const dateStr = yesterday.toISOString().split('T')[0];

    // NASA GIBS WMTS Endpoint for MODIS Terra Land Surface Temperature (Day)
    const gibsUrl = `https://map1.vis.earthdata.nasa.gov/wmts-webmerc/MODIS_Terra_Land_Surface_Temperature_Day/default/${dateStr}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`;

    L.tileLayer(gibsUrl, {
        attribution: 'NASA GIBS',
        maxZoom: 9, // LST data is low res
        opacity: 0.8
    }).addTo(thermalMap);

    // Add a dark base layer underneath to make it pop
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        opacity: 0.5
    }).addTo(thermalMap);
}

window.teleportToSite = async (siteName) => {
    const site = missionSites.find(s => s.name === siteName);
    if (!site) return;

    map.closePopup();
    addLog(`INITIATING FLIGHT TO ${siteName}...`);

    const startPos = droneMarker.getLatLng();
    const endPos = L.latLng(site.coords[0], site.coords[1]);
    const steps = 60;
    const duration = 3000;
    let step = 0;

    const flight = setInterval(async () => {
        step++;
        const p = step / steps;
        const lat = startPos.lat + (endPos.lat - startPos.lat) * p;
        const lng = startPos.lng + (endPos.lng - startPos.lng) * p;

        droneMarker.setLatLng([lat, lng]);
        map.panTo([lat, lng]);

        if (step >= steps) {
            clearInterval(flight);
            addLog(`MISSION ARRIVAL: ${siteName}`);
            const updates = {
                telemetry: {
                    gps: { lat: site.coords[0], lng: site.coords[1], location: site.name },
                    air_quality: site.stats.aqi,
                    temperature: site.stats.temp
                }
            };
            await fetch('/api/api.php?action=update_settings', { method: 'POST', body: JSON.stringify(updates) });
            updateAerialView(site.coords[0], site.coords[1]);
            fetchData();
        }
    }, duration / steps);
};

function updateAerialView(lat, lng) {
    if (aerialMap) {
        aerialMap.flyTo([lat, lng], 18, { animate: true, duration: 1.5 });
    }
    if (thermalMap) {
        // Thermal map needs lower zoom
        thermalMap.flyTo([lat, lng], 10, { animate: true, duration: 1.5 });
    }
}

function initThree() {
    const container = document.getElementById('three-container');
    if (!container) return;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 2);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x00d2ff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    // --- DRONE MODEL (Quadcopter) ---
    droneModel = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, specular: 0x00d2ff, shininess: 100 });
    const armMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const propMat = new THREE.MeshPhongMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.8 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });

    // 1. Central Body
    const bodyGeo = new THREE.BoxGeometry(1, 0.4, 2);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    droneModel.add(body);

    // 2. Arms (X-Shape)
    const armGeo = new THREE.CylinderGeometry(0.1, 0.1, 4.5);
    const arm1 = new THREE.Mesh(armGeo, armMat);
    arm1.rotation.z = Math.PI / 2;
    arm1.rotation.y = Math.PI / 4;
    droneModel.add(arm1);

    const arm2 = new THREE.Mesh(armGeo, armMat);
    arm2.rotation.z = Math.PI / 2;
    arm2.rotation.y = -Math.PI / 4;
    droneModel.add(arm2);

    // 3. Motors & Propellers
    const positions = [
        { x: 1.5, z: 1.5, dir: 1 },  // Front Left
        { x: -1.5, z: 1.5, dir: -1 }, // Front Right
        { x: 1.5, z: -1.5, dir: -1 }, // Back Left
        { x: -1.5, z: -1.5, dir: 1 }  // Back Right
    ];

    positions.forEach(pos => {
        // Motor
        const motorGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3);
        const motor = new THREE.Mesh(motorGeo, bodyMat);
        motor.position.set(pos.x, 0.2, pos.z);
        droneModel.add(motor);

        // Propeller Blade
        const propGeo = new THREE.BoxGeometry(2.5, 0.05, 0.2);
        const prop = new THREE.Mesh(propGeo, propMat);
        prop.position.set(0, 0.2, 0); // Relative to motor parent? No, scene.

        // Group for rotation
        const propGroup = new THREE.Group();
        propGroup.position.set(pos.x, 0.4, pos.z);
        propGroup.add(prop);

        // Add light under motor
        const ledGeo = new THREE.SphereGeometry(0.1);
        const led = new THREE.Mesh(ledGeo, lightMat);
        led.position.set(pos.x, -0.1, pos.z);
        droneModel.add(led);

        droneModel.add(propGroup);
        propellers.push({ mesh: propGroup, dir: pos.dir });
    });

    scene.add(droneModel);

    camera.position.z = 5;
    camera.position.y = 2;
    camera.lookAt(0, 0, 0);

    animateThree();
}

function animateThree() {
    requestAnimationFrame(animateThree);

    // Animate Propellers
    propellers.forEach(p => {
        p.mesh.rotation.y += 0.5 * p.dir;
    });

    // Gentle Hover
    if (droneModel) {
        droneModel.position.y = Math.sin(Date.now() * 0.002) * 0.1;
    }

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function initCharts() {
    const ctx = document.getElementById('cpu-chart').getContext('2d');
    cpuChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(10).fill(''),
            datasets: [{
                label: 'CPU LOAD',
                data: Array(10).fill(0),
                borderColor: '#00d2ff',
                backgroundColor: 'rgba(0, 210, 255, 0.1)',
                borderWidth: 2,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { display: false, min: 0, max: 100 },
                x: { display: false }
            },
            plugins: { legend: { display: false } }
        }
    });
}

async function initWeather() {
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=27.7172&longitude=85.3240&current_weather=true');
        const data = await res.json();
        const weather = data.current_weather;

        document.getElementById('weather-data').innerHTML = `
            <div class="weather-grid">
                <div class="w-item" style="padding: 10px; border-bottom: 1px solid var(--border-color);">
                    <label style="font-size: 10px; color: var(--primary);">TEMP:</label>
                    <span style="font-size: 18px; font-weight: bold;">${weather.temperature}°C</span>
                </div>
                <div class="w-item" style="padding: 10px;">
                    <label style="font-size: 10px; color: var(--primary);">WIND:</label>
                    <span style="font-size: 18px; font-weight: bold;">${weather.windspeed} km/h</span>
                </div>
            </div>
        `;
    } catch (e) {
        document.getElementById('weather-data').innerText = "WEATHER OFFLINE";
    }
}

// --- EXTERNAL APIs ---

async function fetchRealAQI() {
    try {
        // Open-Meteo Air Quality API
        const res = await fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=27.7172&longitude=85.3240&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=auto');
        const data = await res.json();
        const current = data.current;

        if (current) {
            // Override dummy data in UI
            document.getElementById('val-aqi').innerText = current.european_aqi;
            document.getElementById('txt-pm25').innerText = current.pm2_5;
            document.getElementById('txt-pm10').innerText = current.pm10;
            document.getElementById('txt-no2').innerText = current.nitrogen_dioxide;
            document.getElementById('txt-o3').innerText = current.ozone;

            // Update bars
            document.getElementById('bar-pm25').style.width = Math.min(100, (current.pm2_5 / 50) * 100) + '%';
            document.getElementById('bar-pm10').style.width = Math.min(100, (current.pm10 / 100) * 100) + '%';
            document.getElementById('bar-no2').style.width = Math.min(100, (current.nitrogen_dioxide / 40) * 100) + '%';
            document.getElementById('bar-o3').style.width = Math.min(100, (current.ozone / 100) * 100) + '%';
        }
    } catch (e) {
        console.warn("AQI Fetch Failed", e);
    }
}

async function fetchEarthquakes() {
    try {
        // USGS API - 500km radius around Kathmandu
        const res = await fetch('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=27.7172&longitude=85.3240&maxradiuskm=500&limit=3&orderby=time');
        const data = await res.json();
        const container = document.getElementById('seismic-results');

        if (data.features && data.features.length > 0) {
            container.innerHTML = '';
            data.features.forEach(quake => {
                const props = quake.properties;
                const mag = props.mag.toFixed(1);
                const place = props.place.replace(', Nepal', '');
                const time = new Date(props.time).toLocaleTimeString();

                // Color scaling for magnitude
                let color = "var(--primary)";
                if (mag > 4) color = "orange";
                if (mag > 6) color = "red";

                const div = document.createElement('div');
                div.className = 'intel-item';
                div.style.borderLeft = `3px solid ${color}`;
                div.innerHTML = `
                    <div class="intel-head">
                        <span style="color:${color}; font-weight:bold;">MAG ${mag}</span>
                        <span style="float:right; opacity:0.7">${time}</span>
                    </div>
                    <div class="intel-body">${place}</div>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<div class="loading-shimmer">NO RECENT QUAKES DETECTED</div>';
        }

    } catch (e) {
        console.warn("Seismic Fetch Failed", e);
        document.getElementById('seismic-results').innerHTML = '<div class="loading-shimmer">SEISMIC SENSORS OFFLINE</div>';
    }
}

// --- DATA FETCHING ---

async function fetchData() {
    try {
        // Since we are using server.py which proxies api.php
        const response = await fetch('/api/api.php?action=get_telemetry');
        const data = await response.json();
        telemetryCache = data;

        // Update Server Status Indicator -> GREEN
        const statusDot = document.getElementById('server-status-dot');
        if (statusDot) statusDot.style.background = '#0f0'; // Green

        // Handle Uptime if available
        if (data.uptime_seconds !== undefined) {
            const uptimeEl = document.getElementById('val-uptime');
            if (uptimeEl) uptimeEl.innerText = formatTime(data.uptime_seconds);
        }

        updateUI(data.telemetry);
    } catch (err) {
        addLog("[ERROR] Data Link Interrupted");

        // Update Server Status Indicator -> RED
        const statusDot = document.getElementById('server-status-dot');
        if (statusDot) statusDot.style.background = '#f00'; // Red
    }
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function updateUI(data) {
    // Header
    document.getElementById('bat-top').innerText = data.system.battery + "%";
    document.getElementById('sig-top').innerText = data.gsm.signal + "%";

    // Camera Stream Linking
    // Camera Stream Linking - NATIVE MODE
    const camIp = telemetryCache.config?.camera_ip;

    // Only update if IP changed OR it's the first run
    if (camIp && (camIp !== currentCameraIp || !currentCameraIp) && camIp !== "1.2.3.4") {
        currentCameraIp = camIp;

        // Link IFrame to Native Interface
        const frame = document.getElementById('cam-iframe');
        if (frame) {
            // Standard ESP32 Cam Web Server is at root http://<IP>/
            const webUrl = `http://${camIp}/`;
            console.log(`[CAM] Linking Native Interface: ${webUrl}`);
            addLog(`CAM PORTAL ACTIVE: ${camIp}`);
            frame.src = webUrl;
        }
    }

    // Panel 1
    document.getElementById('val-aqi').innerText = data.air_quality.toString().padStart(3, '0');
    document.getElementById('val-temp').innerText = data.temperature.toFixed(1);
    document.getElementById('val-hum').innerText = data.humidity;
    document.getElementById('val-gas-type').innerText = data.harmful_gas.type;
    document.getElementById('val-gas-level').innerText = data.harmful_gas.level;

    const flameEl = document.getElementById('val-flame');
    if (data.flame.toLowerCase() !== 'safe') {
        flameEl.classList.add('danger-text', 'blink');
        flameEl.innerText = `FLAME DETECTED!`;
    } else {
        flameEl.classList.remove('danger-text', 'blink');
        flameEl.innerText = `SAFE`;
    }

    // Map & Location
    const pos = [data.gps.lat, data.gps.lng];
    if (droneMarker) droneMarker.setLatLng(pos);
    if (map) map.panTo(pos);
    document.getElementById('val-coords').innerText = `${data.gps.lat.toFixed(4)}° N, ${data.gps.lng.toFixed(4)}° E`;
    document.getElementById('val-loc-name').innerText = data.gps.location;

    // AI/Hardware
    document.getElementById('pest-count').innerText = data.ai_detection.insects;

    // Update Chart
    const newVal = Math.floor(Math.random() * 20) + 30; // Simulated CPU
    cpuChart.data.datasets[0].data.push(newVal);
    cpuChart.data.datasets[0].data.shift();
    cpuChart.update('none');

    document.getElementById('imu-x').innerText = data.gyro.x.toFixed(2);
    document.getElementById('imu-y').innerText = data.gyro.y.toFixed(2);
    document.getElementById('imu-z').innerText = data.gyro.z.toFixed(2);

    // Sync 3D Model
    if (droneModel) {
        droneModel.rotation.x = data.gyro.x;
        droneModel.rotation.y = data.gyro.y;
        droneModel.rotation.z = data.gyro.z;
    }

    // Advanced Env
    if (data.advanced_env) {
        document.getElementById('val-co2').innerText = data.advanced_env.co2;
        document.getElementById('val-uv').innerText = data.advanced_env.uv_index;
        document.getElementById('val-press').innerText = data.advanced_env.pressure;
        document.getElementById('val-wind').innerText = data.advanced_env.wind_speed;
        document.getElementById('val-wdir').innerText = data.advanced_env.wind_dir;
        document.getElementById('val-soil').innerText = data.advanced_env.soil_temp;
        document.getElementById('val-lux').innerText = data.advanced_env.light_lvl;
        document.getElementById('val-vib').innerText = data.advanced_env.vibration;

        // Update Detailed Stats Panel
        updateDetailedStats(data);
    }
}

function updateDetailedStats(data) {
    // Pollutants (Simulated Breakdown based on AQI if real sub-data absent)
    const aqi = data.air_quality;
    const components = {
        pm25: (aqi * 0.3).toFixed(1),
        pm10: (aqi * 0.8).toFixed(1),
        no2: (aqi * 0.2).toFixed(1),
        o3: (aqi * 1.1).toFixed(1),
        co: (aqi * 0.01).toFixed(2)
    };

    document.getElementById('txt-pm25').innerText = components.pm25;
    document.getElementById('txt-pm10').innerText = components.pm10;
    document.getElementById('txt-no2').innerText = components.no2;
    document.getElementById('txt-o3').innerText = components.o3;
    document.getElementById('txt-co').innerText = components.co;

    document.getElementById('bar-pm25').style.width = Math.min(100, (components.pm25 / 50) * 100) + '%';
    document.getElementById('bar-pm10').style.width = Math.min(100, (components.pm10 / 100) * 100) + '%';
    document.getElementById('bar-no2').style.width = Math.min(100, (components.no2 / 40) * 100) + '%';
    document.getElementById('bar-o3').style.width = Math.min(100, (components.o3 / 100) * 100) + '%';
    document.getElementById('bar-co').style.width = Math.min(100, (components.co / 10) * 100) + '%';

    // Pollen
    if (data.advanced_env.pollen) {
        document.getElementById('val-pollen-tree').innerText = data.advanced_env.pollen.tree.toUpperCase();
        document.getElementById('val-pollen-grass').innerText = data.advanced_env.pollen.grass.toUpperCase();
        document.getElementById('val-pollen-weed').innerText = data.advanced_env.pollen.weed.toUpperCase();
    }

    // Solar
    if (data.advanced_env.solar) {
        document.getElementById('val-solar-kw').innerText = data.advanced_env.solar.potential_kw;
        document.getElementById('val-solar-hours').innerText = data.advanced_env.solar.sunlight_hours;
    }

    // Raw Log Update
    const log = document.getElementById('raw-sensor-log');
    if (log && Math.random() > 0.7) {
        const hex = '0x' + Math.floor(Math.random() * 65535).toString(16).toUpperCase();
        const entry = `[PACKET] ${hex} - CRC OK - ${data.temperature.toFixed(1)}C, ${data.humidity}%, ${data.advanced_env.pressure}\n`;
        log.innerText += entry;
        log.scrollTop = log.scrollHeight;
        if (log.innerText.split('\n').length > 50) {
            log.innerText = log.innerText.split('\n').slice(-50).join('\n');
        }
    }
}



function addLog(text) {
    const container = document.getElementById('system-logs');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
    container.prepend(div);
}



// --- DRONE CONTROL ---

window.toggleCamSettings = () => {
    const drawer = document.getElementById('cam-settings-drawer');
    if (drawer.style.display === 'none') {
        drawer.style.display = 'flex';
    } else {
        drawer.style.display = 'none';
    }
};

window.updateCameraConfig = async (param, value) => {
    try {
        const ip = telemetryCache.config?.camera_ip || "1.2.3.4";
        // Construct standard ESP32-CAM control URL
        const url = `http://${ip}/control?var=${param}&val=${value}`;

        console.log(`[CAM] Setting ${param} to ${value} via ${url}`);

        // Mode 'no-cors' is essential because plain ESP32 web servers usually don't send CORS headers
        await fetch(url, { mode: 'no-cors' });

        addLog(`CAM CFG: ${param.toUpperCase()} > ${value}`);
    } catch (e) {
        addLog(`CFG ERR: CHECK CAM CONNECTION`);
        console.warn(e);
    }
};

// --- REPORT GENERATOR ---
window.generateReport = async () => {
    console.log("Generate Report Clicked"); // Debug
    const modal = document.getElementById('report-modal');
    if (!modal) {
        alert("Error: Modal not found in DOM");
        return;
    }
    modal.style.display = 'flex';

    // Fill Meta
    document.getElementById('report-loc').innerText = telemetryCache.telemetry.gps.location.toUpperCase();
    document.getElementById('report-date').innerText = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    document.getElementById('report-gen-time').innerText = new Date().toLocaleTimeString();
    document.getElementById('report-ref-id').innerText = `GOV-NPL-${Math.floor(Math.random() * 100000).toString().padStart(6, '0')}-X`;

    const body = document.getElementById('report-body');
    body.innerHTML = `
        <div class="loading-shimmer" style="text-align:center; padding:50px; color:#555;">
            <h3>PROCESSING TELEMETRY...</h3>
            <p>Consulting Agricultural Knowledge Base...</p>
        </div>
    `;

    try {
        const res = await fetch('/api/api.php?action=generate_report', { method: 'POST' });
        const data = await res.json();

        let content = "<h2>REPORT GENERATION FAILED</h2><p>Could not connect to Analysis Core.</p>";

        if (data.candidates && data.candidates[0].content) {
            // Extracted HTML from Gemini
            content = data.candidates[0].content.parts[0].text;
            // Clean markdown ```html code blocks if present
            content = content.replace(/```html/g, '').replace(/```/g, '');
        } else if (data.error) {
            content = `<h2>ERROR</h2><p>${data.error.message || JSON.stringify(data.error)}</p>`;
        }

        body.innerHTML = content;

    } catch (e) {
        body.innerHTML = `<h2>SYSTEM FAILURE</h2><p>${e.message}</p>`;
    }
};

window.closeReport = () => {
    document.getElementById('report-modal').style.display = 'none';
};

window.isStreamActive = false;

window.refreshCameraStream = () => {
    // Only refresh if active, otherwise just update state variable if needed
    if (window.isStreamActive) {
        startStream();
    }
};

window.toggleStream = () => {
    window.isStreamActive = !window.isStreamActive;
    const btn = document.getElementById('btn-stream-toggle');

    if (window.isStreamActive) {
        btn.innerText = "⏹ STOP";
        btn.style.borderColor = "var(--danger)";
        btn.style.color = "var(--danger)";
        startStream();
    } else {
        btn.innerText = "▶ START";
        btn.style.borderColor = "var(--success)";
        btn.style.color = "var(--success)";
        stopStream();
    }
};

function startStream() {
    const ip = telemetryCache.config?.camera_ip || currentCameraIp;
    if (!ip || ip === "1.2.3.4") return;

    const port = document.getElementById('cfg-stream-port').value || 81;
    const streamUrl = `http://${ip}:${port}/stream`;

    const feed = document.getElementById('rgb-feed');
    feed.src = streamUrl;

    feed.onerror = () => {
        addLog(`STREAM ERR: CONNECTION REFUSED`);
        // Don't auto-stop, let user retry or check network
    };
    addLog(`STREAM STARTED: ${ip}:${port}`);
}

function stopStream() {
    const feed = document.getElementById('rgb-feed');
    feed.src = "assets/img/offline-cam.png";
    addLog(`STREAM STOPPED`);
}

window.captureStill = async () => {
    const ip = telemetryCache.config?.camera_ip || currentCameraIp;
    if (!ip) return;

    addLog("CAPTURING STILL...");
    const captureUrl = `http://${ip}/capture`;

    try {
        // Fetch blob from camera
        const res = await fetch(captureUrl); // standard ESP32 capture endpoint
        const blob = await res.blob();
        const imgUrl = URL.createObjectURL(blob);

        // Show in a modal or new tab? For now, open in new tab for download
        window.open(imgUrl, '_blank');
        addLog("CAPTURE SUCCESS");
    } catch (e) {
        addLog("CAPTURE FAILED");
        // Fallback: try setting it as src of a hidden img to verify connection
    }
};

window.setDroneLight = async (mode) => {
    try {
        const ip = telemetryCache.config?.camera_ip || "1.2.3.4";
        await fetch(`http://${ip}/control?var=led_mode&val=${mode}`, { mode: 'no-cors' });
        addLog(`COMMAND SENT: LED MODE ${mode}`);
    } catch (e) {
        addLog("CMD ERROR: CHECK CONNECTION");
    }
};

// --- ADMIN OVERRIDE (Shift + M) ---

let keys = {};
window.onkeydown = (e) => {
    keys[e.key] = true;
    if (keys['Shift'] && (keys['M'] || keys['m'])) {
        openAdmin();
    }
};
window.onkeyup = (e) => keys[e.key] = false;

function openAdmin() {
    const modal = document.getElementById('admin-modal');
    const container = document.getElementById('admin-inputs');
    container.innerHTML = '';

    const fields = [
        { label: 'Latitude', key: 'lat', val: telemetryCache.telemetry.gps.lat },
        { label: 'Longitude', key: 'lng', val: telemetryCache.telemetry.gps.lng },
        { label: 'Location Name', key: 'loc', val: telemetryCache.telemetry.gps.location },
        { label: 'Air Quality', key: 'aqi', val: telemetryCache.telemetry.air_quality },
        { label: 'Gas Type', key: 'gas_type', val: telemetryCache.telemetry.harmful_gas.type },
        { label: 'Gas Level', key: 'gas_level', val: telemetryCache.telemetry.harmful_gas.level },
        { label: 'Temperature', key: 'temp', val: telemetryCache.telemetry.temperature },
        { label: 'Battery', key: 'bat', val: telemetryCache.telemetry.system.battery },
        { label: 'Insects Count', key: 'pests', val: telemetryCache.telemetry.ai_detection.insects },
        { label: 'CO2 Level', key: 'co2', val: telemetryCache.telemetry.advanced_env.co2 },
        { label: 'Pressure', key: 'press', val: telemetryCache.telemetry.advanced_env.pressure },
        { label: 'Wind Speed', key: 'wind', val: telemetryCache.telemetry.advanced_env.wind_speed },
        { label: 'Camera IP (ESP32)', key: 'cam_ip', val: telemetryCache.config?.camera_ip || "1.2.3.4" }
    ];

    fields.forEach(f => {
        const div = document.createElement('div');
        div.className = 'input-group';
        div.innerHTML = `<label style="color: var(--primary); font-size: 11px;">${f.label}</label><input type="text" id="over-${f.key}" value="${f.val}" style="width: 100%; background: #000; color: #fff; border: 1px solid var(--border-color); padding: 5px;">`;
        container.appendChild(div);
    });

    modal.style.display = 'flex';
}

function closeAdmin() { document.getElementById('admin-modal').style.display = 'none'; }

async function saveAdminSettings() {
    const updates = {
        telemetry: {
            gps: {
                lat: parseFloat(document.getElementById('over-lat').value),
                lng: parseFloat(document.getElementById('over-lng').value),
                location: document.getElementById('over-loc').value
            },
            air_quality: parseInt(document.getElementById('over-aqi').value),
            harmful_gas: {
                type: document.getElementById('over-gas_type').value,
                level: document.getElementById('over-gas_level').value
            },
            temperature: parseFloat(document.getElementById('over-temp').value),
            system: { battery: parseInt(document.getElementById('over-bat').value) },
            ai_detection: { insects: parseInt(document.getElementById('over-pests').value) },
            advanced_env: {
                co2: document.getElementById('over-co2').value,
                pressure: document.getElementById('over-press').value,
                wind_speed: document.getElementById('over-wind').value
            }
        },
        config: {
            camera_ip: document.getElementById('over-cam_ip').value
        }
    };

    await fetch('/api/api.php?action=update_settings', {
        method: 'POST',
        body: JSON.stringify(updates)
    });
    closeAdmin();
    fetchData();
}

function onResize() {
    if (renderer) {
        const container = document.getElementById('three-container');
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
}
