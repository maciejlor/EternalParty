/**
 * The Party Livestream - Application Logic
 * Implements countdown, admin bypass, indexedDB video streaming,
 * multi-tab synchronization, live chat and Roblox-style speech bubbles/announcements.
 */

// ==========================================================================
// 1. Application State
// ==========================================================================
const state = {
    isAdmin: false,
    username: '',
    avatar: 'wolf',
    viewersCount: 1,
    activeScreen: 'countdown', // countdown, username, stream
    videoLoaded: false,
    isPlaying: false
};

// Config Constants
const ADMIN_USERNAME = "Macik";
const PASSWORD_CORRECT = "Ihateuyigitdwso123!";
const BROADCAST_CHANNEL_NAME = "party_stream_channel";
const INDEXEDDB_NAME = "PartyStreamDB";
const INDEXEDDB_STORE = "videoStore";
const INDEXEDDB_KEY = "stream_video";

// Broadcast Channel for Multi-tab communication
let broadcastChannel;
try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
} catch (e) {
    console.warn("BroadcastChannel not supported in this browser. Multi-tab sync disabled.");
}

// DOM Elements Cache
const el = {
    bg: document.getElementById('app-background'),
    countdownScreen: document.getElementById('countdown-screen'),
    usernameScreen: document.getElementById('username-screen'),
    streamScreen: document.getElementById('stream-screen'),
    
    // Countdown
    hours: document.getElementById('timer-hours'),
    minutes: document.getElementById('timer-minutes'),
    seconds: document.getElementById('timer-seconds'),
    adminTrigger: document.getElementById('admin-trigger'),
    
    // Password Modal
    passwordModal: document.getElementById('password-modal'),
    passwordInput: document.getElementById('admin-password-input'),
    passwordError: document.getElementById('password-error'),
    btnCancelPassword: document.getElementById('btn-cancel-password'),
    btnSubmitPassword: document.getElementById('btn-submit-password'),
    
    // Username Modal
    usernameInput: document.getElementById('username-input'),
    usernameError: document.getElementById('username-error'),
    btnEnterParty: document.getElementById('btn-enter-party'),
    
    // Stream Stage
    video: document.getElementById('stream-video'),
    defaultView: document.getElementById('stream-default-view'),
    speechBubblesLayer: document.getElementById('speech-bubbles-layer'),
    adminControls: document.getElementById('admin-controls-panel'),
    videoFileInput: document.getElementById('admin-video-file'),
    btnPlay: document.getElementById('admin-btn-play'),
    btnPause: document.getElementById('admin-btn-pause'),
    btnStop: document.getElementById('admin-btn-stop'),
    btnTroll: document.getElementById('admin-btn-troll'),
    btnConclude: document.getElementById('admin-btn-conclude'),
    adminTimeInput: document.getElementById('admin-time-input'),
    btnSetTime: document.getElementById('admin-btn-set-time'),
    videoStatus: document.getElementById('admin-video-status'),
    viewersCountText: document.getElementById('viewers-count'),
    skyStars: document.getElementById('sky-stars'),
    
    // Chat Sidebar
    chatMessages: document.getElementById('chat-messages'),
    chatMessagesContainer: document.getElementById('chat-messages-container'),
    chatForm: document.getElementById('chat-form'),
    chatInput: document.getElementById('chat-input'),
    
    // Announcement Banner & Input Modal
    announcementBanner: document.getElementById('announcement-banner'),
    announcementSender: document.getElementById('announcement-sender'),
    announcementBodyText: document.getElementById('announcement-body-text'),
    announcementTranslatedText: document.getElementById('announcement-translated-text'),
    announcementModal: document.getElementById('announcement-modal'),
    announcementInput: document.getElementById('announcement-message-input'),
    btnCancelAnnouncement: document.getElementById('btn-cancel-announcement'),
    btnSubmitAnnouncement: document.getElementById('btn-submit-announcement'),
    
    // Troll Overlay
    trollOverlay: document.getElementById('troll-overlay'),
    
    // Toast Alert
    alertContainer: document.getElementById('alert-container')
};

