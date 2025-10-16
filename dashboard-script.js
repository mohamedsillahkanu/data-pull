const GOOGLE_APPS_SCRIPT_PROXY = 'https://script.google.com/macros/s/AKfycbyRXc68PYSmDSCYPakAS8Gc9R00kRjmsMYoDujPYMItyquXfwMAJUtRqXLiDlNWbSfDQQ/exec';

// DATA ELEMENT IDs from your case study
const DATA_ELEMENTS = {
    clientsTested: 'kLmN8oPqR3s',      // Number of clients tested
    testResult: 'WvYDK6cYopD',         // HIV test result
    clientAge: 'tUvW9xYzA1b',          // Client age
    counselingType: 'Oj5wqLKQ6f3',     // Counseling type
    comments: 'cDeFgH2iJ4k'            // Comments
};

// OPTION IDs from your case study
const OPTIONS = {
    positive: 'uVGKdrp4iYw',
    negative: 'RxqYKri1WqY',
    inconclusive: 'tOaQYVdAs6D',
    individual: 'qjrA54Rvhrl',
    group: 'lTRsgvyDd5M',
    couples: 'RUGObX8DV5L'
};

const state = { 
    config: null, 
    isLoggedIn: false,
    orgUnits: [],
    charts: {},
    currentData: []
};

function makeProxyRequest(targetUrl, options = {}) {
    let proxyUrl = `${GOOGLE_APPS_SCRIPT_PROXY}?url=${encodeURIComponent(targetUrl)}`;
    if (options.headers && options.headers.Authorization) {
        proxyUrl += `&Authorization=${encodeURIComponent(options.headers.Authorization)}`;
    }
    return fetch(proxyUrl, { method: options.method || 'GET', body: options.body });
}

async function fetchWithAuth(url, options = {}) {
    if (!state.config) throw new Error('Not authenticated');
    const authHeader = 'Basic ' + btoa(`${state.config.username}:${state.config.password}`);
    return makeProxyRequest(url, { 
        ...options, 
        headers: { 
            'Authorization': authHeader, 
            'Content-Type': 'application/json', 
            ...options.headers 
        } 
    });
}

function showNotification(message, type) {
    const notification = document.getElementById('notification');
    if (!notification) return;
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    setTimeout(() => notification.classList.remove('show'), 4000);
}

function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = today.toLocaleDateString('en-US', options);
    }
}

function updateLastUpdated() {
    const timeElement = document.getElementById('lastUpdated');
    if (timeElement) {
        const now = new Date();
        timeElement.textContent = now.toLocaleTimeString();
    }
}

