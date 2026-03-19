const db = supabase.createClient('https://aqsaztcdkcbnhstjseam.supabase.co', 'sb_publishable_Q7mqIq2YrT3vscykJmLvOA_AliGTKCe');

const rarityColors = {
    1: "#ffffff", // Common
    2: "#3c7a3e", // Uncommon
    3: "#19629e", // Rare
    4: "#9c27b0", // Epic
    5: "#910C0C"  // Chaos
};

let liveEvents = new Set();
let myBoardData = {
    id: localStorage.getItem('f1_bingo_id'), 
    playerName: '',
    layout: [],
    marks: []
};
let isEditing = false;
let selectedCellIndex = null;
let fullEventPool = [];
let winOverlayDismissed = false;
let leaderboardRows = [];
let leaderboardByRace = new Map();
let activeLeaderboardTab = 'season';

const WINNING_LINES = [
    [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24], // Rows
    [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24], // Cols
    [0,6,12,18,24], [4,8,12,16,20] // Diagonals
];

function updateRaceNameDisplay(raceName) {
    const raceEl = document.getElementById('race-name');
    const clean = (raceName || '').trim();
    raceEl.innerText = clean ? `Race: ${clean}` : 'Race: Not selected';
}

async function loadSelectedRaceName() {
    const { data, error } = await db
        .from('app_config')
        .select('value')
        .eq('key', 'selected_race_name')
        .maybeSingle();

    if (error) {
        console.error('Could not load selected race name:', error);
        updateRaceNameDisplay('');
        return;
    }

    updateRaceNameDisplay(data?.value || '');
}

async function init() {
    await loadSelectedRaceName();

    // 1. Fetch points/pool FIRST so renderBoard always has data
    const { data: pool } = await db.from('f1_events_pool').select('Event, points');
    fullEventPool = pool || [];

    // 2. Get initial "Happened" state
    const { data: live } = await db.from('live_race_state').select('event_text').eq('is_happened', true);
    live?.forEach(l => liveEvents.add(l.event_text));
    
    setupListener();

    if (myBoardData.id && myBoardData.id !== "null") {
        loadExistingBoard();
    } else {
        showSetupScreen(); 
    }
}

async function loadExistingBoard() {
    const { data } = await db.from('player_boards').select('*').eq('id', myBoardData.id).maybeSingle();
    if (data) {
        myBoardData.playerName = data.player_name;
        myBoardData.layout = data.layout;
        myBoardData.marks = data.marks || [];
        isEditing = false;
        document.getElementById('status').innerText = `Driver: ${data.player_name}`;
        renderBoard();
    } else {
        localStorage.removeItem('f1_bingo_id');
        showSetupScreen();
    }
}

async function showSetupScreen() {
    const name = prompt("Enter your Driver Name:");
    if (!name) return;
    myBoardData.playerName = name;

    // Fetch pool (ensure 'points' is lowercase to match your DB)
    const { data: pool } = await db.from('f1_events_pool').select('Event, points');
    if (!pool) { alert("Error connecting to Race Control."); return; }
    
    fullEventPool = pool;

    // Shuffle and pick 24
    let shuffled = [...fullEventPool].sort(() => 0.5 - Math.random()).slice(0, 24);

    // Convert objects to just the Event strings FIRST
    let layoutStrings = shuffled.map(x => x.Event);
    
    // NOW insert the Free Space string at index 12 (the dead center)
    layoutStrings.splice(12, 0, "FREE SPACE");

    myBoardData.layout = layoutStrings;

    isEditing = true;
    document.getElementById('setup-controls').style.display = 'block';
    document.getElementById('status').innerText = "Drafting Your Board...";
    renderBoard();
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = "";
    
    // 1. Initialize counters
    let squarePoints = 0;
    let hitsCount = 0;
    let bingoCount = 0;
    let bonusPoints = 0;

    myBoardData.layout.forEach((text, index) => {
        const cell = document.createElement('div');
        cell.className = "cell";
        
        const eventData = fullEventPool.find(e => e.Event === text);
        const pts = eventData ? (eventData.points || 1) : 0; 
        const color = rarityColors[pts] || "#ffffff";

        if (text === "FREE SPACE") {
            cell.classList.add('free-space');
        } else {
            cell.style.color = color;
            if (pts >= 4) cell.style.textShadow = `0 0 5px ${color}66`;
        }

        // Logic for "Hit" squares
        if (liveEvents.has(text)) {
            cell.classList.add('live-happened');
            cell.style.color = color;
            squarePoints += pts; // Add base square value
            hitsCount++;        // Increment hit counter
        } else {
            cell.classList.remove('live-happened');
            cell.style.color = (text === "FREE SPACE") ? "white" : color;
        }
        
        if (myBoardData.marks.includes(index)) cell.classList.add('marked');
        
        cell.innerText = text;
        cell.onclick = () => {
            if (text === "FREE SPACE") return;
            isEditing ? openSwapModal(index) : toggleMark(index);
        };
        boardEl.appendChild(cell);
    });

    // 2. Calculate Bingo Bonuses (+5 per line)
    const completedLines = WINNING_LINES.filter(line => {
        return line.every(index => {
            const cellText = myBoardData.layout[index];
            return cellText === "FREE SPACE" || liveEvents.has(cellText);
        });
    });

    bingoCount = completedLines.length;
    bonusPoints = bingoCount * 5;
    const liveTotal = squarePoints + bonusPoints;

    // 3. Update the UI Elements
    document.getElementById('stat-total-pts').innerText = liveTotal;
    document.getElementById('stat-hits').innerText = hitsCount;
    document.getElementById('stat-bingos').innerText = bingoCount;
    document.getElementById('stat-sq-pts').innerText = squarePoints;
    document.getElementById('stat-bonus-pts').innerText = bonusPoints;

    // Update Status Bar
    const statusEl = document.getElementById('status');
    if (isEditing) {
        const potential = myBoardData.layout.reduce((acc, txt) => {
            const d = fullEventPool.find(e => e.Event === txt);
            return acc + (d ? (d.points || 1) : 0);
        }, 0);
        statusEl.innerText = `Drafting Board... (Potential: ${potential} pts)`;
    } else {
        statusEl.innerHTML = `Driver: <span style="color:gold;">${myBoardData.playerName}</span>`;
    }

    checkWinCondition();
}

