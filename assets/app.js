const STORAGE_KEY = 'seed_soil_data';
const SETTINGS_KEY = 'seed_soil_settings';

const DEPLOYED_CONFIG = {
    apiKey: 'OPENROUTER_API_KEY_PLACEHOLDER',
    password: 'APP_PASSWORD_PLACEHOLDER',
    githubToken: 'GITHUB_TOKEN_PLACEHOLDER',
    gistId: 'GIST_ID_PLACEHOLDER'
};

// Helper to check if a value is a real secret and not a placeholder
const isSecret = (val) => val && !val.includes('PLACEHOLDER') && val.length > 3;

let state = {
    items: [],
    gaps: [],
    settings: {
        apiKey: isSecret(DEPLOYED_CONFIG.apiKey) ? DEPLOYED_CONFIG.apiKey : '',
        password: isSecret(DEPLOYED_CONFIG.password) ? DEPLOYED_CONFIG.password : '',
        githubToken: isSecret(DEPLOYED_CONFIG.githubToken) ? DEPLOYED_CONFIG.githubToken : '',
        gistId: isSecret(DEPLOYED_CONFIG.gistId) ? DEPLOYED_CONFIG.gistId : ''
    },
    isAuthenticated: false,
    isProcessing: false,
    isSyncing: false
};

// --- Core Logic ---

function init() {
    loadData();

    // Secrets override - DEPLOYED_CONFIG always wins if set
    const hasHardcodedKey = isSecret(DEPLOYED_CONFIG.apiKey);
    const hasHardcodedPass = isSecret(DEPLOYED_CONFIG.password);
    const hasHardcodedToken = isSecret(DEPLOYED_CONFIG.githubToken);
    const hasHardcodedGist = isSecret(DEPLOYED_CONFIG.gistId);

    if (hasHardcodedKey) {
        state.settings.apiKey = DEPLOYED_CONFIG.apiKey;
        const el = document.getElementById('api-key-group');
        if (el) el.remove();
    }
    if (hasHardcodedPass) {
        state.settings.password = DEPLOYED_CONFIG.password;
        const el = document.getElementById('app-password-group');
        if (el) el.remove();
    }
    if (hasHardcodedToken) {
        state.settings.githubToken = DEPLOYED_CONFIG.githubToken;
        const el = document.getElementById('github-token-group');
        if (el) el.remove();
    }
    if (hasHardcodedGist) {
        state.settings.gistId = DEPLOYED_CONFIG.gistId;
        const el = document.getElementById('gist-id-group');
        if (el) el.remove();
    }

    // Hide headers if everything is hardcoded
    if (hasHardcodedKey && hasHardcodedPass) {
        const header = document.querySelector('#settings-modal h2');
        if (header) header.innerText = 'System Configured';
    }
    if (hasHardcodedToken && hasHardcodedGist) {
        const syncHeader = document.querySelector('#settings-modal h3');
        if (syncHeader) syncHeader.remove();
    }
    if (hasHardcodedKey && hasHardcodedPass && hasHardcodedToken && hasHardcodedGist) {
        const btn = document.getElementById('save-settings-btn');
        if (btn) btn.remove();
    }

    setupDragAndDrop();

    if (state.settings.password) {
        renderLockScreen();
    } else {
        state.isAuthenticated = true;
        applyDecay();
        if (state.settings.githubToken && state.settings.gistId) {
            syncWithGist().then(() => renderDashboard());
        } else {
            renderDashboard();
        }
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

function loadData() {
    const d = localStorage.getItem(STORAGE_KEY);
    if (d) {
        const parsed = JSON.parse(d);
        state.items = parsed.items || [];
        state.gaps = parsed.gaps || [];
    }
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) {
        const saved = JSON.parse(s);
        // ONLY use saved if hardcoded is NOT present
        if (!state.settings.apiKey) state.settings.apiKey = saved.apiKey || '';
        if (!state.settings.password) state.settings.password = saved.password || '';
        if (!state.settings.githubToken) state.settings.githubToken = saved.githubToken || '';
        if (!state.settings.gistId) state.settings.gistId = saved.gistId || '';

        // Update UI inputs if they exist
        const apiInput = document.getElementById('api-key');
        if (apiInput) apiInput.value = state.settings.apiKey;
        const passInput = document.getElementById('app-password');
        if (passInput) passInput.value = state.settings.password;
        const tokenInput = document.getElementById('github-token');
        if (tokenInput) tokenInput.value = state.settings.githubToken;
        const gistInput = document.getElementById('gist-id');
        if (gistInput) gistInput.value = state.settings.gistId;
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, gaps: state.gaps }));
    if (state.settings.githubToken && state.settings.gistId) {
        syncWithGist(true); // Background push
    }
}