function addActivityLog(message) {
    const logContainer = document.getElementById('activityLog');
    if (!logContainer) return;
    
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    
    const time = document.createElement('span');
    time.className = 'activity-time';
    time.textContent = new Date().toLocaleTimeString();
    
    const text = document.createElement('span');
    text.className = 'activity-text';
    text.textContent = message;
    
    activityItem.appendChild(time);
    activityItem.appendChild(text);
    
    if (logContainer.firstChild) {
        logContainer.insertBefore(activityItem, logContainer.firstChild);
    } else {
        logContainer.appendChild(activityItem);
    }
    
    while (logContainer.children.length > 10) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

async function loadOrganisationUnits() {
    try {
        addActivityLog('Loading organisation units...');
        const url = `${state.config.instanceUrl}/api/organisationUnits.json?fields=id,displayName&paging=false`;
        const response = await fetchWithAuth(url);
        
        if (!response.ok) throw new Error('Failed to fetch organisation units');
        
        const data = await response.json();
        state.orgUnits = data.organisationUnits || [];
        
        const select = document.getElementById('orgUnitFilter');
        select.innerHTML = '<option value="ALL">All Organisation Units</option>';
        
        state.orgUnits.forEach(ou => {
            const option = document.createElement('option');
            option.value = ou.id;
            option.textContent = ou.displayName;
            select.appendChild(option);
        });
        
        addActivityLog(`Loaded ${state.orgUnits.length} organisation units`);
    } catch (error) {
        console.error('Error loading org units:', error);
        addActivityLog(`Error loading org units: ${error.message}`);
    }
}

function selectAllOrgUnits() {
    const select = document.getElementById('orgUnitFilter');
    for (let i = 0; i < select.options.length; i++) {
        select.options[i].selected = true;
    }
}

function clearAllOrgUnits() {
    const select = document.getElementById('orgUnitFilter');
    for (let i = 0; i < select.options.length; i++) {
        select.options[i].selected = false;
    }
    select.options[0].selected = true; // Select "ALL"
}

function getSelectedOrgUnits() {
    const select = document.getElementById('orgUnitFilter');
    const selected = Array.from(select.selectedOptions).map(opt => opt.value);
    
    if (selected.includes('ALL')) {
        return state.orgUnits.map(ou => ou.id);
    }
    
    return selected.filter(id => id !== 'ALL');
}

function getPeriodFromFilters() {
    const year = document.getElementById('yearFilter').value;
    const month = document.getElementById('monthFilter').value;
    
    if (month) {
        // Specific month: e.g., "202501" for January 2025
        return `${year}${month}`;
    } else {
        // Whole year: need to fetch all 12 months
        const periods = [];
        for (let m = 1; m <= 12; m++) {
            const monthStr = String(m).padStart(2, '0');
            periods.push(`${year}${monthStr}`);
        }
        return periods;
    }
}

async function applyFilters() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.classList.add('loading');
        refreshBtn.disabled = true;
    }

    try {
        addActivityLog('Applying filters and fetching data...');
        
        const orgUnits = getSelectedOrgUnits();
        const periods = getPeriodFromFilters();
        
        if (orgUnits.length === 0) {
            showNotification('Please select at least one organisation unit', 'error');
            return;
        }
        
        const dataElementIds = Object.values(DATA_ELEMENTS).join(',');
        const orgUnitIds = orgUnits.join(',');
        
        // Handle multiple periods (whole year) or single period
        let allDataValues = [];
        
        if (Array.isArray(periods)) {
            // Fetch data for each month
            addActivityLog(`Fetching data for ${periods.length} months...`);
            for (const period of periods) {
                const url = `${state.config.instanceUrl}/api/dataValueSets.json?dataElement=${dataElementIds}&orgUnit=${orgUnitIds}&period=${period}`;
                const response = await fetchWithAuth(url);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.dataValues) {
                        allDataValues = allDataValues.concat(data.dataValues);
                    }
                }
            }
        } else {
            // Fetch data for single month
            const url = `${state.config.instanceUrl}/api/dataValueSets.json?dataElement=${dataElementIds}&orgUnit=${orgUnitIds}&period=${periods}`;
            const response = await fetchWithAuth(url);
            
            if (!response.ok) throw new Error(`Failed to fetch data: ${response.status}`);
            
            const data = await response.json();
            allDataValues = data.dataValues || [];
        }
        
        state.currentData = allDataValues;
        processDataValues(allDataValues);
        
        updateLastUpdated();
        addActivityLog(`Successfully loaded ${allDataValues.length} data values`);
        showNotification('Data loaded successfully!', 'success');
        
    } catch (error) {
        console.error('Error fetching data:', error);
        addActivityLog(`Error: ${error.message}`);
        showNotification(`Failed to fetch data: ${error.message}`, 'error');
    } finally {
        if (refreshBtn) {
            refreshBtn.classList.remove('loading');
            refreshBtn.disabled = false;
        }
    }
}

function resetFilters() {
    // Set current year
    const currentYear = new Date().getFullYear();
    document.getElementById('yearFilter').value = currentYear;
    
    // Clear month filter
    document.getElementById('monthFilter').value = '';
    
    // Select all org units
    const select = document.getElementById('orgUnitFilter');
    select.options[0].selected = true;
    for (let i = 1; i < select.options.length; i++) {
        select.options[i].selected = false;
    }
    
    showNotification('Filters reset', 'info');
}

