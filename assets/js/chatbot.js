// --- CHATBOT MODULE ---

console.log("Chatbot Module Loaded");

window.addEventListener('load', initChat);

function initChat() {
    console.log("Initializing Chatbot...");

    const sendBtn = document.getElementById('send-btn');
    const userInput = document.getElementById('user-input');

    if (sendBtn) {
        sendBtn.onclick = sendChat;
        console.log("Send button listener attached");
    } else {
        console.error("Send button not found!");
    }

    if (userInput) {
        userInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                sendChat();
            }
        };
    }

    // Image Handling
    const imgBtn = document.getElementById('image-btn');
    const imgUpload = document.getElementById('image-upload');
    const imgPreview = document.getElementById('image-preview');

    if (imgBtn && imgUpload && imgPreview) {
        imgBtn.onclick = () => imgUpload.click();

        imgUpload.onchange = () => {
            const file = imgUpload.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = imgPreview.querySelector('img');
                    if (img) img.src = e.target.result;
                    imgPreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        };

        const removeBtn = document.getElementById('remove-img');
        if (removeBtn) {
            removeBtn.onclick = () => {
                imgUpload.value = '';
                imgPreview.style.display = 'none';
                const img = imgPreview.querySelector('img');
                if (img) img.src = '';
            };
        }
    }
}

async function sendChat() {
    const input = document.getElementById('user-input');
    const imgUpload = document.getElementById('image-upload');
    const imgPreview = document.getElementById('image-preview');

    if (!input) return;

    const msg = input.value.trim();
    const hasImg = imgUpload && imgUpload.files.length > 0;

    if (!msg && !hasImg) return;

    // UI Feedback
    appendMsg('user', msg + (hasImg ? " [IMAGE ATTACHED]" : ""));
    input.value = '';

    let base64Img = null;
    if (hasImg && imgPreview) {
        const img = imgPreview.querySelector('img');
        if (img) base64Img = img.src;

        // Clean up preview
        const removeBtn = document.getElementById('remove-img');
        if (removeBtn) removeBtn.click();
    }

    // Loading Indicator
    const loadingId = appendMsg('ai', 'ENGINEERING ANALYSIS IN PROGRESS...');

    try {
        const response = await fetch('/api/api.php?action=chat', {
            method: 'POST',
            body: JSON.stringify({
                message: msg || "Analyze this image in context of drone telemetry.",
                image: base64Img
            })
        });

        // Try to parse JSON regardless of status, as server sends error JSON
        let data;
        try {
            data = await response.json();
        } catch (jsonErr) {
            // If JSON parse fails, likely a server crash (PHP error HTML) or network issue
            console.error("JSON Parse Error:", jsonErr);
            throw new Error(`Server Error (${response.status}): Unable to parse response.`);
        }

        if (!response.ok) {
            // Handle HTTP errors gracefully by showing the server's error message
            const errMsg = data.error?.message || JSON.stringify(data.error) || `HTTP Error ${response.status}`;
            throw new Error(`API Error: ${errMsg}`);
        }

        let reply = "UNABLE TO PROCESS.";
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            reply = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
            reply = `AI ERROR: ${data.error.message || JSON.stringify(data.error)}`;
        } else if (data.candidates && data.candidates[0].finishReason) {
            reply = `AI SIGNAL BLOCKED: ${data.candidates[0].finishReason}`;
        }

        const loadingMsg = document.getElementById(loadingId);
        if (loadingMsg) loadingMsg.innerText = reply;

    } catch (e) {
        console.error("Chat Error:", e);
        const loadingMsg = document.getElementById(loadingId);
        if (loadingMsg) {
            // Display the actual error message to the user
            loadingMsg.innerText = `[SYSTEM FAILURE] ${e.message}`;
            loadingMsg.style.color = "var(--danger)";
            loadingMsg.style.border = "1px solid var(--danger)";
        }
    }
}

function appendMsg(type, text) {
    const container = document.getElementById('chat-messages');
    if (!container) return null;

    const div = document.createElement('div');
    const id = 'msg-' + Date.now();
    div.id = id;
    div.className = `msg ${type}`;
    div.innerText = text;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return id;
}