// ==========================================================================
// 2. Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    initIndexedDB();
    setupStars();
    
    // Check if event has concluded
    if (sessionStorage.getItem('event_concluded') === 'true') {
        const mainCountdown = document.getElementById('main-countdown-card');
        const concludeCard = document.getElementById('conclude-card');
        if (mainCountdown) mainCountdown.classList.add('hidden');
        if (concludeCard) concludeCard.classList.remove('hidden');
        transitionToScreen('countdown');
    } else {
        // Check if user is already logged in (Refresh F5 persistence)
        const savedUsername = sessionStorage.getItem('party_user_name');
        const savedIsAdmin = sessionStorage.getItem('party_is_admin');
        if (savedUsername) {
            state.username = savedUsername;
            state.isAdmin = (savedIsAdmin === 'true');
            
            // Restore controls
            if (state.isAdmin) {
                el.adminControls.classList.remove('hidden');
            } else {
                el.adminControls.classList.add('hidden');
            }
            
            transitionToScreen('stream');
            
            // Render current video state if exists
            checkStoredVideo();
        } else {
            // Standard startup: run countdown
            initCountdown();
        }
    }
    
    // Register Tab Presence
    announcePresence();
    
    // Periodically poll presence of other tabs
    setInterval(announcePresence, 5000);
});

