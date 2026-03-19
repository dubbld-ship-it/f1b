// --- DATABASE CONFIG ---
const db = supabase.createClient('https://aqsaztcdkcbnhstjseam.supabase.co', 'sb_publishable_Q7mqIq2YrT3vscykJmLvOA_AliGTKCe');

let allData = [];

async function fetchData() {
    const { data, error } = await db
        .from('leaderboard')
        .select('*')
        .order('race_round', { ascending: true });
    
    if (error) {
        console.error("Fetch error:", error);
        return;
    }
    allData = data || [];
    
    renderSeasonStandings();
    populateRaceSelector();
}

function renderSeasonStandings() {
    const tbody = document.getElementById('season-body');
    tbody.innerHTML = '';
    
    const totals = new Map();
    allData.forEach(row => {
        const key = row.player_name; // Or player_id
        if (!totals.has(key)) {
            totals.set(key, { name: key, pts: 0, races: 0, wins: 0, podiums: 0, bingos: 0 });
        }
        const t = totals.get(key);
        t.pts += row.score;
        t.races += 1;
        t.bingos += (row.bingo_count || 0);
        if (row.position === 1) t.wins += 1;
        if (row.position <= 3) t.podiums += 1;
    });

    const sorted = [...totals.values()].sort((a,b) => b.pts - a.pts || b.wins - a.wins);

    sorted.forEach((d, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="pos">${i+1}</td>
            <td class="driver-name">${d.name}</td>
            <td>${d.races}</td>
            <td style="color:var(--text-gold)">${d.wins}</td>
            <td>${d.podiums}</td>
            <td style="color:var(--bingo-blue)">${d.bingos}</td>
            <td class="pts">${d.pts}</td>
        `;
        tbody.appendChild(tr);
    });
    document.getElementById('season-meta').innerText = `Aggregated from ${new Set(allData.map(r => r.race_name)).size} races.`;
}

function populateRaceSelector() {
    const selector = document.getElementById('race-selector');
    const races = [...new Set(allData.map(r => r.race_name))];
    selector.innerHTML = races.map(r => `<option value="${r}">${r}</option>`).join('');
    renderRaceResults();
}

function renderRaceResults() {
    const selectedRace = document.getElementById('race-selector').value;
    const tbody = document.getElementById('race-body');
    tbody.innerHTML = '';

    const filtered = allData.filter(r => r.race_name === selectedRace)
                            .sort((a,b) => (a.position || 99) - (b.position || 99));

    filtered.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="pos">${row.position}</td>
            <td class="driver-name">${row.player_name}</td>
            <td>${row.events_hit}</td>
            <td style="color:var(--bingo-blue)">${row.bingo_count}</td>
            <td>${row.square_pts}</td>
            <td style="color:var(--text-gold)">+${row.bingo_bonus}</td>
            <td class="pts">${row.score}</td>
        `;
        tbody.appendChild(tr);
    });
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn, .view').forEach(el => el.classList.remove('active'));
    document.getElementById(tab + '-view').classList.add('active');
    event.target.classList.add('active');
}

// REALTIME: Listen for when Host ends a race
db.channel('leaderboard-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, fetchData)
    .subscribe();

fetchData();