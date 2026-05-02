// ===== CONFIGURATION =====
const CONFIG = {
    ADMIN_PASSWORD: 'admin123', // Change this!
    GOOGLE_SHEETS_ID: '1dD85QXn6c46lK3Z6GClNY7j2bqe6ZCPkica2M6v0r2U', // Will be set from Google Apps Script
    SHEET_NAME: 'Items',
    SOUND_ENABLED: true,
    AUTO_CLEAR: true,
    API_URL: 'https://script.google.com/macros/s/AKfycbzLzSvDY4gckP3z3TjUipXXnKZph1Pab-3mFIbA2i3cSPsAV0oOn5IZHaH_xb1-KYML/exec'
};

// ===== STATE MANAGEMENT =====
const state = {
    items: [],
    history: [],
    selectedType: null,
    isAdminLoggedIn: false,
    correctCount: 0,
    wrongCount: 0,
    activityChart: null
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    loadItemsFromGoogleSheets();
    updateCurrentTime();
    loadHistoryFromLocalStorage();
    setupCharts();
    setInterval(updateCurrentTime, 1000);
    checkDailyReset();
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            handleNavigation(link);
        });
    });

    // Form Inputs
    document.getElementById('item-name').addEventListener('input', handleAutocomplete);
    document.getElementById('item-name').addEventListener('blur', () => {
        setTimeout(() => {
            document.getElementById('autocomplete-list').classList.remove('active');
        }, 200);
    });

    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', handleTypeSelection);
    });

    document.getElementById('submit-btn').addEventListener('click', handleSubmit);
    document.getElementById('reset-form-btn').addEventListener('click', resetForm);

    // History Search
    document.getElementById('history-search').addEventListener('input', handleHistorySearch);

    // Admin Login
    document.getElementById('admin-login-btn').addEventListener('click', handleAdminLogin);
    document.getElementById('admin-logout-btn').addEventListener('click', handleAdminLogout);

    // Admin Form
    document.getElementById('admin-add-btn').addEventListener('click', handleAddItem);

    // Admin Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', handleAdminTabSwitch);
    });

    // Settings
    document.getElementById('reset-daily-btn').addEventListener('click', handleResetDaily);
    document.getElementById('export-btn').addEventListener('click', handleExportReport);

    // Sound Toggle
    document.getElementById('sound-toggle').addEventListener('change', (e) => {
        CONFIG.SOUND_ENABLED = e.target.checked;
        localStorage.setItem('soundEnabled', e.target.checked);
    });

    // Auto Clear Toggle
    document.getElementById('auto-clear-toggle').addEventListener('change', (e) => {
        CONFIG.AUTO_CLEAR = e.target.checked;
        localStorage.setItem('autoClear', e.target.checked);
    });

    // Load settings from localStorage
    CONFIG.SOUND_ENABLED = localStorage.getItem('soundEnabled') !== 'false';
    CONFIG.AUTO_CLEAR = localStorage.getItem('autoClear') !== 'false';
    document.getElementById('sound-toggle').checked = CONFIG.SOUND_ENABLED;
    document.getElementById('auto-clear-toggle').checked = CONFIG.AUTO_CLEAR;
}

// ===== NAVIGATION =====
function handleNavigation(link) {
    const section = link.getAttribute('data-section');
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    // Update page title
    const titles = {
        'dashboard': 'Dashboard',
        'encode': 'Encode Items',
        'history': 'Submission History',
        'admin': 'Admin Panel'
    };
    document.getElementById('page-title').textContent = titles[section] || 'Dashboard';

    // Show section
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(section).classList.add('active');

    // Refresh data on section load
    if (section === 'history') {
        updateHistoryTable();
    } else if (section === 'dashboard') {
        updateDashboard();
    } else if (section === 'admin' && state.isAdminLoggedIn) {
        updateAdminPanel();
    }
}