// Setup background starry sky decorative animation
function setupStars() {
    if (!el.skyStars) return;
    const numStars = 60;
    const colors = ['#ffffff', '#00b4d8', '#ade8f4', '#f0f2f5'];
    
    for (let i = 0; i < numStars; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        const size = Math.random() * 2.5 + 1;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 70}%`; // Keep stars in sky, not grass
        star.style.background = colors[Math.floor(Math.random() * colors.length)];
        star.style.animationDelay = `${Math.random() * 4}s`;
        star.style.animationDuration = `${Math.random() * 3 + 2}s`;
        el.skyStars.appendChild(star);
    }
}

// ==========================================================================
// 3. Countdown Event Handler
// ==========================================================================
let countdownInterval;

function getCountdownTarget() {
    const savedTimestamp = localStorage.getItem('countdown_target_timestamp');
    if (savedTimestamp) {
        return new Date(Number(savedTimestamp));
    }
    const defaultTarget = new Date();
    defaultTarget.setUTCHours(19, 0, 0, 0);
    return defaultTarget;
}

function initCountdown() {
    clearInterval(countdownInterval);
    
    function updateTimer() {
        const target = getCountdownTarget();
        const now = new Date();
        let diff = target.getTime() - now.getTime();
        
        // If countdown has passed target mark
        if (diff <= 0) {
            clearInterval(countdownInterval);
            el.hours.textContent = "00";
            el.minutes.textContent = "00";
            el.seconds.textContent = "00";
            
            // Automatically transition guest to username screen if they are stuck on countdown
            if (state.activeScreen === 'countdown') {
                transitionToScreen('username');
            }
            return;
        }
        
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        el.hours.textContent = String(hours).padStart(2, '0');
        el.minutes.textContent = String(minutes).padStart(2, '0');
        el.seconds.textContent = String(seconds).padStart(2, '0');
    }
    
    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

// ==========================================================================
// 4. IndexedDB Stream Store (Save/Load large video file locally)
// ==========================================================================
let db = null;
let indexedDBSupported = true;

function initIndexedDB() {
    try {
        if (!window.indexedDB) {
            console.warn("IndexedDB not supported in this browser.");
            indexedDBSupported = false;
            return;
        }
        const request = window.indexedDB.open(INDEXEDDB_NAME, 1);
        
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(INDEXEDDB_STORE)) {
                db.createObjectStore(INDEXEDDB_STORE);
            }
        };
        
        request.onsuccess = (e) => {
            db = e.target.result;
            // Check if there is an active stream video stored (e.g. from tab reload)
            checkStoredVideo();
        };
        
        request.onerror = (e) => {
            console.warn("IndexedDB initialization error:", e);
            indexedDBSupported = false;
        };
    } catch (err) {
        console.warn("IndexedDB blocked by security policy:", err);
        indexedDBSupported = false;
    }
}

function saveVideoToDB(blob) {
    if (!db || !indexedDBSupported) return;
    try {
        const transaction = db.transaction([INDEXEDDB_STORE], "readwrite");
        const store = transaction.objectStore(INDEXEDDB_STORE);
        store.put(blob, INDEXEDDB_KEY);
        
        transaction.oncomplete = () => {
            showToast("Video stored locally for synchronization.", "success");
        };
    } catch (err) {
        console.warn("Failed to save video to DB:", err);
    }
}

function clearVideoFromDB() {
    if (!db || !indexedDBSupported) return;
    try {
        const transaction = db.transaction([INDEXEDDB_STORE], "readwrite");
        const store = transaction.objectStore(INDEXEDDB_STORE);
        store.delete(INDEXEDDB_KEY);
    } catch (err) {
        console.warn("Failed to clear video from DB:", err);
    }
}

function checkStoredVideo() {
    if (!db || !indexedDBSupported) return;
    try {
        const transaction = db.transaction([INDEXEDDB_STORE], "readonly");
        const store = transaction.objectStore(INDEXEDDB_STORE);
        const request = store.get(INDEXEDDB_KEY);
        
        request.onsuccess = () => {
            if (request.result) {
                loadVideoSrc(request.result);
            }
        };
    } catch (err) {
        console.warn("Failed to check stored video:", err);
    }
}

function loadVideoSrc(blob) {
    try {
        const url = URL.createObjectURL(blob);
        el.video.src = url;
        el.video.classList.remove('hidden');
        el.defaultView.classList.add('hidden');
        state.videoLoaded = true;
        
        if (state.isAdmin) {
            el.btnPlay.disabled = false;
            el.btnPause.disabled = false;
            el.btnStop.disabled = false;
            el.videoStatus.textContent = "Video loaded. Ready to stream.";
        } else {
            // As guest, let the video load but do not autoplay. It will play/pause synced with the Host's broadcast messages!
            el.video.pause();
        }
    } catch (err) {
        console.warn("Failed to load video source URL:", err);
    }
}

// ==========================================================================
// 5. App Screen Navigation & State Transitions
// ==========================================================================
function transitionToScreen(screenName) {
    state.activeScreen = screenName;
    
    // Save state to sessionStorage for page refresh persistence
    if (screenName === 'stream') {
        sessionStorage.setItem('party_user_name', state.username);
        sessionStorage.setItem('party_is_admin', state.isAdmin ? 'true' : 'false');
    } else if (screenName === 'countdown') {
        // Keep concluded state if set, but clear active user session
        sessionStorage.removeItem('party_user_name');
        sessionStorage.removeItem('party_is_admin');
    } else {
        sessionStorage.removeItem('party_user_name');
        sessionStorage.removeItem('party_is_admin');
        sessionStorage.removeItem('event_concluded');
    }
    
    // Hide all screens
    el.countdownScreen.classList.add('hidden');
    el.usernameScreen.classList.add('hidden');
    el.streamScreen.classList.add('hidden');
    
    if (screenName === 'countdown') {
        el.countdownScreen.classList.remove('hidden');
        el.bg.classList.remove('hidden');
        el.bg.classList.remove('bg-blurred');
    } else if (screenName === 'username') {
        el.usernameScreen.classList.remove('hidden');
        el.bg.classList.remove('hidden');
        el.bg.classList.add('bg-blurred');
    } else if (screenName === 'stream') {
        el.streamScreen.classList.remove('hidden');
        el.bg.classList.add('hidden'); // Hide background image (so stream room is black as requested!)
        
        // Focus chat input on entry
        setTimeout(() => el.chatInput.focus(), 300);
        
        // Pre-populate time input in Host Panel if Admin
        if (state.isAdmin && el.adminTimeInput) {
            const target = getCountdownTarget();
            const hh = String(target.getUTCHours()).padStart(2, '0');
            const mm = String(target.getUTCMinutes()).padStart(2, '0');
            el.adminTimeInput.value = `${hh}:${mm}`;
        }
        
        // Add welcome message
        addChatMessage("System", `Welcome to the Eternal Events, ${state.username}!`, true);
        
        // Render current video state if exists
        checkStoredVideo();
    }
}

// ==========================================================================
// 6. User Event Listeners
// ==========================================================================
function initEventListeners() {
    // Admin hidden login trigger
    el.adminTrigger.addEventListener('click', () => {
        el.passwordModal.classList.remove('hidden');
        el.passwordInput.value = '';
        el.passwordError.textContent = '';
        el.passwordInput.focus();
    });
    
    // Password cancel
    el.btnCancelPassword.addEventListener('click', () => {
        el.passwordModal.classList.add('hidden');
    });
    
    // Password submit
    el.btnSubmitPassword.addEventListener('click', handleAdminLogin);
    el.passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAdminLogin();
    });
    

    
    // Username selection submission
    el.btnEnterParty.addEventListener('click', handleGuestLogin);
    el.usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleGuestLogin();
    });
    
    // Chat Message Form Submit
    el.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        sendChatMessage();
    });
    
    // Admin Playback: Video Upload
    el.videoFileInput.addEventListener('change', handleAdminVideoUpload);
    
    // Admin Playback: Controls
    el.btnPlay.addEventListener('click', () => {
        if (!state.isAdmin) return;
        el.video.play();
        state.isPlaying = true;
        sendSyncSignal();
    });
    
    el.btnPause.addEventListener('click', () => {
        if (!state.isAdmin) return;
        el.video.pause();
        state.isPlaying = false;
        sendSyncSignal();
    });
    
    el.btnStop.addEventListener('click', () => {
        if (!state.isAdmin) return;
        stopStream();
    });
    
    el.btnTroll.addEventListener('click', () => {
        if (!state.isAdmin) return;
        console.log("Admin Troll button clicked! Triggering overlay and broadcasting...");
        broadcastMessage({ type: 'troll' });
        triggerTrollFace();
    });
    
    el.btnConclude.addEventListener('click', () => {
        if (!state.isAdmin) return;
        if (confirm("Are you sure you want to conclude the event? This will kick out all guests and show them the thank you screen.")) {
            concludeEvent();
        }
    });
    
    el.btnSetTime.addEventListener('click', () => {
        if (!state.isAdmin) return;
        const timeVal = el.adminTimeInput.value;
        if (!timeVal) {
            showToast("Please select a valid time", "error");
            return;
        }
        
        const [hours, minutes] = timeVal.split(':').map(Number);
        const newTarget = new Date();
        newTarget.setUTCHours(hours, minutes, 0, 0);
        
        // If the target time has already passed today, roll it over to tomorrow!
        if (newTarget.getTime() - Date.now() <= 0) {
            newTarget.setUTCDate(newTarget.getUTCDate() + 1);
        }
        
        // Save target time as a timestamp in localStorage so it persists across refreshes
        localStorage.setItem('countdown_target_timestamp', newTarget.getTime());
        
        // Broadcast the new countdown target to other tabs
        broadcastMessage({
            type: 'update_countdown',
            timestamp: newTarget.getTime()
        });
        
        // Restart/refresh local timer
        initCountdown();
        
        showToast(`Countdown target set to ${timeVal} UTC`, "success");
    });
    
    // Keep Admin video element synced with local variables
    el.video.addEventListener('play', () => {
        if (state.isAdmin) {
            state.isPlaying = true;
            sendSyncSignal();
        }
    });
    el.video.addEventListener('pause', () => {
        if (state.isAdmin) {
            state.isPlaying = false;
            sendSyncSignal();
        }
    });
    el.video.addEventListener('seeked', () => {
        if (state.isAdmin) {
            sendSyncSignal();
        }
    });
    
    // Sync loop for streaming video time update
    setInterval(() => {
        if (state.isAdmin && state.videoLoaded && !el.video.paused) {
            sendSyncSignal();
        }
    }, 1500);
    
    // Key Listener for Admin Announcement Trigger (') or Admin Login shortcut ('a'/'l')
    document.addEventListener('keydown', (e) => {
        // Trigger key is Q for Troll Face overlay when streaming (available for both Admin and Guests)
        if (e.key === "q" || e.key === "Q") {
            console.log("Q key pressed. Active screen:", state.activeScreen, "Focus element:", document.activeElement ? document.activeElement.tagName : "none");
            if (state.isAdmin && state.activeScreen === 'stream') {
                if (document.activeElement === el.chatInput) {
                    console.log("Ignore Q key because chat input is focused.");
                    return;
                }
                
                e.preventDefault();
                console.log("Broadcasting troll event...");
                broadcastMessage({ type: 'troll' });
                triggerTrollFace();
            }
        }

        // Trigger key is ' (Apostrophe / Quote) for announcement WITH Turkish translation
        if (e.key === "'" || e.key === "Quote") {
            if (state.isAdmin && state.activeScreen === 'stream') {
                if (document.activeElement === el.chatInput) return;
                e.preventDefault();
                el.announcementModal.dataset.noTranslate = 'false';
                el.announcementModal.classList.remove('hidden');
                el.announcementInput.value = '';
                el.announcementInput.focus();
            }
        }
        
        // Trigger key is N for announcement WITHOUT Turkish translation
        if (e.key === 'n' || e.key === 'N') {
            if (state.isAdmin && state.activeScreen === 'stream') {
                if (document.activeElement === el.chatInput) return;
                e.preventDefault();
                el.announcementModal.dataset.noTranslate = 'true';
                el.announcementModal.classList.remove('hidden');
                el.announcementInput.value = '';
                el.announcementInput.focus();
            }
        }
        
        // Shortcut to trigger Admin Login modal ('a' or 'l' key) on countdown or username page
        if (state.activeScreen === 'countdown' || state.activeScreen === 'username') {
            if (e.key && (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'l')) {
                el.passwordModal.classList.remove('hidden');
                el.passwordInput.value = '';
                el.passwordError.textContent = '';
                el.passwordInput.focus();
            }
        }
    });
    
    // Close announcement modal
    el.btnCancelAnnouncement.addEventListener('click', () => {
        el.announcementModal.classList.add('hidden');
    });
    
    // Broadcast Announcement
    el.btnSubmitAnnouncement.addEventListener('click', handleBroadcastAnnouncement);
    el.announcementInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleBroadcastAnnouncement();
    });
}

// ==========================================================================
// 7. Login Logic (Admin & Guest)
// ==========================================================================
function handleAdminLogin() {
    const pw = el.passwordInput.value;
    if (pw === PASSWORD_CORRECT) {
        state.isAdmin = true;
        state.username = ADMIN_USERNAME;
        state.avatar = "wolf";
        
        el.passwordModal.classList.add('hidden');
        showToast("Authenticated as Administrator", "success");
        
        // Show Admin controls
        el.adminControls.classList.remove('hidden');
        
        // Transition straight to Stream page
        transitionToScreen('stream');
    } else {
        el.passwordError.textContent = "Access Denied: Invalid Security Key";
        el.passwordInput.focus();
        showToast("Authentication Failed", "error");
    }
}

function handleGuestLogin() {
    const name = el.usernameInput.value.trim();
    if (!name) {
        el.usernameError.textContent = "Please enter a username.";
        el.usernameInput.focus();
        return;
    }
    
    if (name.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
        el.usernameError.textContent = `The username "${ADMIN_USERNAME}" is reserved.`;
        el.usernameInput.focus();
        return;
    }
    
    state.isAdmin = false;
    state.username = name;
    el.usernameError.textContent = "";
    
    transitionToScreen('stream');
}

// ==========================================================================
// 8. Admin Stream Control Handlers
// ==========================================================================
function handleAdminVideoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    el.videoStatus.textContent = "Uploading video locally...";
    
    // Save file as Blob into IndexedDB
    const reader = new FileReader();
    reader.onload = (event) => {
        const arrayBuffer = event.target.result;
        const blob = new Blob([arrayBuffer], { type: file.type });
        
        // Save to Database
        saveVideoToDB(blob);
        
        // Load into local player
        loadVideoSrc(blob);
        
        // Notify other tabs to retrieve the video from IndexedDB and play
        broadcastMessage({
            type: 'video_loaded'
        });
        
        showToast(`Stream source active: ${file.name}`, "success");
    };
    reader.readAsArrayBuffer(file);
}

function stopStream() {
    // Clear video player
    el.video.pause();
    el.video.removeAttribute('src');
    el.video.load();
    el.video.classList.add('hidden');
    
    // Show static Roblox stage
    el.defaultView.classList.remove('hidden');
    state.videoLoaded = false;
    state.isPlaying = false;
    
    // Disable Admin buttons
    el.btnPlay.disabled = true;
    el.btnPause.disabled = true;
    el.btnStop.disabled = true;
    el.videoStatus.textContent = "No video uploaded";
    el.videoFileInput.value = '';
    
    // Clear from DB
    clearVideoFromDB();
    
    // Broadcast stop signal
    broadcastMessage({
        type: 'video_stopped'
    });
    
    showToast("Stream ended.", "error");
}

// Broadcasts playback time & playing status
function sendSyncSignal() {
    if (!state.isAdmin || !state.videoLoaded) return;
    
    broadcastMessage({
        type: 'video_sync',
        playing: !el.video.paused,
        currentTime: el.video.currentTime
    });
}

// ==========================================================================
// 9. Chat Mechanics & Speech Bubble Engine
// ==========================================================================
function sendChatMessage() {
    const text = el.chatInput.value.trim();
    if (!text) return;
    
    // Add locally
    addChatMessage(state.username, text, false, state.isAdmin);
    
    // Trigger local speech bubble
    createSpeechBubble(state.username, text);
    
    // Broadcast to other tabs
    broadcastMessage({
        type: 'chat_message',
        sender: state.username,
        text: text,
        avatar: state.avatar,
        isAdmin: state.isAdmin
    });
    
    el.chatInput.value = '';
    el.chatInput.focus();
}

function addChatMessage(author, body, isSystem = false, isAuthorAdmin = false) {
    const msgEl = document.createElement('div');
    msgEl.classList.add('message');
    
    if (isSystem) {
        msgEl.innerHTML = `
            <div class="msg-content-wrapper">
                <div class="msg-body system-msg">${body}</div>
            </div>
        `;
    } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Render guest avatar based on symbol (custom SVG graphics)
        let avatarSvg = "";
        if (isAuthorAdmin) {
            avatarSvg = `<img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231f2235'/><circle cx='50' cy='45' r='20' fill='%232b7bb9'/><path d='M30 85 C 30 65, 70 65, 70 85' fill='%231d5b8c'/><path d='M42 35 L 50 20 L 58 35' fill='%232b7bb9'/></svg>" class="user-avatar">`;
        } else {
            avatarSvg = `<div class="msg-avatar" style="color: var(--color-accent); display:flex; align-items:center; justify-content:center; padding: 4px;">👤</div>`;
        }
        
        msgEl.innerHTML = `
            <div class="msg-avatar">${avatarSvg}</div>
            <div class="msg-content-wrapper">
                <div class="msg-meta">
                    <span class="msg-author ${isAuthorAdmin ? 'author-admin' : ''}">${escapeHTML(author)}</span>
                    ${isAuthorAdmin ? '<span class="msg-badge badge-admin">ADMIN</span>' : ''}
                    <span class="msg-time">${timeStr}</span>
                </div>
                <div class="msg-body">${escapeHTML(body)}</div>
            </div>
        `;
    }
    
    el.chatMessages.appendChild(msgEl);
    
    // Auto-scroll chat container to bottom
    el.chatMessagesContainer.scrollTop = el.chatMessagesContainer.scrollHeight;
}

