const db = supabase.createClient('https://aqsaztcdkcbnhstjseam.supabase.co', 'sb_publishable_Q7mqIq2YrT3vscykJmLvOA_AliGTKCe');
const CHAMPIONSHIP_YEAR = 2026;
const FALLBACK_RACES_2026 = [
    'Australian Grand Prix',
    'Chinese Grand Prix',
    'Japanese Grand Prix',
    'Bahrain Grand Prix',
    'Saudi Arabian Grand Prix',
    'Miami Grand Prix',
    'Canadian Grand Prix',
    'Monaco Grand Prix',
    'Barcelona-Catalunya Grand Prix',
    'Austrian Grand Prix',
    'British Grand Prix',
    'Belgian Grand Prix',
    'Hungarian Grand Prix',
    'Dutch Grand Prix',
    'Italian Grand Prix',
    'Spanish Grand Prix',
    'Azerbaijan Grand Prix',
    'Singapore Grand Prix',
    'United States Grand Prix',
    'Mexico City Grand Prix',
    'Sao Paulo Grand Prix',
    'Las Vegas Grand Prix',
    'Qatar Grand Prix',
    'Abu Dhabi Grand Prix'
];

const rarityColors = {
    1: "#ffffff", // Common (White)
    2: "#3c7a3e", // Uncommon (Green)
    3: "#19629e", // Rare (Blue)
    4: "#9c27b0", // Epic (Purple)
    5: "#910C0C"  // Chaos (Dark Red)
};

async function login() {
    const pass = document.getElementById('pass').value;
    const { data } = await db.from('app_config').select('value').eq('key', 'host_password').single();
    if (data && pass === data.value) {
        document.getElementById('auth').style.display = 'none';
        document.getElementById('controls').style.display = 'block';
        document.getElementById('add-event-trigger').style.display = 'block';
        await syncAppConfig();
        await load();
    } else { alert("Denied."); }
}

function updateHostTitle(raceName) {
    const title = document.getElementById('host-title');
    if (!raceName) {
        title.innerText = `F1 Bingo ${CHAMPIONSHIP_YEAR} - Race Control`;
        return;
    }
    title.innerText = `${raceName} - Race Control`;
}

function extractRaceNamesFromCalendar(calendarText, year) {
    const raceNames = [];
    const seen = new Set();
    const linePattern = new RegExp(`FORMULA 1\\s+(.+?)\\s+${year}`, 'i');

    calendarText.split('\n').forEach(line => {
        if (!line.includes('FORMULA 1') || !line.includes(String(year))) return;
        const match = line.match(linePattern);
        if (!match) return;

        const candidate = match[1].replace(/\s+/g, ' ').trim();
        const isRaceName = /(GRAND PRIX|GRAN PREMIO|GRANDE PR)/i.test(candidate);
        const isTesting = /TESTING/i.test(candidate);
        if (!isRaceName || isTesting) return;
        if (seen.has(candidate)) return;

        seen.add(candidate);
        raceNames.push(candidate);
    });

    return raceNames;
}

async function fetchRaceNamesFromF1(year) {
    const sources = [
        `https://r.jina.ai/http://www.formula1.com/en/racing/${year}`,
        `https://r.jina.ai/http://www.formula1.com/en/racing/${year}.html`
    ];

    for (const source of sources) {
        try {
            const res = await fetch(source, { cache: 'no-store' });
            if (!res.ok) continue;
            const text = await res.text();
            const races = extractRaceNamesFromCalendar(text, year);
            if (races.length >= 20) return races;
        } catch (err) {
            console.warn(`Could not fetch race list from ${source}`, err);
        }
    }

    return FALLBACK_RACES_2026;
}

async function syncAppConfig() {
    const select = document.getElementById('race-select');
    const roundInput = document.getElementById('race-round-input');

    // 1. Parallel fetch: F1 Schedule + DB Config
    const [races, configRes] = await Promise.all([
        fetchRaceNamesFromF1(CHAMPIONSHIP_YEAR),
        db.from('app_config')
        .select('key, value')
        .in('key', ['selected_race_name', 'selected_race_round'])
    ]);

    // 2. Populate Race Dropdown
    select.innerHTML = '<option value="">Select race</option>';
    races.forEach(race => {
        const option = document.createElement('option');
        option.value = race;
        option.textContent = race;
        select.appendChild(option);
    });

    const configData = configRes.data || [];

    // 3. Extract Values (Mapping everything to the key/value schema)
    const savedRaceRow = configData.find(r => r.key === 'selected_race_name');
    const savedRoundRow = configData.find(r => r.key === 'selected_race_round');

    const savedRace = savedRaceRow?.value || '';
    const savedRound = savedRoundRow?.value || '1';

    // 4. Update UI Inputs
    // Handle custom race names not in the official F1 list
    if (savedRace && !races.includes(savedRace)) {
        const customOption = document.createElement('option');
        customOption.value = savedRace;
        customOption.textContent = savedRace;
        select.appendChild(customOption);
    }

    select.value = savedRace;
    roundInput.value = savedRound;
    
    select.disabled = false;
    updateHostTitle(savedRace);

    console.log(`Config Synced: ${savedRace} (Round ${savedRound})`);
}