// ===== AUTOCOMPLETE FUNCTIONALITY =====
function handleAutocomplete(e) {
    const value = e.target.value.toLowerCase();
    const list = document.getElementById('autocomplete-list');

    if (value.length === 0) {
        list.classList.remove('active');
        return;
    }

    const filtered = state.items.filter(item =>
        item.name.toLowerCase().includes(value)
    );

    if (filtered.length === 0) {
        list.classList.remove('active');
        return;
    }

    list.innerHTML = filtered.map(item =>
        `<li data-item="${item.name}">${item.name}</li>`
    ).join('');

    list.classList.add('active');

    list.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            document.getElementById('item-name').value = li.getAttribute('data-item');
            list.classList.remove('active');
        });
    });
}

// ===== TYPE SELECTION =====
function handleTypeSelection(e) {
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    e.target.classList.add('selected');
    state.selectedType = e.target.getAttribute('data-type');
}

// ===== FORM SUBMISSION =====
async function handleSubmit(e) {
    e.preventDefault();

    const itemName = document.getElementById('item-name').value.trim();
    const quantity = parseInt(document.getElementById('quantity').value);

    // Validation
    if (!itemName || !state.selectedType || !quantity) {
        alert('Please fill all fields!');
        return;
    }

    // Show loading
    showLoading();

    // Find item in database
    const matchedItem = state.items.find(item =>
        item.name.toLowerCase() === itemName.toLowerCase() && item.type === state.selectedType
    );

    setTimeout(async () => {
        hideLoading();

        let isCorrect = false;
        let details = '';

        if (matchedItem && matchedItem.correctQty === quantity) {
            isCorrect = true;
            details = `✓ Correct quantity: ${quantity}`;
            playSound('correct');
            state.correctCount++;
        } else if (matchedItem) {
            isCorrect = false;
            details = `✗ Expected: ${matchedItem.correctQty}, Got: ${quantity}`;
            playSound('wrong');
            state.wrongCount++;
        } else {
            isCorrect = false;
            details = `✗ Item not found in database`;
            playSound('wrong');
            state.wrongCount++;
        }

        // Show result
        showResult(isCorrect, itemName, state.selectedType, quantity, details);

        // Save to history
        const entry = {
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            itemName: itemName,
            type: state.selectedType,
            quantity: quantity,
            status: isCorrect ? 'CORRECT' : 'WRONG'
        };

        state.history.push(entry);
        saveHistoryToLocalStorage();

        // Update totals in Google Sheets
        if (matchedItem && isCorrect) {
            await updateTotalHoldStickers(itemName, state.selectedType, quantity);
        }

        // Update dashboard
        updateDashboard();

        // Auto clear form
        if (CONFIG.AUTO_CLEAR) {
            setTimeout(() => {
                resetForm();
            }, 2000);
        }
    }, 500);
}

// ===== RESULT DISPLAY =====
function showResult(isCorrect, itemName, type, quantity, details) {
    const container = document.getElementById('result-container');
    const content = document.getElementById('result-content');

    const icon = isCorrect ? '✅' : '❌';
    const text = isCorrect ? 'CORRECT' : 'WRONG';

    content.innerHTML = `
        <div class="result-icon">${icon}</div>
        <div class="result-text">${text}</div>
        <div class="result-details">
            <strong>${itemName}</strong> | ${type} | Qty: ${quantity}<br>
            ${details}
        </div>
    `;

    container.classList.remove('correct', 'wrong');
    container.classList.add(isCorrect ? 'correct' : 'wrong');
    container.style.display = 'block';
}

// ===== FORM RESET =====
function resetForm() {
    document.getElementById('item-name').value = '';
    document.getElementById('quantity').value = '';
    document.getElementById('result-container').style.display = 'none';
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('selected'));
    state.selectedType = null;
    document.getElementById('item-name').focus();
}