function toggleMark(index) {
    if (myBoardData.marks.includes(index)) {
        myBoardData.marks = myBoardData.marks.filter(i => i !== index);
    } else {
        myBoardData.marks.push(index);
    }
    renderBoard();
    if (myBoardData.id) db.from('player_boards').update({ marks: myBoardData.marks }).eq('id', myBoardData.id);
}

function checkWinCondition() {
    if (isEditing || winOverlayDismissed) return;

    const hasBingo = WINNING_LINES.some(line => {
        return line.every(index => {
            const cellText = myBoardData.layout[index];
            // Win is valid if square is FREE SPACE or marked GOLD by Host
            return cellText === "FREE SPACE" || liveEvents.has(cellText);
        });
    });

    if (hasBingo) {
        document.getElementById('win-message').innerText = `${myBoardData.playerName}, you've got Bingo!`;
        document.getElementById('win-overlay').style.display = 'flex';
    }
}

function dismissWinOverlay() {
    winOverlayDismissed = true;
    document.getElementById('win-overlay').style.display = 'none';
}

// --- Setup/Swap Logic ---
function openSwapModal(index) {
    if (myBoardData.layout[index] === "FREE SPACE") return;
    selectedCellIndex = index;
    const picker = document.getElementById('event-picker');
    picker.innerHTML = "";
    
    fullEventPool.forEach(ev => {
        if (!myBoardData.layout.includes(ev.Event)) {
            let opt = document.createElement('option');
            opt.value = ev.Event;
            opt.innerHTML = `${ev.Event} (${ev.points || 1} pts)`;
            // Set the color in the dropdown
            opt.style.color = rarityColors[ev.points || 1];
            picker.appendChild(opt);
        }
    });
    document.getElementById('swap-modal').style.display = 'flex';
}

function applySwap() {
    myBoardData.layout[selectedCellIndex] = document.getElementById('event-picker').value;
    closeModal();
    renderBoard();
}

function closeModal() {
    document.getElementById('swap-modal').style.display = 'none';
}

function dismissLeaderboardOnBackdrop(event) {
    if (event.target.id === 'leaderboard-overlay') {
        closeLeaderboardModal();
    }
}

function closeLeaderboardModal() {
    document.getElementById('leaderboard-overlay').style.display = 'none';
}

function setLeaderboardLoading(isLoading, message) {
    const loadingEl = document.getElementById('leaderboard-loading');
    loadingEl.style.display = isLoading ? 'block' : 'none';
    if (message) loadingEl.innerText = message;
}

function isCurrentPlayerRow(playerId, playerName) {
    const byId = myBoardData.id && playerId && String(myBoardData.id) === String(playerId);
    const byName = myBoardData.playerName && playerName
        && myBoardData.playerName.toLowerCase() === String(playerName).toLowerCase();
    return !!(byId || byName);
}

function numericOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function sortRaceBuckets(a, b) {
    const roundA = numericOrNull(a.race_round);
    const roundB = numericOrNull(b.race_round);
    if (roundA !== null && roundB !== null && roundA !== roundB) return roundA - roundB;
    if (roundA !== null && roundB === null) return -1;
    if (roundA === null && roundB !== null) return 1;
    return a.race_name.localeCompare(b.race_name);
}

