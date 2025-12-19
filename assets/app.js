const STORAGE_KEY = 'seed_soil_data';
const SETTINGS_KEY = 'seed_soil_settings';

const DEPLOYED_CONFIG = {
    apiKey: 'OPENROUTER_API_KEY_PLACEHOLDER',
    password: 'APP_PASSWORD_PLACEHOLDER'
};

let state = {
    items: [],
    gaps: [], // Daily suggestions/gaps
    settings: {
        apiKey: DEPLOYED_CONFIG.apiKey !== 'OPENROUTER_API_KEY_PLACEHOLDER' ? DEPLOYED_CONFIG.apiKey : '',
        password: DEPLOYED_CONFIG.password !== 'APP_PASSWORD_PLACEHOLDER' ? DEPLOYED_CONFIG.password : ''
    },
    isAuthenticated: false,
    isProcessing: false
};

// --- Core Logic ---

function init() {
    loadData();
    // Secrets override
    if (DEPLOYED_CONFIG.apiKey !== 'OPENROUTER_API_KEY_PLACEHOLDER') state.settings.apiKey = DEPLOYED_CONFIG.apiKey;
    if (DEPLOYED_CONFIG.password !== 'APP_PASSWORD_PLACEHOLDER') state.settings.password = DEPLOYED_CONFIG.password;

    if (state.settings.password) {
        renderLockScreen();
    } else {
        state.isAuthenticated = true;
        applyDecay();
        renderDashboard();
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
        state.settings.apiKey = state.settings.apiKey || saved.apiKey || '';
        state.settings.password = state.settings.password || saved.password || '';
    }
}

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, gaps: state.gaps }));
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

// --- UI Rendering ---