function processDataValues(dataValues) {
    // Group data by org unit and period
    const grouped = {};
    
    // Initialize counters
    let totalTested = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let inconclusiveCount = 0;
    let ageSum = 0;
    let ageCount = 0;
    let counselingCount = 0;
    
    const counselingTypes = {
        individual: 0,
        group: 0,
        couples: 0
    };
    
    dataValues.forEach(dv => {
        const key = `${dv.orgUnit}_${dv.period}`;
        
        if (!grouped[key]) {
            grouped[key] = {
                orgUnit: dv.orgUnit,
                period: dv.period,
                clientsTested: 0,
                positive: 0,
                negative: 0,
                inconclusive: 0,
                ages: [],
                counseling: []
            };
        }
        
        // Count clients tested
        if (dv.dataElement === DATA_ELEMENTS.clientsTested) {
            const count = parseInt(dv.value) || 0;
            grouped[key].clientsTested += count;
            totalTested += count;
        }
        
        // Count test results
        if (dv.dataElement === DATA_ELEMENTS.testResult) {
            if (dv.value === OPTIONS.positive) {
                grouped[key].positive++;
                positiveCount++;
            } else if (dv.value === OPTIONS.negative) {
                grouped[key].negative++;
                negativeCount++;
            } else if (dv.value === OPTIONS.inconclusive) {
                grouped[key].inconclusive++;
                inconclusiveCount++;
            }
        }
        
        // Collect ages
        if (dv.dataElement === DATA_ELEMENTS.clientAge) {
            const age = parseInt(dv.value);
            if (!isNaN(age)) {
                grouped[key].ages.push(age);
                ageSum += age;
                ageCount++;
            }
        }
        
        // Count counseling types
        if (dv.dataElement === DATA_ELEMENTS.counselingType) {
            counselingCount++;
            grouped[key].counseling.push(dv.value);
            
            if (dv.value === OPTIONS.individual) counselingTypes.individual++;
            else if (dv.value === OPTIONS.group) counselingTypes.group++;
            else if (dv.value === OPTIONS.couples) counselingTypes.couples++;
        }
    });
    
    // Update summary cards
    document.getElementById('totalTested').textContent = totalTested.toLocaleString();
    document.getElementById('positiveCount').textContent = positiveCount.toLocaleString();
    document.getElementById('negativeCount').textContent = negativeCount.toLocaleString();
    document.getElementById('inconclusiveCount').textContent = inconclusiveCount.toLocaleString();
    document.getElementById('avgAge').textContent = ageCount > 0 ? Math.round(ageSum / ageCount) : '--';
    document.getElementById('counselingTotal').textContent = counselingCount.toLocaleString();
    
    // Update table
    updateDataTable(grouped);
    
    // Update charts
    updateResultsChart(positiveCount, negativeCount, inconclusiveCount);
    updateCounselingChart(counselingTypes);
    updateTrendChart(grouped);
}