async function saveSelectedRace() {
    const raceName = getSelectedRaceName();
    updateHostTitle(raceName);
    if (!raceName) return;

    const { data: updatedRows, error: updateErr } = await db
        .from('app_config')
        .update({ value: raceName })
        .eq('key', 'selected_race_name')
        .select('key');

    if (updateErr) {
        console.error('Failed to save race selection.', updateErr);
        alert('Could not save selected race.');
        return;
    }

    if (!updatedRows || updatedRows.length === 0) {
        const { error: insertErr } = await db
            .from('app_config')
            .insert([{ key: 'selected_race_name', value: raceName }]);
        if (insertErr) {
            console.error('Failed to insert race selection.', insertErr);
            alert('Could not save selected race.');
        }
    }

}
async function saveSelectedRaceRound() {
    const roundInput = document.getElementById('race-round-input');
    const newRound = roundInput.value;

    roundInput.style.opacity = "0.5";
    roundInput.disabled = true;

    try {
        // .upsert() is better here—it handles both new and existing keys.
        // We must include the 'key' in the object so Supabase knows what to match on.
        const { data, error, count } = await db
            .from('app_config')
            .upsert({ key: 'selected_race_round', value: String(newRound) }, { onConflict: 'key' })
            .select(); 

        if (error) throw error;
        
        console.log(`Race Round sync successful. Value in DB is now: ${newRound}`);
    } catch (err) {
        console.error("Failed to update race round:", err.message);
        alert("System Error: Could not save the race round.");
    } finally {
        roundInput.style.opacity = "1";
        roundInput.disabled = false;
    }
}

function getSelectedRaceName() {
    const select = document.getElementById('race-select');
    return (select?.value || '').trim();
}

function getSelectedRaceRound() {
    const roundInput = document.getElementById('race-round-input');
    
    // Simply return the value from the input field
    // We use parseInt to ensure it's a number, defaulting to 1 if empty
    return roundInput ? parseInt(roundInput.value, 10) || 1 : 1;
}

async function load() {
    const { data: pool, error: poolErr } = await db.from('f1_events_pool').select('*');
    const { data: live } = await db.from('live_race_state').select('*');

    if (poolErr) {
        console.error("Fetch error:", poolErr);
        return;
    }
    const list = document.getElementById('list');
    list.innerHTML = "";
    pool.sort((a, b) => a.Event.localeCompare(b.Event));

    pool.forEach(ev => {
        // debugging
        console.log("Loading Event:", ev.Event, "with ID:", ev.id);

        const active = live.find(l => l.event_text === ev.Event)?.is_happened;
        const pts = ev.points || 1;
        const badgeColor = rarityColors[pts] || "#ffffff";

        const div = document.createElement('div');
        div.className = "event-row";
        div.setAttribute('data-event', ev.Event.toLowerCase());

        const span = document.createElement('span');
        span.style.display = "flex";
        span.style.justifyContent = "space-between";
        span.style.alignItems = "center";
        span.style.width = "60%"; // Slightly reduced to make room for more buttons

        span.innerHTML = `
            <span>${ev.Event}</span>
            <span style="color: ${badgeColor}; border: 1px solid ${badgeColor}44; font-size: 0.8rem; padding: 2px 8px; border-radius: 12px; font-weight: bold; background: ${badgeColor}11;">
                ${pts} PTS
            </span>
        `;

        

        // Action Buttons
        // edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-edit';
        editBtn.innerText = '✎';
        editBtn.style.marginLeft = "8px";
        editBtn.onclick = () => openEditModal(ev.id, ev.Event, pts);

        // delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete';
        delBtn.innerText = '×';
        delBtn.style.marginLeft = "8px";
        delBtn.onclick = () => deleteEvent(ev.id, ev.Event);

        // MARK/HAPPENED Button
        const btn = document.createElement('button');
        btn.className = active ? 'btn-on' : 'btn-mark';
        btn.innerText = active ? 'HAPPENED' : 'MARK';
        btn.style.marginLeft = "8px"; // Gap between Delete and Mark
        btn.addEventListener('click', () => toggle(ev.Event, !!active, pts));

        // Append everything in order
        div.appendChild(span);
        div.appendChild(editBtn);
        div.appendChild(delBtn);
        div.appendChild(btn);
        list.appendChild(div);
    });

    filterEvents();
}