// Generate Roblox-style speech bubble above werewolf character in stream window
function createSpeechBubble(sender, text) {
    const bubble = document.createElement('div');
    bubble.classList.add('speech-bubble');
    
    // Format text: if message is /M text, we render it like Roblox message format, or just display the raw text.
    // Let's strip prefix command if it starts with '/m' or similar.
    let displayMsg = text;
    if (text.toLowerCase().startsWith('/m ')) {
        displayMsg = text.substring(3);
    }
    
    bubble.textContent = displayMsg;
    
    // Randomize position slightly around center (where werewolf character stands)
    // 50% left is center. Let's vary between 42% and 58%.
    const horizontalPos = 50 + (Math.random() * 16 - 8);
    bubble.style.left = `${horizontalPos}%`;
    bubble.style.bottom = `${120 + Math.random() * 20}px`; // Heights above werewolf head
    
    el.speechBubblesLayer.appendChild(bubble);
    
    // Remove bubble once animation finishes
    setTimeout(() => {
        bubble.remove();
    }, 3500);
}

// ==========================================================================
// 10. Admin Announcements Broadcasting
// ==========================================================================
function handleBroadcastAnnouncement() {
    const message = el.announcementInput.value.trim();
    if (!message) return;
    
    const noTranslate = el.announcementModal.dataset.noTranslate === 'true';
    
    // Hide Modal
    el.announcementModal.classList.add('hidden');
    
    // Play locally
    displayAnnouncement(ADMIN_USERNAME, message, noTranslate);
    
    // Broadcast via channel
    broadcastMessage({
        type: 'announcement',
        sender: ADMIN_USERNAME,
        text: message,
        noTranslate: noTranslate
    });
}

