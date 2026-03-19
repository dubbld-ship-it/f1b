const db = supabase.createClient('https://aqsaztcdkcbnhstjseam.supabase.co', 'sb_publishable_Q7mqIq2YrT3vscykJmLvOA_AliGTKCe');

async function recoverBoard() {
    const nameInput = document.getElementById('recover-name');
    const recoverBtn = document.querySelector('.btn-recover');
    const name = nameInput.value.trim();

    if (!name) return alert("Please enter your Driver Name!");

    // UI Feedback
    recoverBtn.innerText = "Searching Grid...";
    recoverBtn.disabled = true;

    // Search for the unique board
    const { data, error } = await db.from('player_boards')
        .select('id')
        .eq('player_name', name)
        .maybeSingle(); // We use maybeSingle because names are now unique

    if (error) {
        console.error(error);
        alert("Encountered issue with data lookup, possibly more than 1 entries under this name");
        recoverBtn.innerText = "Find My Board";
        recoverBtn.disabled = false;
    } else if (data) {
        localStorage.setItem('f1_bingo_id', data.id);
        window.location.href = 'player.html';
    } else {
        alert("Driver not found in the standings. Check your spelling or start a new board!");
        recoverBtn.innerText = "Find My Board";
        recoverBtn.disabled = false;
    }
}

async function loadStartingGrid() {
    const listEl = document.getElementById('driver-list');
    
    const { data, error } = await db
        .from('player_boards')
        .select('player_name, id')
        .order('created_at', { ascending: false });

    if (error) {
        listEl.innerText = "Error loading grid.";
        return;
    }

    if (data.length === 0) {
        listEl.innerText = "No drivers registered yet.";
        return;
    }

    listEl.innerHTML = ""; // Clear loader
    data.forEach(player => {
        const div = document.createElement('div');
        div.style.padding = "8px 5px";
        div.style.borderBottom = "1px solid #333";
        div.style.display = "flex";
        div.style.justifyContent = "space-between";
        div.style.alignItems = "center";

        // Create a link so people can view the board
        div.innerHTML = `
            <span style="color: #eee;">${player.player_name}</span>
            <button onclick="viewBoard('${player.id}')" style="background: transparent; border: 1px solid var(--f1-red); color: var(--f1-red); font-size: 0.7rem; padding: 2px 8px; border-radius: 3px; cursor: pointer;">
                VIEW BOARD
            </button>
        `;
        listEl.appendChild(div);
    });
}

function viewBoard(id) {
    localStorage.setItem('f1_bingo_id', id);
    window.location.href = 'player.html';
}

loadStartingGrid();