// --- NEW ACTION LOGIC ---

function openEditModal(id, text, points) {
    const idInput = document.getElementById('edit-event-id');
    if (!idInput) {
        alert("CRITICAL ERROR: HTML element 'edit-event-id' is missing from the page.");
        return;
    }
    idInput.value = id;
    document.getElementById('edit-event-old-text').value = text;
    document.getElementById('edit-event-text').value = text;
    document.getElementById('edit-event-points').value = points;
    document.getElementById('edit-modal').style.display = 'flex';
}

async function saveEditEvent() {
    const id = document.getElementById('edit-event-id').value;
    const oldText = document.getElementById('edit-event-old-text').value;
    const newText = document.getElementById('edit-event-text').value.trim();
    const newPoints = parseInt(document.getElementById('edit-event-points').value);

    if (!newText || !id) return;

    // 1. Update the Pool by ID (Much safer!)
    const { error: err1 } = await db.from('f1_events_pool')
        .update({ Event: newText, points: newPoints })
        .eq('id', id);

    // 2. Update the Live State by the old text (since it might not share the same ID)
    const { error: err2 } = await db.from('live_race_state')
        .update({ event_text: newText, points: newPoints })
        .eq('event_text', oldText);

    if (!err1) {
        closeEditModal();
        await load();
    } else {
        console.error(err1);
        alert("Update failed. Check RLS or ID mapping.");
    }
}

function closeEditModal() {
    // Hide the modal
    document.getElementById('edit-modal').style.display = 'none';
    
    // Clear the hidden inputs to prevent any data carry-over
    document.getElementById('edit-event-id').value = "";
    document.getElementById('edit-event-old-text').value = "";
    document.getElementById('edit-event-text').value = "";
}

async function deleteEvent(id, text) {
    if (!confirm(`Delete "${text}"?`)) return;

    // Delete from pool by ID
    const { error: err1 } = await db.from('f1_events_pool').delete().eq('id', id);
    // Delete from live state by text
    const { error: err2 } = await db.from('live_race_state').delete().eq('event_text', text);

    if (!err1) {
        await load();
    } else {
        alert("Delete failed.");
    }
}

function filterEvents() {
    const query = document.getElementById('event-search').value.toLowerCase();
    const rows = document.querySelectorAll('.event-row');

    rows.forEach(row => {
        const text = row.getAttribute('data-event');
        if (text.includes(query)) {
            row.classList.remove('hidden');
        } else {
            row.classList.add('hidden');
        }
    });
}

async function toggle(text, status, pointsValue) {
    const { error } = await db.from('live_race_state').upsert({
        event_text: text,
        is_happened: !status,
        points: pointsValue
    });

    if (error) {
        console.error("Error toggling event:", error);
    } else {
        load();
    }
}

function openModal() { document.getElementById('add-modal').style.display = 'flex'; }
function closeModal() {
    document.getElementById('add-modal').style.display = 'none';
    document.getElementById('new-event-text').value = "";
}

async function saveNewEvent() {
    const text = document.getElementById('new-event-text').value.trim();
    const pointsVal = parseInt(document.getElementById('new-event-points').value);

    if (!text) return;

    const { error: poolErr } = await db.from('f1_events_pool')
        .insert([{ Event: text, points: pointsVal }]);

    const { error: liveErr } = await db.from('live_race_state')
        .insert([{ event_text: text, is_happened: false, points: pointsVal }]);

    if (!poolErr && !liveErr) {
        closeModal();
        load();
    } else {
        console.error("Pool Error:", poolErr, "Live Error:", liveErr);
        alert("Error adding event. Check console for details.");
    }
}