async function displayAnnouncement(sender, text, noTranslate = false) {
    if (el.announcementSender) {
        el.announcementSender.textContent = sender;
    }
    el.announcementBodyText.textContent = text;
    
    if (el.announcementTranslatedText) {
        if (noTranslate) {
            el.announcementTranslatedText.textContent = '';
            el.announcementTranslatedText.style.display = 'none';
        } else {
            el.announcementTranslatedText.style.display = '';
            el.announcementTranslatedText.textContent = "Translating...";
            const translated = await translateToTurkish(text);
            el.announcementTranslatedText.textContent = translated;
        }
    }
    
    el.announcementBanner.classList.remove('hidden');
    
    // Force DOM layout recalculation
    void el.announcementBanner.offsetWidth;
    
    el.announcementBanner.classList.add('show');
    
    // Play synthesized Retro-like beep sound
    playAnnouncementSound();
    
    // Auto hide after 8.5 seconds
    setTimeout(() => {
        el.announcementBanner.classList.remove('show');
        setTimeout(() => {
            el.announcementBanner.classList.add('hidden');
        }, 600);
    }, 8500);
}

async function translateToTurkish(text) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=tr&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data[0]) {
            return data[0].map(s => s[0]).join('');
        }
        return text;
    } catch (err) {
        console.error("Translation API error:", err);
        return text;
    }
}