async function updateDataTable(grouped) {
    const tableBody = document.getElementById('tableBody');
    if (!tableBody) return;
    
    // Fetch org unit names
    const orgUnitIds = [...new Set(Object.values(grouped).map(g => g.orgUnit))];
    const orgUnitNames = await fetchOrgUnitNames(orgUnitIds);
    
    tableBody.innerHTML = '';
    
    if (Object.keys(grouped).length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="loading-cell">No data available for selected filters</td>';
        tableBody.appendChild(row);
        return;
    }
    
    Object.values(grouped).forEach(data => {
        const row = document.createElement('tr');
        
        const avgAge = data.ages.length > 0 
            ? Math.round(data.ages.reduce((a, b) => a + b, 0) / data.ages.length) 
            : '--';
        
        row.innerHTML = `
            <td>${orgUnitNames[data.orgUnit] || data.orgUnit}</td>
            <td>${formatPeriod(data.period)}</td>
            <td>${data.clientsTested}</td>
            <td class="positive-cell">${data.positive}</td>
            <td class="negative-cell">${data.negative}</td>
            <td class="inconclusive-cell">${data.inconclusive}</td>
            <td>${avgAge}</td>
            <td>${data.counseling.length}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

async function fetchOrgUnitNames(orgUnitIds) {
    if (orgUnitIds.length === 0) return {};
    
    try {
        const url = `${state.config.instanceUrl}/api/organisationUnits.json?filter=id:in:[${orgUnitIds.join(',')}]&fields=id,displayName&paging=false`;
        const response = await fetchWithAuth(url);
        
        if (response.ok) {
            const data = await response.json();
            const names = {};
            data.organisationUnits.forEach(ou => {
                names[ou.id] = ou.displayName;
            });
            return names;
        }
    } catch (error) {
        console.error('Error fetching org unit names:', error);
    }
    
    return {};
}

function formatPeriod(period) {
    // Convert "202501" to "Jan 2025"
    const year = period.substring(0, 4);
    const month = period.substring(4, 6);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
}

function updateResultsChart(positive, negative, inconclusive) {
    const ctx = document.getElementById('resultsChart');
    if (!ctx) return;
    
    if (state.charts.results) {
        state.charts.results.destroy();
    }
    
    state.charts.results = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Negative', 'Inconclusive'],
            datasets: [{
                data: [positive, negative, inconclusive],
                backgroundColor: [
                    'rgba(220, 53, 69, 0.8)',
                    'rgba(46, 160, 67, 0.8)',
                    'rgba(255, 193, 7, 0.8)'
                ],
                borderColor: [
                    'rgba(220, 53, 69, 1)',
                    'rgba(46, 160, 67, 1)',
                    'rgba(255, 193, 7, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateCounselingChart(counselingTypes) {
    const ctx = document.getElementById('counselingChart');
    if (!ctx) return;
    
    if (state.charts.counseling) {
        state.charts.counseling.destroy();
    }
    
    state.charts.counseling = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Individual', 'Group', 'Couples'],
            datasets: [{
                label: 'Sessions',
                data: [counselingTypes.individual, counselingTypes.group, counselingTypes.couples],
                backgroundColor: [
                    'rgba(44, 102, 147, 0.8)',
                    'rgba(74, 144, 196, 0.8)',
                    'rgba(0, 188, 212, 0.8)'
                ],
                borderColor: [
                    'rgba(44, 102, 147, 1)',
                    'rgba(74, 144, 196, 1)',
                    'rgba(0, 188, 212, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function updateTrendChart(grouped) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    if (state.charts.trend) {
        state.charts.trend.destroy();
    }
    
    // Group by period
    const periodData = {};
    
    Object.values(grouped).forEach(data => {
        if (!periodData[data.period]) {
            periodData[data.period] = {
                tested: 0,
                positive: 0,
                negative: 0
            };
        }
        
        periodData[data.period].tested += data.clientsTested;
        periodData[data.period].positive += data.positive;
        periodData[data.period].negative += data.negative;
    });
    
    const periods = Object.keys(periodData).sort();
    const labels = periods.map(p => formatPeriod(p));
    const testedData = periods.map(p => periodData[p].tested);
    const positiveData = periods.map(p => periodData[p].positive);
    const negativeData = periods.map(p => periodData[p].negative);
    
    state.charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Clients Tested',
                    data: testedData,
                    borderColor: 'rgba(44, 102, 147, 1)',
                    backgroundColor: 'rgba(44, 102, 147, 0.1)',
                    borderWidth: 3,
                    tension: 0.4
                },
                {
                    label: 'Positive Results',
                    data: positiveData,
                    borderColor: 'rgba(220, 53, 69, 1)',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    borderWidth: 3,
                    tension: 0.4
                },
                {
                    label: 'Negative Results',
                    data: negativeData,
                    borderColor: 'rgba(46, 160, 67, 1)',
                    backgroundColor: 'rgba(46, 160, 67, 0.1)',
                    borderWidth: 3,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function exportTableToCSV() {
    const table = document.getElementById('dataTable');
    if (!table) return;
    
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        const csvRow = [];
        cols.forEach(col => {
            csvRow.push('"' + col.textContent.replace(/"/g, '""') + '"');
        });
        csv.push(csvRow.join(','));
    });
    
    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    const year = document.getElementById('yearFilter').value;
    const month = document.getElementById('monthFilter').value || 'all';
    link.download = `hiv-testing-data-${year}-${month}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showNotification('Data exported successfully!', 'success');
    addActivityLog('Data exported to CSV');
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const instanceUrl = document.getElementById('instanceUrl').value.trim().replace(/\/$/, '');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    if (!instanceUrl.startsWith('http://') && !instanceUrl.startsWith('https://')) {
        showNotification('URL must start with http:// or https://', 'error');
        return;
    }
    
    const submitBtn = e.target.querySelector('.btn-primary');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Connecting...';
    
    const config = { instanceUrl, username, password };
    
    try {
        showNotification('Connecting to DHIS2...', 'info');
        const testUrl = `${instanceUrl}/api/me`;
        const authHeader = 'Basic ' + btoa(`${username}:${password}`);
        const response = await makeProxyRequest(testUrl, { 
            method: 'GET', 
            headers: { 'Authorization': authHeader } 
        });
        
        if (response.ok) {
            const userData = await response.json();
            state.config = config;
            state.isLoggedIn = true;
            
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardContent').classList.add('show');
            
            const firstName = userData.firstName || '';
            const surname = userData.surname || '';
            const fullName = `${firstName} ${surname}`.trim() || 'User';
            
            showNotification(`✅ Connected successfully! Welcome ${fullName}`, 'success');
            
            // Initialize dashboard
            updateCurrentDate();
            loadOrganisationUnits();
            
            // Set current year
            const currentYear = new Date().getFullYear();
            document.getElementById('yearFilter').value = currentYear;
            
        } else if (response.status === 401) {
            showNotification('❌ Invalid username or password', 'error');
        } else if (response.status === 403) {
            showNotification('❌ Access forbidden', 'error');
        } else {
            showNotification(`Authentication failed (${response.status})`, 'error');
        }
    } catch (error) {
        showNotification(`Connection failed: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Connect to Dashboard';
    }
});

// Logout button handler
document.getElementById('logoutBtn').addEventListener('click', () => {
    state.config = null;
    state.isLoggedIn = false;
    
    document.getElementById('dashboardContent').classList.remove('show');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('loginForm').reset();
    
    showNotification('Logged out successfully', 'info');
});

// Update date every minute
setInterval(updateCurrentDate, 60000);