function applyDecay() {
    const now = Date.now();
    let changed = false;
    state.items.forEach(item => {
        if (item.soil.status === 'active') {
            const hours = (now - item.soil.lastSeen) / 3600000;
            const steps = Math.floor(hours / 24);
            if (steps > 0) {
                item.soil.strength = Math.max(0, item.soil.strength - (steps * 0.1));
                item.soil.lastSeen = now;
                if (item.soil.strength <= 0) item.soil.status = 'buried';
                changed = true;
            }
        }
    });
    if (changed) saveData();
}

// --- Drag and Drop Logic ---

function setupDragAndDrop() {
    const zone = document.getElementById('drop-zone');

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.remove('opacity-0', 'pointer-events-none');
        zone.classList.add('opacity-100');
    });

    window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) {
            zone.classList.add('opacity-0', 'pointer-events-none');
            zone.classList.remove('opacity-100');
        }
    });

    window.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.add('opacity-0', 'pointer-events-none');
        zone.classList.remove('opacity-100');

        const files = Array.from(e.dataTransfer.files);
        const text = e.dataTransfer.getData('text');

        if (files.length > 0) {
            for (const file of files) {
                await handleFile(file);
            }
        } else if (text) {
            captureSeed(text);
        }

        // Auto-trigger pulse if API key exists
        if (state.settings.apiKey) processPulse();
    });
}

async function handleFile(file) {
    showToast(`Processing ${file.name}...`);

    if (file.type === 'application/pdf') {
        const text = await extractPdfText(file);
        captureSeed(text);
    } else if (file.type.startsWith('image/')) {
        const text = await extractImageText(file);
        captureSeed(text);
    } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        const text = await file.text();
        captureSeed(text);
    } else {
        showToast('Unsupported file type');
    }
}

async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

async function extractImageText(file) {
    const result = await Tesseract.recognize(file, 'eng+ara');
    return result.data.text;
}

// --- UI Rendering ---

function renderLockScreen() {
    const main = document.getElementById('main-view');
    main.innerHTML = `
        <div class="w-full max-w-xs animate-fade-in flex flex-col items-center">
            <div class="w-24 h-24 glass rounded-full flex items-center justify-center mb-12 border border-white/5">
                <i data-lucide="lock" class="w-8 h-8 text-accent/60"></i>
            </div>
            <h1 class="text-3xl font-light mb-12 tracking-tight">Seed & Soil</h1>
            <input type="password" id="lock-input" 
                class="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-5 text-center focus:border-accent/40 outline-none transition-all mb-4" 
                placeholder="••••••••" 
                onkeydown="if(event.key==='Enter') unlock()">
            <button onclick="unlock()" class="w-full bg-accent text-dark py-5 rounded-2xl font-bold text-[10px] uppercase tracking-[0.2em] hover:brightness-110 transition-all">Unlock</button>
        </div>`;
    lucide.createIcons();
    document.getElementById('lock-input').focus();
}

function unlock() {
    const val = document.getElementById('lock-input').value;
    if (val === state.settings.password) {
        state.isAuthenticated = true;
        applyDecay();
        renderDashboard();
    } else {
        showToast('Access Denied');
    }
}