let trollTimeout;
function triggerTrollFace() {
    console.log("triggerTrollFace called! Element:", el.trollOverlay);
    if (!el.trollOverlay) return;
    
    clearTimeout(trollTimeout);
    
    el.trollOverlay.classList.remove('hidden');
    // Force DOM layout recalculation
    void el.trollOverlay.offsetWidth;
    el.trollOverlay.classList.add('active');
    
    // Auto-hide after 2.5 seconds
    trollTimeout = setTimeout(() => {
        el.trollOverlay.classList.remove('active');
        trollTimeout = setTimeout(() => {
            el.trollOverlay.classList.add('hidden');
        }, 250);
    }, 2500);
}

// Retro audio synthesiser alert
function playAnnouncementSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Fast dual chime
        const playTone = (freq, startTime, duration) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0.08, startTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration);
        };
        
        const now = audioCtx.currentTime;
        playTone(587.33, now, 0.15); // D5
        playTone(880.00, now + 0.1, 0.35); // A5
    } catch(e) {
        console.warn("Audio context not allowed yet by browser policies.", e);
    }
}

// ==========================================================================
// 11. Multi-Tab Synchronisation (Broadcast Handlers)
// ==========================================================================
let activeTabs = {}; // Tracks other tabs to count viewers

function announcePresence() {
    broadcastMessage({
        type: 'presence_ping',
        tabId: getTabId()
    });
}