function rebuildLeaderboardBuckets() {
    leaderboardByRace = new Map();

    leaderboardRows.forEach(row => {
        if (!leaderboardByRace.has(row.race_name)) {
            leaderboardByRace.set(row.race_name, {
                race_name: row.race_name,
                race_round: row.race_round,
                rows: []
            });
        }
        const bucket = leaderboardByRace.get(row.race_name);
        if (bucket.race_round == null && row.race_round != null) {
            bucket.race_round = row.race_round;
        }
        bucket.rows.push(row);
    });

    leaderboardByRace.forEach(bucket => {
        bucket.rows.sort((a, b) => {
            const posA = numericOrNull(a.position) ?? 9999;
            const posB = numericOrNull(b.position) ?? 9999;
            if (posA !== posB) return posA - posB;
            if (b.score !== a.score) return b.score - a.score;
            if (b.events_hit !== a.events_hit) return b.events_hit - a.events_hit;
            return a.player_name.localeCompare(b.player_name);
        });
    });
}

function renderSeasonLeaderboard() {
    const tbody = document.getElementById('leaderboard-season-body');
    const meta = document.getElementById('leaderboard-season-meta');
    tbody.innerHTML = '';

    if (!leaderboardRows.length) {
        meta.innerText = 'Season standings will appear after at least one race is ended by host.';
        return;
    }

    const totals = new Map();
    leaderboardRows.forEach(row => {
        const key = row.player_id || row.player_name.toLowerCase();
        if (!totals.has(key)) {
            totals.set(key, {
                player_id: row.player_id,
                player_name: row.player_name,
                total_points: 0,
                total_bingos: 0,
                races: 0,
                wins: 0,
                podiums: 0
            });
        }

        const entry = totals.get(key);
        entry.total_points += row.score;
        entry.total_bingos += (row.bingo_count || 0);
        entry.races += 1;
        if (row.position === 1) entry.wins += 1;
        if (row.position && row.position <= 3) entry.podiums += 1;
    });

    const standings = Array.from(totals.values()).sort((a, b) => {
        if (b.total_points !== a.total_points) return b.total_points - a.total_points;
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.podiums !== a.podiums) return b.podiums - a.podiums;
        return a.player_name.localeCompare(b.player_name);
    });

    standings.forEach((row, index) => {
        const tr = document.createElement('tr');
        if (isCurrentPlayerRow(row.player_id, row.player_name)) tr.classList.add('me');
        tr.innerHTML = `
            <td>${index + 1}</td>
            <td>${row.player_name}</td>
            <td>${row.races}</td>
            <td>${row.wins}</td>
            <td>${row.podiums}</td>
            <td>${row.total_bingos}</td>
            <td>${row.total_points}</td>
        `;
        tbody.appendChild(tr);
    });

    meta.innerText = `${standings.length} driver(s), ${leaderboardByRace.size} race(s) completed.`;
}

function populateRaceFilter() {
    const select = document.getElementById('leaderboard-race-filter');
    const prev = select.value;
    select.innerHTML = '';

    const buckets = Array.from(leaderboardByRace.values()).sort(sortRaceBuckets);
    buckets.forEach(bucket => {
        const option = document.createElement('option');
        option.value = bucket.race_name;
        option.textContent = bucket.race_round ? `Round ${bucket.race_round}: ${bucket.race_name}` : bucket.race_name;
        select.appendChild(option);
    });

    if (!buckets.length) {
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = 'No race results yet';
        select.appendChild(emptyOption);
        select.value = '';
        return;
    }

    const stillExists = buckets.some(bucket => bucket.race_name === prev);
    select.value = stillExists ? prev : buckets[0].race_name;
}

function renderRaceLeaderboard() {
    const select = document.getElementById('leaderboard-race-filter');
    const tbody = document.getElementById('leaderboard-race-body');
    const meta = document.getElementById('leaderboard-race-meta');
    tbody.innerHTML = '';

    const raceName = select.value;
    if (!raceName || !leaderboardByRace.has(raceName)) {
        meta.innerText = 'Choose a race to see individual results.';
        return;
    }

    const bucket = leaderboardByRace.get(raceName);
    const rows = bucket.rows || [];
    rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        if (isCurrentPlayerRow(row.player_id, row.player_name)) tr.classList.add('me');

        tr.innerHTML = `
            <td>${row.position || (index + 1)}</td>
            <td style="font-weight:bold;">${row.player_name}</td>
            <td>${row.events_hit}</td>
            <td style="color:#00d2ff;">${row.bingo_count || 0}</td>
            <td>${row.square_pts || 0}</td>
            <td style="color:#ffc107;">+${row.bingo_bonus || 0}</td>
            <td style="font-weight:bold; color:var(--f1-red);">${row.score}</td>
        `;
        tbody.appendChild(tr);
    });

    const roundLabel = bucket.race_round ? `Round ${bucket.race_round}` : 'Race';
    meta.innerText = `${roundLabel}: ${bucket.race_name} (${rows.length} driver result(s)).`;
}