function renderLockScreen() {
    const main = document.getElementById('main-view');
    main.innerHTML = `
        <div class="w-full max-w-xs animate-fade-in flex flex-col items-center">
            <div class="w-20 h-20 glass rounded-full flex items-center justify-center mb-8">
                <i data-lucide="shield-check" class="w-8 h-8 text-accent"></i>
            </div>
            <h1 class="text-3xl font-light outfit mb-8">Seed & Soil</h1>
            <input type="password" id="lock-input" 
                class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-center outfit focus:border-accent outline-none transition-all" 
                placeholder="Password" 
                onkeydown="if(event.key==='Enter') unlock()">
            <button onclick="unlock()" class="w-full mt-4 bg-white text-black py-4 rounded-2xl font-bold outfit hover:bg-zinc-200 transition-all">Unlock</button>
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
    main.className = "w-full max-w-2xl h-full flex flex-col p-4 overflow-y-auto";

    const activeItems = state.items.filter(i => i.soil.status === 'active');
    const triageItems = activeItems.filter(i => i.seed).slice(0, 3);

    main.innerHTML = `
        <!-- Header -->
        <header class="flex justify-between items-center mb-10 safe-top">
            <h1 class="text-xl font-semibold outfit tracking-tight">Seed & Soil</h1>
            <div class="flex gap-3">
                <button onclick="processPulse()" class="p-2 glass rounded-xl text-accent hover:bg-accent/10 transition-colors">
                    <i data-lucide="zap" class="w-5 h-5"></i>
                </button>
                <button onclick="toggleSettings()" class="p-2 glass rounded-xl text-zinc-500 hover:text-white transition-colors">
                    <i data-lucide="settings" class="w-5 h-5"></i>
                </button>
            </div>
        </header>

        <!-- Knowledge Gaps / Daily Suggestions -->
        <section class="mb-12">
            <div class="flex items-center gap-2 mb-4">
                <i data-lucide="sparkles" class="w-4 h-4 text-accent"></i>
                <h2 class="text-xs uppercase tracking-widest text-zinc-500 font-bold">Daily Wisdom & Gaps</h2>
            </div>
            <div class="grid grid-cols-1 gap-4">
                ${state.gaps.length > 0 ? state.gaps.map(gap => `
                    <div class="glass p-5 rounded-2xl border-l-2 border-accent/30">
                        <p class="text-sm text-zinc-300 leading-relaxed">${gap}</p>
                    </div>
                `).join('') : `
                    <div class="glass p-8 rounded-2xl text-center border-dashed border-zinc-800">
                        <p class="text-xs text-zinc-600">No gaps detected. Run Pulse to analyze your soil.</p>
                    </div>
                `}
            </div>
        </section>

        <!-- The Void (Capture) -->
        <section class="mb-12">
            <div class="glass rounded-3xl p-6 relative group">
                <textarea id="capture-input" 
                    class="w-full bg-transparent text-lg outfit focus:outline-none resize-none h-24" 
                    placeholder="What did you learn today?"
                    onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') captureSeed()"></textarea>
                <div class="flex justify-between items-center mt-4">
                    <span class="text-[10px] text-zinc-600 uppercase tracking-widest">Cmd + Enter to save</span>
                    <button onclick="captureSeed()" class="bg-white text-black px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all">Save Seed</button>
                </div>
            </div>
        </section>

        <!-- Triage (Review) -->
        ${triageItems.length > 0 ? `
        <section class="mb-12">
            <div class="flex items-center gap-2 mb-4">
                <i data-lucide="trello" class="w-4 h-4 text-accent"></i>
                <h2 class="text-xs uppercase tracking-widest text-zinc-500 font-bold">The Triage</h2>
            </div>
            <div class="flex flex-col gap-4">
                ${triageItems.map(item => `
                    <div class="glass p-6 rounded-2xl animate-fade-in relative overflow-hidden">
                        <div class="strength-bar absolute top-0 left-0 w-full">
                            <div class="strength-fill" style="width: ${item.soil.strength * 100}%"></div>
                        </div>
                        <h3 class="text-lg outfit font-medium mb-3 mt-2">${item.seed.essence}</h3>
                        <p class="text-sm text-zinc-400 italic mb-6">"${item.seed.action}"</p>
                        <div class="flex gap-3">
                            <button onclick="interact('${item.id}', true)" class="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl text-xs font-bold transition-all">I DID THIS</button>
                            <button onclick="interact('${item.id}', false)" class="px-4 glass text-zinc-500 hover:text-red-400 rounded-xl transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </section>
        ` : ''}

        <!-- Active Wisdom (The Past) -->
        <section class="mb-20">
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                    <i data-lucide="layers" class="w-4 h-4 text-zinc-500"></i>
                    <h2 class="text-xs uppercase tracking-widest text-zinc-500 font-bold">Active Wisdom</h2>
                </div>
                <span class="text-[10px] text-zinc-600 font-mono">${activeItems.length} Seeds</span>
            </div>
            <div class="grid grid-cols-1 gap-3">
                ${activeItems.length > 0 ? activeItems.map(item => `
                    <div class="glass p-4 rounded-xl flex items-center justify-between group">
                        <div class="flex-1 min-w-0">
                            <h4 class="text-sm font-medium text-zinc-300 truncate">${item.seed ? item.seed.essence : item.raw}</h4>
                            <div class="flex items-center gap-2 mt-1">
                                <div class="w-12 h-1 bg-zinc-900 rounded-full overflow-hidden">
                                    <div class="h-full bg-accent" style="width: ${item.soil.strength * 100}%"></div>
                                </div>
                                <span class="text-[8px] text-zinc-600 uppercase tracking-tighter">${item.seed ? 'Distilled' : 'Raw'}</span>
                            </div>
                        </div>
                        <button onclick="buryItem('${item.id}')" class="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-500 transition-all">
                            <i data-lucide="archive" class="w-4 h-4"></i>
                        </button>
                    </div>
                `).join('') : `
                    <p class="text-center py-10 text-zinc-700 text-sm">The soil is empty. Drop a seed above.</p>
                `}
            </div>
            <button onclick="setView('buried')" class="w-full mt-8 text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors">View Buried Knowledge</button>
        </section>
    `;
    lucide.createIcons();
}

// --- Actions ---

function captureSeed() {
    const input = document.getElementById('capture-input');
    const text = input.value.trim();
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
    input.value = '';
    showToast('Seed Captured');
    renderDashboard();
}

async function processPulse() {
    if (!state.settings.apiKey) { showToast('API Key Required'); toggleSettings(); return; }
    if (state.isProcessing) return;

    state.isProcessing = true;
    showToast('Pulse Started...');

    const unpro = state.items.filter(i => !i.seed);
    const active = state.items.filter(i => i.soil.status === 'active' && i.seed);

    // 1. Distill new seeds
    for (const item of unpro) {
        try {
            const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.settings.apiKey}`, 'HTTP-Referer': 'https://seed-soil.app', 'X-Title': 'Seed & Soil' },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-exp:free',
                    messages: [
                        { role: 'system', content: 'Act as a Socratic Mentor. Extract DNA from text. Return JSON: { "essence": "1 sentence", "nuggets": ["insight1", "insight2"], "action": "1 challenge" }' },
                        { role: 'user', content: item.raw }
                    ],
                    response_format: { type: 'json_object' }
                })
            });
            const d = await r.json();
            item.seed = JSON.parse(d.choices[0].message.content);
            saveData();
        } catch (e) { console.error(e); }
    }

    // 2. Detect Gaps & Connections
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
        item.soil.strength = 1.0; // Reset to full strength
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

// --- UI Helpers ---

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
        <header class="flex justify-between items-center mb-10 safe-top">
            <button onclick="renderDashboard()" class="text-zinc-500 hover:text-white"><i data-lucide="arrow-left" class="w-6 h-6"></i></button>
            <h1 class="text-xl font-semibold outfit">Buried Knowledge</h1>
            <div class="w-6"></div>
        </header>
        <div class="flex flex-col gap-4">
            ${buried.length > 0 ? buried.map(i => `
                <div class="glass p-5 rounded-2xl group relative">
                    <h3 class="text-sm font-medium text-zinc-300 mb-2">${i.seed ? i.seed.essence : i.raw.substring(0, 50)}</h3>
                    <button onclick="unbury('${i.id}')" class="text-[10px] uppercase tracking-widest text-accent font-bold opacity-0 group-hover:opacity-100 transition-all">Resurrect</button>
                </div>
            `).join('') : '<p class="text-center py-20 text-zinc-600">The soil is empty.</p>'}
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

function saveSettings() {
    state.settings.apiKey = document.getElementById('api-key').value;
    state.settings.password = document.getElementById('app-password').value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    toggleSettings();
    showToast('Settings Saved');
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