function broadcastMessage(payload) {
    const fullPayload = {
        ...payload,
        senderTabId: getTabId()
    };
    
    // 1. Send via BroadcastChannel (for HTTP/localhost environments)
    if (broadcastChannel) {
        try {
            broadcastChannel.postMessage(fullPayload);
        } catch(e) {}
    }
    
    // 2. Save to localStorage (as a fallback sync for local file:/// protocols)
    try {
        localStorage.setItem('party_sync_msg', JSON.stringify({
            _uid: Math.random(), // forces storage event firing
            ...fullPayload
        }));
    } catch(e) {}
}

function handleSyncMessage(msg) {
    if (!msg || msg.senderTabId === getTabId()) return;
    
    switch (msg.type) {
        case 'presence_ping':
            if (!activeTabs[msg.tabId]) {
                activeTabs[msg.tabId] = Date.now();
                updateViewersCount();
            } else {
                activeTabs[msg.tabId] = Date.now();
            }
            
            broadcastMessage({
                type: 'presence_pong',
                tabId: getTabId()
            });
            break;
            
        case 'presence_pong':
            if (!activeTabs[msg.tabId]) {
                activeTabs[msg.tabId] = Date.now();
                updateViewersCount();
            } else {
                activeTabs[msg.tabId] = Date.now();
            }
            break;
            
        case 'video_loaded':
            checkStoredVideo();
            break;
            
        case 'video_stopped':
            el.video.pause();
            el.video.removeAttribute('src');
            el.video.classList.add('hidden');
            el.defaultView.classList.remove('hidden');
            state.videoLoaded = false;
            state.isPlaying = false;
            showToast("Stream was ended by host", "error");
            break;
            
        case 'video_sync':
            if (state.isAdmin || !state.videoLoaded) return;
            
            if (msg.playing && el.video.paused) {
                el.video.play().catch(err => console.log(err));
            } else if (!msg.playing && !el.video.paused) {
                el.video.pause();
            }
            
            const timeDrift = Math.abs(el.video.currentTime - msg.currentTime);
            if (timeDrift > 1.5) {
                el.video.currentTime = msg.currentTime;
            }
            break;
            
        case 'chat_message':
            if (state.activeScreen === 'stream') {
                addChatMessage(msg.sender, msg.text, false, msg.isAdmin);
                createSpeechBubble(msg.sender, msg.text);
            }
            break;
            
        case 'announcement':
            displayAnnouncement(msg.sender, msg.text, msg.noTranslate || false);
            break;
            
        case 'troll':
            triggerTrollFace();
            break;
            
        case 'conclude':
            sessionStorage.setItem('event_concluded', 'true');
            sessionStorage.removeItem('party_user_name');
            sessionStorage.removeItem('party_is_admin');
            location.reload();
            break;
            
        case 'update_countdown':
            localStorage.setItem('countdown_target_timestamp', msg.timestamp);
            
            // If the countdown is now set to the future, reset concluded state and return guest to countdown page
            const updatedDiff = Number(msg.timestamp) - Date.now();
            if (updatedDiff > 0) {
                sessionStorage.removeItem('event_concluded');
                
                // Hide concluded card, show main countdown card
                const mainCountdown = document.getElementById('main-countdown-card');
                const concludeCard = document.getElementById('conclude-card');
                if (mainCountdown) mainCountdown.classList.remove('hidden');
                if (concludeCard) concludeCard.classList.add('hidden');
                
                // Return to countdown page if currently on username page
                if (state.activeScreen === 'username') {
                    transitionToScreen('countdown');
                }
            }
            
            initCountdown();
            break;
    }
}