function switchLeaderboardTab(tab) {
    activeLeaderboardTab = tab === 'race' ? 'race' : 'season';

    const seasonTab = document.getElementById('leaderboard-tab-season');
    const raceTab = document.getElementById('leaderboard-tab-race');
    const seasonView = document.getElementById('leaderboard-season-view');
    const raceView = document.getElementById('leaderboard-race-view');

    seasonTab.classList.toggle('active', activeLeaderboardTab === 'season');
    raceTab.classList.toggle('active', activeLeaderboardTab === 'race');
    seasonView.classList.toggle('active', activeLeaderboardTab === 'season');
    raceView.classList.toggle('active', activeLeaderboardTab === 'race');
}

async function refreshLeaderboardData() {
    setLeaderboardLoading(true, 'Loading leaderboard...');

    const { data, error } = await db
        .from('leaderboard')
        .select('race_name, race_round, player_id, player_name, score, events_hit, bingo_count, square_pts, bingo_bonus, position, recorded_at');

    setLeaderboardLoading(false);

    if (error) {
        console.error('Failed to load leaderboard:', error);
        leaderboardRows = [];
        leaderboardByRace = new Map();
        document.getElementById('leaderboard-empty').style.display = 'block';
        document.getElementById('leaderboard-empty').innerText = 'Could not load leaderboard right now.';
        renderSeasonLeaderboard();
        populateRaceFilter();
        renderRaceLeaderboard();
        return;
    }

    leaderboardRows = (data || []).map(row => ({
        race_name: row.race_name || 'Unknown Race',
        race_round: numericOrNull(row.race_round),
        player_id: row.player_id ? String(row.player_id) : '',
        player_name: row.player_name || 'Unknown Driver',
        score: numericOrNull(row.score) ?? 0,
        events_hit: numericOrNull(row.events_hit) ?? 0,
        bingo_count: numericOrNull(row.bingo_count) ?? 0,
        square_pts: numericOrNull(row.square_pts) ?? 0,
        bingo_bonus: numericOrNull(row.bingo_bonus) ?? 0,
        position: numericOrNull(row.position),
        recorded_at: row.recorded_at || ''
    }));

    leaderboardRows.sort((a, b) => {
        const roundA = a.race_round ?? 9999;
        const roundB = b.race_round ?? 9999;
        if (roundA !== roundB) return roundA - roundB;
        if (a.race_name !== b.race_name) return a.race_name.localeCompare(b.race_name);
        const posA = a.position ?? 9999;
        const posB = b.position ?? 9999;
        if (posA !== posB) return posA - posB;
        return b.score - a.score;
    });

    rebuildLeaderboardBuckets();
    document.getElementById('leaderboard-empty').style.display = leaderboardRows.length ? 'none' : 'block';
    renderSeasonLeaderboard();
    populateRaceFilter();
    renderRaceLeaderboard();
}

async function openLeaderboardModal() {
    document.getElementById('leaderboard-overlay').style.display = 'flex';
    await refreshLeaderboardData();
    switchLeaderboardTab(activeLeaderboardTab);
}

async function finalizeBoard() {
    const name = myBoardData.playerName;

    // 1. Security Check: Does this name already exist in the DB?
    const { data: existing, error: checkError } = await db
        .from('player_boards')
        .select('id')
        .eq('player_name', name)
        .maybeSingle();

    if (existing) {
        alert("This Driver Name is already registered! Please refresh and choose a unique name (e.g., " + name + " #2).");
        return; // Stop the registration
    }

    if (checkError) {
        console.error("Database check failed:", checkError);
        return;
    }

    // 2. Proceed with registration if name is unique
    const { data, error } = await db.from('player_boards').insert({
        player_name: name,
        layout: myBoardData.layout,
        marks: []
    }).select().single();

    if (!error) {
        localStorage.setItem('f1_bingo_id', data.id);
        myBoardData.id = data.id;
        isEditing = false;
        document.getElementById('setup-controls').style.display = 'none';
        document.getElementById('status').innerHTML = `Driver Profile: <span style="color:gold;">${data.player_name}</span> (Locked)`;
        renderBoard();
    }
}

function setupListener() {
    db.channel('live-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_race_state' }, (payload) => {
            console.log("Update received from Race Control!");
            if (payload.new.is_happened) liveEvents.add(payload.new.event_text);
            else liveEvents.delete(payload.new.event_text);
            renderBoard(); // This will re-draw and trigger checkWinCondition()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_config' }, (payload) => {
            const key = payload?.new?.key || payload?.old?.key;
            if (key !== 'selected_race_name') return;
            updateRaceNameDisplay(payload?.new?.value || '');
        }).subscribe();
}

init();