function renderDashboard() {
    const main = document.getElementById('main-view');
    main.className = "w-full max-w-2xl h-full flex flex-col p-6 overflow-y-auto";

    const activeItems = state.items.filter(i => i.soil.status === 'active');
    const triageItems = activeItems.filter(i => i.seed).slice(0, 3);

    main.innerHTML = `
        <header class="flex justify-between items-center mb-16 safe-top">
            <h1 class="text-xl font-medium tracking-tight">Seed & Soil</h1>
            <div class="flex gap-4">
                <button onclick="processPulse()" class="p-3 glass rounded-2xl text-accent/80 hover:bg-accent/10 transition-all">
                    <i data-lucide="zap" class="w-5 h-5"></i>
                </button>
                <button onclick="toggleSettings()" class="p-3 glass rounded-2xl text-muted hover:text-white transition-all">
                    <i data-lucide="settings" class="w-5 h-5"></i>
                </button>
            </div>
        </header>

        <section class="mb-16">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-1 h-1 rounded-full bg-accent"></div>
                <h2 class="text-[10px] uppercase tracking-[0.2em] text-muted font-bold">Daily Synthesis</h2>
            </div>
            <div class="grid grid-cols-1 gap-4">
                ${state.gaps.length > 0 ? state.gaps.map(gap => `
                    <div class="glass p-6 rounded-3xl border border-accent/5">
                        <p class="text-sm text-zinc-300 leading-relaxed">${gap}</p>
                    </div>
                `).join('') : `
                    <div class="glass p-10 rounded-3xl text-center border-dashed border-white/5">
                        <p class="text-[10px] uppercase tracking-[0.1em] text-muted/50">Pulse required for synthesis</p>
                    </div>
                `}
            </div>
        </section>

        <section class="mb-16">
            <div class="glass rounded-[2.5rem] p-8 relative group border border-white/5">
                <textarea id="capture-input" 
                    class="w-full bg-transparent text-lg focus:outline-none resize-none h-32 leading-relaxed" 
                    placeholder="Drop a seed or file..."
                    onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') captureSeed()"></textarea>
                <div class="flex justify-between items-center mt-6">
                    <span class="text-[9px] text-muted uppercase tracking-[0.2em] opacity-40">Drop files or Cmd+Enter</span>
                    <button onclick="captureSeed()" class="bg-accent text-dark px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] hover:brightness-110 transition-all">Capture</button>
                </div>
            </div>
        </section>

        ${triageItems.length > 0 ? `
        <section class="mb-16">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-1 h-1 rounded-full bg-accent"></div>
                <h2 class="text-[10px] uppercase tracking-[0.2em] text-muted font-bold">The Triage</h2>
            </div>
            <div class="flex flex-col gap-6">
                ${triageItems.map(item => `
                    <div class="glass p-8 rounded-[2rem] animate-fade-in relative overflow-hidden wisdom-card border border-white/5">
                        <div class="strength-bar absolute top-0 left-0 w-full">
                            <div class="strength-fill" style="width: ${item.soil.strength * 100}%"></div>
                        </div>
                        <h3 class="text-xl font-medium mb-4 mt-2 leading-tight">${item.seed.essence}</h3>
                        <p class="text-sm text-muted italic mb-8 leading-relaxed">"${item.seed.action}"</p>
                        <div class="flex gap-4">
                            <button onclick="interact('${item.id}', true)" class="flex-1 bg-accent/10 border border-accent/20 text-accent py-4 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-accent hover:text-dark transition-all">I DID THIS</button>
                            <button onclick="interact('${item.id}', false)" class="px-6 glass text-muted hover:text-red-400 rounded-xl transition-all border border-white/5"><i data-lucide="archive" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
        ` : ''}

        <section class="mb-24">
            <div class="flex items-center justify-between mb-8">
                <div class="flex items-center gap-3">
                    <div class="w-1 h-1 rounded-full bg-muted/30"></div>
                    <h2 class="text-[10px] uppercase tracking-[0.2em] text-muted font-bold">Active Soil</h2>
                </div>
                <span class="text-[9px] text-muted/50 font-mono tracking-widest">${activeItems.length} SEEDS</span>
            </div>
            <div class="grid grid-cols-1 gap-4">
                ${activeItems.length > 0 ? activeItems.map(item => `
                    <div class="glass p-5 rounded-2xl flex items-center justify-between group border border-white/5 wisdom-card ${item.isProcessing ? 'animate-pulse' : ''}">
                        <div class="flex-1 min-w-0">
                            <h4 class="text-sm font-medium text-zinc-300 truncate">${item.seed ? item.seed.essence : item.raw}</h4>
                            <div class="flex items-center gap-3 mt-2">
                                <div class="w-16 h-[1px] bg-white/5 rounded-full overflow-hidden">
                                    <div class="h-full bg-accent/40" style="width: ${item.soil.strength * 100}%"></div>
                                </div>
                                <span class="text-[8px] text-muted uppercase tracking-[0.1em]">${item.isProcessing ? 'Distilling...' : (item.seed ? 'Distilled' : 'Raw')}</span>
                            </div>
                        </div>
                        ${!item.isProcessing ? `
                        <button onclick="buryItem('${item.id}')" class="opacity-0 group-hover:opacity-100 p-3 text-muted hover:text-red-500 transition-all">
                            <i data-lucide="archive" class="w-4 h-4"></i>
                        </button>
                        ` : ''}
                    </div>
                `).join('') : `
                    <p class="text-center py-16 text-muted/30 text-[10px] uppercase tracking-[0.2em]">The soil is quiet</p>
                `}
            </div>
            <button onclick="setView('buried')" class="w-full mt-12 text-[9px] uppercase tracking-[0.3em] text-muted/40 hover:text-accent transition-all">View Buried Knowledge</button>
        </section>
    `;
    lucide.createIcons();
}

// --- Actions ---

function captureSeed(manualText) {
    const input = document.getElementById('capture-input');
    const text = manualText || input.value.trim();
    if (!text) return;

    const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        raw: text,
        seed: null,
        soil: {
            strength: 1.0,
            lastSeen: Date.now(),
            nextReview: Date.now() + 86400000,
            status: 'active'
        }
    };

    state.items.unshift(newItem);
    saveData();
    if (!manualText) input.value = '';
    showToast('Seed Captured');
    renderDashboard();
}

async function processPulse() {
    if (!state.settings.apiKey) { showToast('API Key Required'); toggleSettings(); return; }
    if (state.isProcessing) return;

    state.isProcessing = true;
    showToast('Pulse Started');

    const unpro = state.items.filter(i => !i.seed);
    const active = state.items.filter(i => i.soil.status === 'active' && i.seed);

    for (const item of unpro) {
        item.isProcessing = true;
        renderDashboard();
        try {
            const textToProcess = item.raw.substring(0, 30000); // Increased limit

            const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.settings.apiKey}`,
                    'HTTP-Referer': 'https://seed-soil.app',
                    'X-Title': 'Seed & Soil'
                },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-exp:free',
                    messages: [
                        { role: 'system', content: 'Act as a Socratic Mentor. Extract DNA from text. Return JSON: { "essence": "1 sentence", "nuggets": ["insight1", "insight2"], "action": "1 challenge" }' },
                        { role: 'user', content: textToProcess }
                    ],
                    response_format: { type: 'json_object' }
                })
            });

            if (!r.ok) {
                const errData = await r.json();
                throw new Error(errData.error?.message || 'API Error');
            }

            const d = await r.json();
            if (d.choices && d.choices[0]) {
                const content = d.choices[0].message.content;
                item.seed = JSON.parse(content);
                item.isProcessing = false;
                saveData();
                renderDashboard();
            } else {
                throw new Error('No response from AI');
            }
        } catch (e) {
            console.error('Distillation failed:', e);
            item.isProcessing = false;
            showToast(`Error: ${e.message.substring(0, 30)}...`);
            renderDashboard();
        }
    }

    if (active.length > 2) {
        try {
            const context = active.map(i => i.seed.essence).join('\n');
            const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.settings.apiKey}`, 'HTTP-Referer': 'https://seed-soil.app', 'X-Title': 'Seed & Soil' },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-exp:free',
                    messages: [
                        { role: 'system', content: 'Analyze these knowledge entries. Identify 2-3 non-obvious knowledge gaps or synthesis connections. Return JSON: { "gaps": ["gap1", "gap2"] }' },
                        { role: 'user', content: context }
                    ],
                    response_format: { type: 'json_object' }
                })
            });
            const d = await r.json();
            const res = JSON.parse(d.choices[0].message.content);
            state.gaps = res.gaps;
            saveData();
        } catch (e) { console.error(e); }
    }

    state.isProcessing = false;
    showToast('Pulse Complete');
    renderDashboard();
}

function interact(id, success) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    if (success) {
        item.soil.strength = 1.0;
        item.soil.lastSeen = Date.now();
        showToast('Wisdom Strengthened');
    } else {
        item.soil.status = 'buried';
        showToast('Seed Buried');
    }
    saveData();
    renderDashboard();
}

function buryItem(id) {
    const item = state.items.find(i => i.id === id);
    if (item) {
        item.soil.status = 'buried';
        saveData();
        renderDashboard();
        showToast('Archived');
    }
}

function toggleSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.toggle('hidden');
}

function logout() {
    state.isAuthenticated = false;
    renderLockScreen();
}

function showToast(m) {
    const t = document.getElementById('toast');
    t.innerText = m;
    t.classList.remove('opacity-0', 'pointer-events-none');
    t.classList.add('opacity-100');
    setTimeout(() => {
        t.classList.add('opacity-0', 'pointer-events-none');
        t.classList.remove('opacity-100');
    }, 3000);
}

function setView(v) {
    if (v === 'buried') renderBuried();
    else renderDashboard();
}

function renderBuried() {
    const main = document.getElementById('main-view');
    const buried = state.items.filter(i => i.soil.status === 'buried');
    main.innerHTML = `
        <header class="flex justify-between items-center mb-16 safe-top">
            <button onclick="renderDashboard()" class="p-3 glass rounded-2xl text-muted hover:text-white transition-all"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
            <h1 class="text-xl font-medium tracking-tight">Buried Knowledge</h1>
            <div class="w-12"></div>
        </header>
        <div class="flex flex-col gap-4">
            ${buried.length > 0 ? buried.map(i => `
                <div class="glass p-6 rounded-2xl group relative border border-white/5 wisdom-card">
                    <h3 class="text-sm font-medium text-zinc-300 mb-4 leading-relaxed">${i.seed ? i.seed.essence : i.raw.substring(0, 100)}</h3>
                    <button onclick="unbury('${i.id}')" class="text-[9px] uppercase tracking-[0.2em] text-accent font-bold opacity-0 group-hover:opacity-100 transition-all">Resurrect</button>
                </div>
            `).join('') : '<p class="text-center py-20 text-muted/30 text-[10px] uppercase tracking-[0.2em]">The soil is empty</p>'}
        </div>
    `;
    lucide.createIcons();
}

function unbury(id) {
    const i = state.items.find(x => x.id === id);
    if (i) {
        i.soil.status = 'active';
        i.soil.strength = 0.5;
        i.soil.lastSeen = Date.now();
        saveData();
        renderDashboard();
        showToast('Resurrected');
    }
}

async function syncWithGist(pushOnly = false) {
    if (!state.settings.githubToken || !state.settings.gistId || state.isSyncing) return;

    state.isSyncing = true;
    if (!pushOnly) showToast('Syncing with Cloud...');

    try {
        const url = `https://api.github.com/gists/${state.settings.gistId}`;
        const headers = {
            'Authorization': `token ${state.settings.githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
        };

        if (pushOnly) {
            // PUSH
            await fetch(url, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    files: {
                        'seed-soil-data.json': {
                            content: JSON.stringify({ items: state.items, gaps: state.gaps })
                        }
                    }
                })
            });
        } else {
            // PULL
            const r = await fetch(url, { headers });
            const d = await r.json();
            if (d.files && d.files['seed-soil-data.json']) {
                const remoteData = JSON.parse(d.files['seed-soil-data.json'].content);
                // Simple merge: remote wins for now, or we could do timestamp check
                state.items = remoteData.items || [];
                state.gaps = remoteData.gaps || [];
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, gaps: state.gaps }));
                renderDashboard();
            }
        }
    } catch (e) {
        console.error('Sync failed:', e);
        if (!pushOnly) showToast('Sync Failed');
    } finally {
        state.isSyncing = false;
        if (!pushOnly) showToast('Sync Complete');
    }
}

function saveSettings() {
    const apiInput = document.getElementById('api-key');
    const passInput = document.getElementById('app-password');
    const tokenInput = document.getElementById('github-token');
    const gistInput = document.getElementById('gist-id');

    if (apiInput) state.settings.apiKey = apiInput.value;
    if (passInput) state.settings.password = passInput.value;
    if (tokenInput) state.settings.githubToken = tokenInput.value;
    if (gistInput) state.settings.gistId = gistInput.value;

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    toggleSettings();
    showToast('Settings Saved');
    if (state.settings.githubToken && state.settings.gistId) syncWithGist();
}

function exportData() {
    const b = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = 'seed-soil-export.json'; a.click();
}

function clearAllData() {
    if (confirm('Delete everything?')) {
        state.items = [];
        state.gaps = [];
        saveData();
        renderDashboard();
        toggleSettings();
    }
}

init();