// Set up Broadcast Channel receiver
if (broadcastChannel) {
    broadcastChannel.onmessage = (e) => {
        handleSyncMessage(e.data);
    };
}

// Set up local storage listener (for file:/// fallback sync)
window.addEventListener('storage', (e) => {
    if (e.key === 'party_sync_msg' && e.newValue) {
        try {
            const msg = JSON.parse(e.newValue);
            handleSyncMessage(msg);
        } catch(err) {
            console.warn("Storage sync failed:", err);
        }
    }
});

// Tab expiration checker (removes tabs inactive for 8 seconds)
setInterval(() => {
    const limit = Date.now() - 8000;
    let countChanged = false;
    
    for (let tabId in activeTabs) {
        if (activeTabs[tabId] < limit) {
            delete activeTabs[tabId];
            countChanged = true;
        }
    }
    
    if (countChanged) {
        updateViewersCount();
    }
}, 3000);

function updateViewersCount() {
    // Total viewers = self (1) + active peer tabs
    const peersCount = Object.keys(activeTabs).length;
    state.viewersCount = 1 + peersCount;
    if (el.viewersCountText) {
        el.viewersCountText.textContent = state.viewersCount;
    }
}

// Generate a random tab ID to identify tabs
let _tabId;
function getTabId() {
    if (!_tabId) {
        _tabId = 'tab_' + Math.random().toString(36).substring(2, 9);
    }
    return _tabId;
}

// ==========================================================================
// 12. Simulated Chat Bot Engine (Spices up the stream lobby!)
// ==========================================================================
let botInterval;

const bots = [
    { name: "xX_NinjaRoblox_Xx", avatar: "bear", isAdmin: false },
    { name: "Valkyrie_Rider", avatar: "fox", isAdmin: false },
    { name: "NoobMaster99", avatar: "wolf", isAdmin: false },
    { name: "Guest_4829", avatar: "wolf", isAdmin: false },
    { name: "BuildMaster_Pro", avatar: "bear", isAdmin: false },
    { name: "UnicornQueen", avatar: "fox", isAdmin: false },
    { name: "SkaterBoy99", avatar: "bear", isAdmin: false }
];

const botMessages = [
    "HYPEEE!",
    "WOOOOOO!",
    "LET'S GOOOOO 🔥",
    "GET HYPEE",
    "RobluxninML is a beast!",
    "Is this live right now??",
    "Hype hype hype",
    "LET ME INNNNN!",
    "this Roblox stream is amazing!",
    "insane party guys",
    "WOOOO!!",
    "🔥 🔥 🔥",
    "RobluxninML Admin OP!",
    "GET HYPEE!"
];

function startBotSimulator() {
    if (botInterval) return;
    
    // Send a message every 12 to 24 seconds randomly
    const runSimulator = () => {
        const delay = Math.floor(Math.random() * 12000) + 12000;
        
        botInterval = setTimeout(() => {
            if (state.activeScreen === 'stream') {
                const randomBot = bots[Math.floor(Math.random() * bots.length)];
                const randomMsg = botMessages[Math.floor(Math.random() * botMessages.length)];
                
                // Add message to chat list
                addChatMessage(randomBot.name, randomMsg, false, false);
                
                // Render bubble chat above wolf character
                createSpeechBubble(randomBot.name, randomMsg);
                
                // Recurse
                runSimulator();
            }
        }, delay);
    };
    
    runSimulator();
}

// ==========================================================================
// Helper Utility Functions
// ==========================================================================
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function showToast(text, type = "success") {
    try {
        const toast = document.createElement('div');
        toast.className = `alert-toast ${type === 'error' ? 'toast-error' : 'toast-success'}`;
        toast.textContent = text;
        
        if (el.alertContainer) {
            el.alertContainer.appendChild(toast);
        } else {
            console.log(`[Toast ${type}] ${text}`);
        }
        
        setTimeout(() => {
            toast.remove();
        }, 3300);
    } catch (err) {
        console.warn("Failed to display toast notification:", err);
    }
}

function concludeEvent() {
    sessionStorage.setItem('event_concluded', 'true');
    sessionStorage.removeItem('party_user_name');
    sessionStorage.removeItem('party_is_admin');
    
    // Broadcast to other tabs
    broadcastMessage({ type: 'conclude' });
    
    // Reload to apply the countdown screen closed layout
    location.reload();
}
