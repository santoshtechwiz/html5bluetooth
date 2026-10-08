const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const exploreBtn = document.getElementById('exploreBtn');
const statusDiv = document.getElementById('status');
const explorerDiv = document.getElementById('explorer');
const servicesList = document.getElementById('servicesList');
const serviceUUIDInput = document.getElementById('serviceUUID');
const logDiv = document.getElementById('log');

let connectedDevice = null;
let connectedServer = null;

function log(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
    console.log(`[${type}] ${message}`);
}

function parseHex(hexString) {
    // Remove 0x, spaces, and commas
    const cleanHex = hexString.replace(/0x|,|\s/g, '');
    if (cleanHex.length % 2 !== 0) {
        throw new Error('Invalid hex string length');
    }
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
        bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    return bytes;
}

connectBtn.addEventListener('click', async () => {
    statusDiv.innerText = "Status: Searching...";
    log('Requesting Bluetooth device...', 'info');

    try {
        const serviceUUID = serviceUUIDInput.value.trim();
        const options = {};
        if (serviceUUID) {
            options.filters = [{ services: [serviceUUID.toLowerCase()] }];
            log(`Filtering for service: ${serviceUUID}`, 'info');
        } else {
            options.acceptAllDevices = true;
            log('Searching for all devices...', 'info');
        }

        connectedDevice = await navigator.bluetooth.requestDevice(options);
        log(`Connected to: ${connectedDevice.name || 'Unknown Device'}`, 'success');

        statusDiv.innerText = "Status: Connecting to GATT...";
        log('Connecting to GATT Server...', 'info');
        connectedServer = await connectedDevice.gatt.connect();

        statusDiv.innerText = "Status: Connected ✅";
        log('GATT Server connected successfully!', 'success');

        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'block';
        explorerDiv.style.display = 'block';
    } catch (error) {
        console.error("Connection Error: ", error);
        statusDiv.innerText = `Status: Error - ${error.message}`;
        log(`Connection failed: ${error.message}`, 'error');
    }
});

disconnectBtn.addEventListener('click', () => {
    if (connectedDevice && connectedDevice.gatt.connected) {
        connectedDevice.gatt.disconnect();
    }
    cleanup();
});

function cleanup() {
    connectedDevice = null;
    connectedServer = null;
    statusDiv.innerText = "Status: Disconnected";
    connectBtn.style.display = 'block';
    disconnectBtn.style.display = 'none';
    explorerDiv.style.display = 'none';
    servicesList.innerHTML = '';
    log('Device disconnected.', 'info');
}

exploreBtn.addEventListener('click', async () => {
    if (!connectedServer) return;
    
    log('Exploring services...', 'info');
    statusDiv.innerText = "Status: Exploring...";
    servicesList.innerHTML = '';

    try {
        const services = await connectedServer.getPrimaryServices();
        log(`Found ${services.length} services.`, 'success');

        for (const service of services) {
            const serviceEl = document.createElement('div');
            serviceEl.className = 'service-item';
            serviceEl.innerHTML = `<h3>Service: ${service.uuid}</h3>`;

            const characteristics = await service.getCharacteristics();
            for (const char of characteristics) {
                const charEl = document.createElement('div');
                charEl.className = 'char-item';
                
                const props = [];
                if (char.properties.read) props.push('Read');
                if (char.properties.write) props.push('Write');
                if (char.properties.writeWithoutResponse) props.push('Write (No Resp)');
                if (char.properties.notify) props.push('Notify');

                charEl.innerHTML = `
                    <h4>Char: ${char.uuid}</h4>
                    <span class="char-props">Properties: ${props.join(', ')}</span>
                    <div id="val-${char.uuid}" class="value-display" style="display:none;"></div>
                `;

                if (char.properties.read) {
                    const readBtn = document.createElement('button');
                    readBtn.innerText = 'Read';
                    readBtn.className = 'action-btn';
                    readBtn.onclick = async () => {
                        try {
                            const val = await char.readValue();
                            displayValue(char.uuid, val);
                            log(`Read value from ${char.uuid.substring(0,8)}...`, 'success');
                        } catch (e) { log(`Read failed: ${e.message}`, 'error'); }
                    };
                    charEl.appendChild(readBtn);
                }

                if (char.properties.write || char.properties.writeWithoutResponse) {
                    const writeGroup = document.createElement('div');
                    writeGroup.className = 'write-group';

                    const formatSelect = document.createElement('select');
                    formatSelect.style.width = 'auto';
                    formatSelect.innerHTML = `
                        <option value="text">Text</option>
                        <option value="hex">Hex</option>
                    `;

                    const writeInput = document.createElement('input');
                    writeInput.type = 'text';
                    writeInput.placeholder = 'Value...';

                    const writeBtn = document.createElement('button');
                    writeBtn.innerText = 'Send';
                    writeBtn.className = 'action-btn';
                    writeBtn.onclick = async () => {
                        try {
                            let data;
                            const value = writeInput.value;
                            if (formatSelect.value === 'hex') {
                                data = parseHex(value);
                                log(`Writing hex: ${value}`, 'info');
                            } else {
                                const encoder = new TextEncoder();
                                data = encoder.encode(value);
                                log(`Writing text: ${value}`, 'info');
                            }
                            await char.writeValue(data);
                            log(`Sent successfully to ${char.uuid.substring(0,8)}... ✅`, 'success');
                        } catch (e) { log(`Write failed: ${e.message}`, 'error'); }
                    };

                    writeGroup.appendChild(formatSelect);
                    writeGroup.appendChild(writeInput);
                    writeGroup.appendChild(writeBtn);
                    charEl.appendChild(writeGroup);
                }

                if (char.properties.notify) {
                    const notifyBtn = document.createElement('button');
                    notifyBtn.innerText = 'Start Notify';
                    notifyBtn.className = 'action-btn secondary';
                    notifyBtn.onclick = async () => {
                        try {
                            await char.startNotifications();
                            notifyBtn.innerText = 'Notify: ON';
                            notifyBtn.style.background = '#28a745';
                            char.addEventListener('characteristicvaluechanged', (event) => {
                                displayValue(char.uuid, event.target.value);
                                log(`Notification from ${char.uuid.substring(0,8)}...`, 'info');
                            });
                            log(`Notifications started for ${char.uuid.substring(0,8)}...`, 'success');
                        } catch (e) { log(`Notify failed: ${e.message}`, 'error'); }
                    };
                    charEl.appendChild(notifyBtn);
                }

                serviceEl.appendChild(charEl);
            }
            servicesList.appendChild(serviceEl);
        }
        statusDiv.innerText = "Status: Exploration complete! ✅";
        log('Device exploration complete!', 'success');
    } catch (error) {
        console.error("Explore Error: ", error);
        statusDiv.innerText = `Status: Explore Error - ${error.message}`;
        log(`Explore failed: ${error.message}`, 'error');
    }
});

function displayValue(uuid, dataView) {
    const display = document.getElementById(`val-${uuid}`);
    if (!display) return;
    display.style.display = 'block';
    const buffer = dataView.buffer;
    const hex = Array.from(new Uint8Array(buffer))
                     .map(b => b.toString(16).padStart(2, '0'))
                     .join(' ');
    let text = '';
    try { text = new TextDecoder().decode(buffer); } catch(e) {}
    display.innerText = `Hex: ${hex}\nText: ${text}`;
}
