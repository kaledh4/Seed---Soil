const STORAGE_KEY = 'seed_soil_data';
const SETTINGS_KEY = 'seed_soil_settings';

// SINGLE USER CONFIG: This can be replaced by GitHub Actions during deployment
const DEPLOYED_CONFIG = {
    apiKey: 'OPENROUTER_API_KEY_PLACEHOLDER',
    password: 'APP_PASSWORD_PLACEHOLDER'
};

let state = {
    items: [],
    settings: {
        apiKey: DEPLOYED_CONFIG.apiKey !== 'OPENROUTER_API_KEY_PLACEHOLDER' ? DEPLOYED_CONFIG.apiKey : '',
        password: DEPLOYED_CONFIG.password !== 'APP_PASSWORD_PLACEHOLDER' ? DEPLOYED_CONFIG.password : ''
    },
    currentView: 'void',
    isAuthenticated: false
};

function init() {
    loadData();
    if (DEPLOYED_CONFIG.apiKey !== 'OPENROUTER_API_KEY_PLACEHOLDER') state.settings.apiKey = DEPLOYED_CONFIG.apiKey;
    if (DEPLOYED_CONFIG.password !== 'APP_PASSWORD_PLACEHOLDER') state.settings.password = DEPLOYED_CONFIG.password;

    if (state.settings.password) {
        renderLockScreen();
    } else {
        state.isAuthenticated = true;
        document.getElementById('settings-trigger').classList.remove('hidden');
        applyDecay();
        render();
    }
    lucide.createIcons();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

function loadData() {
    const d = localStorage.getItem(STORAGE_KEY);
    if (d) state.items = JSON.parse(d);
    const s = localStorage.getItem(SETTINGS_KEY);
    if (s) {
        const saved = JSON.parse(s);
        state.settings.apiKey = state.settings.apiKey || saved.apiKey || '';
        state.settings.password = state.settings.password || saved.password || '';
        document.getElementById('api-key').value = state.settings.apiKey;
        document.getElementById('app-password').value = state.settings.password;
        if (state.settings.password) document.getElementById('logout-btn').classList.remove('hidden');
    }
}

function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }
function saveSettings() {
    state.settings.apiKey = document.getElementById('api-key').value;
    state.settings.password = document.getElementById('app-password').value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    if (state.settings.password) document.getElementById('logout-btn').classList.remove('hidden');
    else document.getElementById('logout-btn').classList.add('hidden');
    toggleSettings();
    showToast('Settings saved');
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

function render() {
    const m = document.getElementById('main-view');
    m.innerHTML = '';
    if (state.currentView === 'void') renderVoid(m);
    else if (state.currentView === 'challenge') renderChallenge(m);
    else if (state.currentView === 'pulse') renderPulse(m);
    else if (state.currentView === 'buried') renderBuried(m);
    lucide.createIcons();
}

function renderLockScreen() {
    document.getElementById('settings-trigger').classList.add('hidden');
    document.getElementById('main-view').innerHTML = `
        <div class="w-full flex flex-col items-center animate-fade-in">
            <div class="mb-12 text-center">
                <div class="w-16 h-16 glass rounded-full flex items-center justify-center mx-auto mb-6"><i data-lucide="lock" class="w-6 h-6 text-accent"></i></div>
                <h1 class="text-2xl font-light outfit mb-2">Seed & Soil</h1>
                <p class="text-zinc-500 text-sm">Enter password to unlock</p>
            </div>
            <div class="w-full max-w-xs">
                <input type="password" id="lock-input" class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 text-center outfit focus:border-accent outline-none transition-all" placeholder="••••••••" onkeydown="if(event.key==='Enter') unlock()">
                <button onclick="unlock()" class="w-full mt-4 bg-white text-black py-4 rounded-2xl font-bold outfit hover:bg-zinc-200 transition-all">Unlock</button>
            </div>
        </div>`;
    lucide.createIcons();
    document.getElementById('lock-input').focus();
}

function unlock() {
    if (document.getElementById('lock-input').value === state.settings.password) {
        state.isAuthenticated = true;
        document.getElementById('settings-trigger').classList.remove('hidden');
        applyDecay();
        render();
    } else {
        showToast('Incorrect password');
    }
}

function logout() { state.isAuthenticated = false; toggleSettings(); renderLockScreen(); }

function renderVoid(c) {
    c.innerHTML = `
        <div class="w-full flex flex-col items-center animate-fade-in">
            <div class="mb-12 text-center">
                <h1 class="text-4xl font-light outfit mb-2">The Void</h1>
                <p class="text-zinc-500 text-sm">What did you learn today?</p>
            </div>
            <textarea id="capture-input" class="w-full bg-transparent border-b border-zinc-800 py-4 text-lg outfit focus:border-accent outline-none transition-all resize-none h-32 text-center" placeholder="Drop a seed..." onkeydown="if((event.metaKey||event.ctrlKey)&&event.key==='Enter') captureSeed()"></textarea>
            <div class="mt-12 flex gap-6">
                <button onclick="setView('challenge')" class="flex flex-col items-center gap-2 group">
                    <div class="w-12 h-12 rounded-full glass flex items-center justify-center group-hover:bg-accent/10 transition-colors"><i data-lucide="flame" class="w-5 h-5 text-zinc-400 group-hover:text-accent"></i></div>
                    <span class="text-[10px] uppercase tracking-widest text-zinc-500">Triage</span>
                </button>
                <button onclick="processPulse()" class="flex flex-col items-center gap-2 group">
                    <div class="w-12 h-12 rounded-full glass flex items-center justify-center group-hover:bg-accent/10 transition-colors"><i data-lucide="zap" class="w-5 h-5 text-zinc-400 group-hover:text-accent"></i></div>
                    <span class="text-[10px] uppercase tracking-widest text-zinc-500">Pulse</span>
                </button>
            </div>
        </div>`;
    document.getElementById('capture-input').focus();
}

function renderChallenge(c) {
    const active = state.items.filter(i => i.soil.status === 'active' && i.seed).sort((a, b) => b.soil.strength - a.soil.strength);
    const s = active[0];
    if (!s) {
        c.innerHTML = `<div class="text-center animate-fade-in"><i data-lucide="wind" class="w-12 h-12 text-zinc-800 mx-auto mb-4"></i><h2 class="text-xl outfit text-zinc-400">The soil is quiet.</h2><button onclick="setView('void')" class="mt-8 text-accent text-sm font-medium">Return to Void</button></div>`;
        return;
    }
    c.innerHTML = `
        <div class="w-full flex flex-col h-full animate-fade-in">
            <div class="flex justify-between items-center mb-8">
                <button onclick="setView('void')" class="text-zinc-500 hover:text-white transition-colors"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                <div class="flex items-center gap-2"><div class="h-1 w-24 bg-zinc-900 rounded-full overflow-hidden"><div class="h-full bg-accent transition-all duration-500" style="width: ${s.soil.strength * 100}%"></div></div><span class="text-[10px] text-zinc-500 font-mono">${Math.round(s.soil.strength * 100)}%</span></div>
            </div>
            <div class="flex-1 flex flex-col justify-center">
                <div class="glass p-8 rounded-[2rem] relative overflow-hidden">
                    <h2 class="text-2xl outfit font-semibold mb-6 leading-tight">${s.seed.essence}</h2>
                    <div class="space-y-4 mb-8">${s.seed.nuggets.map(n => `<div class="flex gap-3"><div class="w-1 h-1 rounded-full bg-accent mt-2 shrink-0"></div><p class="text-zinc-400 text-sm leading-relaxed">${n}</p></div>`).join('')}</div>
                    <div class="bg-accent/5 border border-accent/10 p-5 rounded-2xl"><span class="text-[10px] uppercase tracking-widest text-accent font-bold mb-2 block">The Challenge</span><p class="text-zinc-200 text-sm italic">"${s.seed.action}"</p></div>
                </div>
            </div>
            <div class="mt-12 grid grid-cols-2 gap-4">
                <button onclick="interact('${s.id}', false)" class="glass py-4 rounded-2xl text-zinc-500 hover:text-red-400 transition-all flex flex-col items-center gap-1"><i data-lucide="trash-2" class="w-5 h-5"></i><span class="text-[10px] uppercase tracking-widest">Bury</span></button>
                <button onclick="interact('${s.id}', true)" class="bg-white text-black py-4 rounded-2xl hover:bg-zinc-200 transition-all flex flex-col items-center gap-1"><i data-lucide="check" class="w-5 h-5"></i><span class="text-[10px] uppercase tracking-widest font-bold">I did this</span></button>
            </div>
        </div>`;
}

function renderPulse(c) {
    c.innerHTML = `<div class="text-center animate-fade-in"><div class="relative w-24 h-24 mx-auto mb-8"><div class="absolute inset-0 bg-accent/20 rounded-full animate-ping"></div><div class="relative w-full h-full glass rounded-full flex items-center justify-center"><i data-lucide="zap" class="w-8 h-8 text-accent"></i></div></div><h2 class="text-xl outfit mb-2">The Pulse</h2><p class="text-zinc-500 text-sm">Extracting DNA...</p></div>`;
}

function renderBuried(c) {
    const buried = state.items.filter(i => i.soil.status === 'buried');
    c.innerHTML = `
        <div class="w-full flex flex-col h-full animate-fade-in">
            <div class="flex justify-between items-center mb-8">
                <button onclick="setView('void')" class="text-zinc-500 hover:text-white transition-colors"><i data-lucide="arrow-left" class="w-5 h-5"></i></button>
                <h2 class="text-lg outfit font-medium text-zinc-400">Buried Knowledge</h2>
                <div class="w-5"></div>
            </div>
            <div class="flex-1 overflow-y-auto space-y-4 pb-12">
                ${buried.length === 0 ? `<div class="text-center py-20 text-zinc-600"><p>The soil is empty.</p></div>` : buried.map(i => `
                    <div class="glass p-6 rounded-2xl relative group">
                        <div class="flex justify-between items-start mb-3">
                            <span class="text-[10px] uppercase tracking-widest text-zinc-600">Buried Seed</span>
                            <button onclick="unbury('${i.id}')" class="text-accent text-[10px] uppercase tracking-widest font-bold opacity-0 group-hover:opacity-100 transition-opacity">Resurrect</button>
                        </div>
                        <h3 class="text-sm font-medium text-zinc-300 mb-2">${i.seed ? i.seed.essence : i.raw.substring(0, 50) + '...'}</h3>
                        <p class="text-xs text-zinc-500 italic">"${i.raw.substring(0, 100)}${i.raw.length > 100 ? '...' : ''}"</p>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function unbury(id) {
    const i = state.items.find(x => x.id === id);
    if (i) { i.soil.status = 'active'; i.soil.strength = 0.5; i.soil.lastSeen = Date.now(); saveData(); render(); showToast('Seed resurrected'); }
}

function setView(v) { state.currentView = v; document.getElementById('settings-modal').classList.add('hidden'); render(); }
function captureSeed() {
    const i = document.getElementById('capture-input');
    const t = i.value.trim();
    if (!t) return;
    state.items.unshift({ id: Math.random().toString(36).substr(2, 9), raw: t, seed: null, soil: { strength: 1.0, lastSeen: Date.now(), nextReview: Date.now() + 86400000, status: 'active' } });
    saveData(); i.value = ''; showToast('Seed captured');
}

async function processPulse() {
    if (!state.settings.apiKey) { showToast('API Key required'); toggleSettings(); return; }
    const un = state.items.filter(i => !i.seed);
    if (un.length === 0) { showToast('No new seeds'); return; }
    setView('pulse');
    for (const item of un) {
        try {
            const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.settings.apiKey}`, 'HTTP-Referer': 'https://seed-soil.app', 'X-Title': 'Seed & Soil' },
                body: JSON.stringify({
                    model: 'google/gemini-2.0-flash-exp:free',
                    messages: [{ role: 'system', content: 'Act as a Socratic Mentor. Extract DNA from text. Return JSON: { "essence": "1 sentence", "nuggets": ["insight1", "insight2"], "action": "1 challenge" }' }, { role: 'user', content: item.raw }],
                    response_format: { type: 'json_object' }
                })
            });
            const d = await r.json();
            item.seed = JSON.parse(d.choices[0].message.content);
            saveData();
        } catch (e) { console.error(e); }
    }
    setView('void'); showToast('Pulse complete');
}

function interact(id, ok) {
    const i = state.items.find(x => x.id === id);
    if (ok) { i.soil.strength = Math.min(1, i.soil.strength + 0.2); i.soil.lastSeen = Date.now(); }
    else i.soil.status = 'buried';
    saveData(); render();
}

function toggleSettings() { document.getElementById('settings-modal').classList.toggle('hidden'); }
function showToast(m) {
    const t = document.getElementById('toast'); t.innerText = m;
    t.classList.remove('opacity-0', 'pointer-events-none'); t.classList.add('opacity-100');
    setTimeout(() => { t.classList.add('opacity-0', 'pointer-events-none'); t.classList.remove('opacity-100'); }, 3000);
}
function exportData() {
    const b = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = 'seed-soil-export.json'; a.click();
}
function clearAllData() { if (confirm('Delete all seeds?')) { state.items = []; saveData(); render(); toggleSettings(); } }

init();