function buildLeaderboardRows(raceName, raceRound, boards, liveRows) {
    const happenedEvents = new Set();
    const pointsByEvent = new Map();

    (liveRows || []).forEach(row => {
        if (!row?.event_text) return;
        happenedEvents.add(row.event_text);
        const pts = Number(row.points);
        pointsByEvent.set(row.event_text, Number.isFinite(pts) && pts > 0 ? pts : 1);
    });

    const rows = (boards || []).map(board => {
        const layout = Array.isArray(board.layout) ? board.layout : [];
        let squarePoints = 0;
        let hits = 0;

        layout.forEach(eventText => {
            if (eventText === 'FREE SPACE') return;
            if (happenedEvents.has(eventText)) {
                squarePoints += pointsByEvent.get(eventText) || 1;
                hits += 1;
            }
        });

        const isHit = (idx) => (layout[idx] === 'FREE SPACE' || happenedEvents.has(layout[idx]));
        let bingoCount = 0;

        const lines = [
            [0,1,2,3,4], [5,6,7,8,9], [10,11,12,13,14], [15,16,17,18,19], [20,21,22,23,24], // Horizontals
            [0,5,10,15,20], [1,6,11,16,21], [2,7,12,17,22], [3,8,13,18,23], [4,9,14,19,24], // Verticals
            [0,6,12,18,24], [4,8,12,16,20] // Diagonals
        ];

        lines.forEach(line => {
            if (line.every(idx => isHit(idx))) bingoCount++;
        });

        const bonusPoints = bingoCount * 5;

        return {
            race_name: raceName,
            race_round: raceRound,
            player_id: String(board.id),
            player_name: board.player_name || 'Unknown Driver',
            score: squarePoints + bonusPoints,
            events_hit: hits,
            bingo_count: bingoCount,    // The "amount" of bingos
            bingo_bonus: bonusPoints,
            square_pts: squarePoints
        };
    });

    rows.sort((a, b) => b.score - a.score || b.events_hit - a.events_hit);
    return rows.map((row, idx) => ({ ...row, position: idx + 1 }));
}

async function endRace() {
    const raceName = getSelectedRaceName();
    const raceRound = getSelectedRaceRound(); // Captured from your UI input/select
    
    if (!raceName) {
        alert('Select a race before ending it.');
        return;
    }

    const ok = confirm(`OFFICIAL RACE CONTROL: End "${raceName}" (Round ${raceRound || 'N/A'})?\n\nThis will snapshot all player boards and finalize the leaderboard.`);
    if (!ok) return;

    const endRaceBtn = document.getElementById('end-race-btn');
    endRaceBtn.disabled = true;
    endRaceBtn.innerText = 'PROCESSING...';

    try {
        // 1. GATHER DATA
        const { data: liveRows, error: liveErr } = await db
            .from('live_race_state')
            .select('event_text, points')
            .eq('is_happened', true);

        if (liveErr) throw new Error(`Could not load race events: ${liveErr.message}`);

        const { data: boards, error: boardErr } = await db
            .from('player_boards')
            .select('id, player_name, layout');

        if (boardErr) throw new Error(`Could not load player boards: ${boardErr.message}`);

        // 2. CALCULATE SCORES
        // Passing raceRound here so buildLeaderboardRows can include it in the objects
        const leaderboardRows = buildLeaderboardRows(raceName, raceRound, boards || [], liveRows || []);

        // 3. PREPARE HISTORY PAYLOADS
        const eventHistoryEntries = (liveRows || []).map(row => ({
            race_name: raceName,
            race_round: raceRound, // Added for event history
            event_text: row.event_text,
            points: row.points
        }));

        const boardHistoryEntries = leaderboardRows.map(row => {
            const originalBoard = boards.find(b => String(b.id) === row.player_id);
            return {
                race_name: raceName,
                race_round: raceRound, // Added for board history
                player_id: row.player_id,
                player_name: row.player_name,
                layout: originalBoard ? originalBoard.layout : [],
                score: row.score,             
                bingo_count: row.bingo_count, 
                events_hit: row.events_hit    
            };
        });

        // 4. ARCHIVE TO HISTORY
        // We delete by race_name so if you "re-run" a race, it overwrites the old snapshot
        await db.from('race_event_history').delete().eq('race_name', raceName);
        await db.from('player_boards_history').delete().eq('race_name', raceName);

        if (eventHistoryEntries.length > 0) {
            const { error: eHistErr } = await db.from('race_event_history').insert(eventHistoryEntries);
            if (eHistErr) throw new Error(`Event history archival failed: ${eHistErr.message}`);
        }

        if (boardHistoryEntries.length > 0) {
            const { error: bHistErr } = await db.from('player_boards_history').insert(boardHistoryEntries);
            if (bHistErr) throw new Error(`Board history archival failed: ${bHistErr.message}`);
        }

        // 5. SAVE TO LEADERBOARD
        await db.from('leaderboard').delete().eq('race_name', raceName);

        if (leaderboardRows.length > 0) {
            const { error: insertErr } = await db.from('leaderboard').insert(leaderboardRows);
            if (insertErr) throw new Error(`Could not save leaderboard: ${insertErr.message}`);
        }

        // 6. REFRESH UI
        alert(`RACE CLOSED: ${raceName} (Round ${raceRound})\n\nHistory archived and leaderboard updated.`);

    } catch (err) {
        console.error('Race Control Error:', err);
        alert(`Failed to end race: ${err.message}`);
    } finally {
        endRaceBtn.disabled = false;
        endRaceBtn.innerText = 'END RACE';
    }
}