// ===== GOOGLE SHEETS INTEGRATION =====
async function loadItemsFromGoogleSheets() {
    try {
        // For now, using demo data. Replace with actual Google Sheets API call
        state.items = [
            { name: 'Coke', type: '1X', correctQty: 5, totalHold: 50 },
            { name: 'Coke', type: '2X', correctQty: 10, totalHold: 100 },
            { name: 'Sprite', type: '1X', correctQty: 4, totalHold: 40 },
            { name: 'Sprite', type: '2X', correctQty: 8, totalHold: 80 },
            { name: 'Fanta Orange', type: '1X', correctQty: 3, totalHold: 30 },
            { name: 'Fanta Orange', type: '2X', correctQty: 6, totalHold: 60 }
        ];
    } catch (error) {
        console.error('Error loading items:', error);
    }
}

async function updateTotalHoldStickers(itemName, type, quantity) {
    try {
        // Call Google Apps Script to update Google Sheets
        const data = {
            action: 'updateTotalHold',
            itemName: itemName,
            type: type,
            quantity: quantity
        };

        // await fetch(CONFIG.API_URL, {
        //     method: 'POST',
        //     body: JSON.stringify(data)
        // });

        // Update local state
        const item = state.items.find(i => i.name === itemName && i.type === type);
        if (item) {
            item.totalHold += quantity;
        }
    } catch (error) {
        console.error('Error updating totals:', error);
    }
}

// ===== HISTORY MANAGEMENT =====
function saveHistoryToLocalStorage() {
    localStorage.setItem('auditHistory', JSON.stringify(state.history));
}

function loadHistoryFromLocalStorage() {
    const saved = localStorage.getItem('auditHistory');
    if (saved) {
        state.history = JSON.parse(saved);
    }
}

function updateHistoryTable() {
    const tbody = document.getElementById('history-tbody');
    
    if (state.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280;">No entries yet</td></tr>';
        return;
    }

    tbody.innerHTML = state.history.map(entry => `
        <tr>
            <td><span class="time-badge">${entry.time}</span></td>
            <td><strong>${entry.itemName}</strong></td>
            <td>${entry.type}</td>
            <td>${entry.quantity}</td>
            <td><span class="status-badge ${entry.status.toLowerCase()}">${entry.status}</span></td>
        </tr>
    `).join('');
}

function handleHistorySearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const tbody = document.getElementById('history-tbody');

    const filtered = state.history.filter(entry =>
        entry.itemName.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #6b7280;">No results found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(entry => `
        <tr>
            <td><span class="time-badge">${entry.time}</span></td>
            <td><strong>${entry.itemName}</strong></td>
            <td>${entry.type}</td>
            <td>${entry.quantity}</td>
            <td><span class="status-badge ${entry.status.toLowerCase()}">${entry.status}</span></td>
        </tr>
    `).join('');
}

// ===== DASHBOARD =====
function updateDashboard() {
    const total = state.correctCount + state.wrongCount;
    const accuracy = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;

    document.getElementById('total-correct').textContent = state.correctCount;
    document.getElementById('total-wrong').textContent = state.wrongCount;
    document.getElementById('total-submitted').textContent = total;
    document.getElementById('accuracy-rate').textContent = accuracy + '%';

    // Update chart
    updateActivityChart();
}

function setupCharts() {
    const ctx = document.getElementById('activityChart').getContext('2d');
    
    state.activityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Correct', 'Wrong'],
            datasets: [{
                label: 'Submissions',
                data: [state.correctCount, state.wrongCount],
                backgroundColor: ['#10b981', '#ef4444'],
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function updateActivityChart() {
    if (state.activityChart) {
        state.activityChart.data.datasets[0].data = [state.correctCount, state.wrongCount];
        state.activityChart.update();
    }
}

// ===== ADMIN PANEL =====
function handleAdminLogin() {
    const password = document.getElementById('admin-password').value;

    if (password === CONFIG.ADMIN_PASSWORD) {
        state.isAdminLoggedIn = true;
        document.getElementById('admin-login').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'block';
        updateAdminPanel();
    } else {
        alert('Incorrect password!');
    }
}

function handleAdminLogout() {
    state.isAdminLoggedIn = false;
    document.getElementById('admin-login').style.display = 'block';
    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('admin-password').value = '';
}

function updateAdminPanel() {
    updateItemsTable();
    updateReportStats();
}

function updateItemsTable() {
    const tbody = document.getElementById('items-tbody');

    tbody.innerHTML = state.items.map((item, index) => `
        <tr>
            <td><strong>${item.name}</strong></td>
            <td>${item.type}</td>
            <td>${item.correctQty}</td>
            <td>${item.totalHold}</td>
            <td>
                <button class="edit-btn" onclick="editItem(${index})">Edit</button>
                <button class="delete-btn" onclick="deleteItem(${index})">Delete</button>
            </td>
        </tr>
    `).join('');
}

function handleAddItem() {
    const name = document.getElementById('admin-item-name').value.trim();
    const type = document.getElementById('admin-item-type').value;
    const qty = parseInt(document.getElementById('admin-item-qty').value);

    if (!name || !qty) {
        alert('Please fill all fields!');
        return;
    }

    state.items.push({
        name: name,
        type: type,
        correctQty: qty,
        totalHold: 0
    });

    // Clear form
    document.getElementById('admin-item-name').value = '';
    document.getElementById('admin-item-qty').value = '';

    updateItemsTable();
    alert('Item added successfully!');
}

function deleteItem(index) {
    if (confirm('Are you sure?')) {
        state.items.splice(index, 1);
        updateItemsTable();
    }
}

function editItem(index) {
    const item = state.items[index];
    const newQty = prompt(`Edit ${item.name} (${item.type}) quantity:`, item.correctQty);

    if (newQty !== null && newQty !== '') {
        item.correctQty = parseInt(newQty);
        updateItemsTable();
    }
}

function updateReportStats() {
    const total = state.correctCount + state.wrongCount;
    const accuracy = total > 0 ? Math.round((state.correctCount / total) * 100) : 0;

    document.getElementById('report-correct').textContent = state.correctCount;
    document.getElementById('report-wrong').textContent = state.wrongCount;
    document.getElementById('report-submitted').textContent = total;
    document.getElementById('report-accuracy').textContent = accuracy + '%';
}

function handleAdminTabSwitch(e) {
    const tab = e.target.getAttribute('data-tab');

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    e.target.classList.add('active');

    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tab + '-tab').classList.add('active');
}

function handleResetDaily() {
    if (confirm('Reset all daily entries? (Total Hold Stickers will be preserved)')) {
        state.history = [];
        state.correctCount = 0;
        state.wrongCount = 0;
        saveHistoryToLocalStorage();
        updateDashboard();
        updateReportStats();
        alert('Daily data reset!');
    }
}

function handleExportReport() {
    let csv = 'Time,Item Name,Type,Quantity,Status\n';
    
    state.history.forEach(entry => {
        csv += `${entry.time},${entry.itemName},${entry.type},${entry.quantity},${entry.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// ===== UTILITY FUNCTIONS =====
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('current-time').textContent = timeString;
}

function showLoading() {
    document.getElementById('loading-spinner').classList.add('active');
}

function hideLoading() {
    document.getElementById('loading-spinner').classList.remove('active');
}

function playSound(type) {
    if (!CONFIG.SOUND_ENABLED) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'correct') {
        oscillator.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } else {
        oscillator.frequency.value = 400;
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    }
}

// ===== DAILY RESET =====
function checkDailyReset() {
    const lastResetDate = localStorage.getItem('lastResetDate');
    const today = new Date().toISOString().split('T')[0];

    if (lastResetDate !== today) {
        state.history = [];
        state.correctCount = 0;
        state.wrongCount = 0;
        saveHistoryToLocalStorage();
        localStorage.setItem('lastResetDate', today);
        updateDashboard();
    }
}
