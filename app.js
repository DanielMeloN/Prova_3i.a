// Core variables
let rawData = [];
let cleanedData = [];
let edaStats = {};
let activeTrainedModel = null;
let currentTrainingJob = null;
let isDatasetLoaded = false;

// Color helper
const colors = {
    indigo: '#6366f1',
    emerald: '#10b981',
    amber: '#f59e0b',
    rose: '#f43f5e',
    cyan: '#06b6d4',
    bgPrimary: '#080b11',
    bgSecondary: '#0f1420',
    bgTertiary: '#171e30',
    textPrimary: '#f3f4f6',
    textSecondary: '#9ca3af',
    border: 'rgba(255, 255, 255, 0.06)'
};

// Categorical Mappings
const brandList = ['Audi', 'BMW', 'Chevrolet', 'Ford', 'Honda', 'Hyundai', 'Kia', 'Mercedes', 'Toyota', 'Volkswagen'];
const transmissionList = ['Automatic', 'Manual', 'Semi-Automatic'];
const fuelList = ['Diesel', 'Electric', 'Hybrid', 'Petrol'];

// Manual mapping used in PMC 16-19
const manualFuelMapping = {
    'Petrol': 0,
    'Diesel': 1,
    'Electric': 2,
    'Hybrid': 3
};

// Standard normal distribution generator (Box-Muller transform)
function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// -------------------------------------------------------------
// UI CONTROLS & TAB SWITCHING
// -------------------------------------------------------------
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (!isDatasetLoaded && item.id !== 'nav-overview' && item.getAttribute('data-tab') !== 'overview') {
            alert('Por favor, carregue o arquivo car_price_dataset.csv primeiro!');
            return;
        }
        
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        item.classList.add('active');
        const tabId = item.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        
        // Re-render canvases if switching to EDA or Trainer
        if (tabId === 'eda') {
            setTimeout(renderEDA, 100);
        }
    });
});

// -------------------------------------------------------------
// AUTO-FETCH & FILE UPLOAD HANDLERS
// -------------------------------------------------------------
const overlay = document.getElementById('loading-overlay');
const overlayStatus = document.getElementById('overlay-status');

document.addEventListener('DOMContentLoaded', () => {
    // Attempt to automatically load the dataset
    fetchDatasetAutomatically();
    
    // Setup drag & drop drag/click event listeners for fallback
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('csv-file');
    
    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const file = dt.files[0];
            handleFile(file);
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            handleFile(file);
        });
    }
});

function fetchDatasetAutomatically() {
    if (window.CAR_DATASET_CSV) {
        console.log('Base de dados carregada via dataset.js (bypassing CORS)!');
        loadDataFromText(window.CAR_DATASET_CSV);
        return;
    }

    const paths = ['prova3 i.a/car_price_dataset.csv', 'car_price_dataset.csv'];
    let attempt = 0;
    
    function tryFetch() {
        if (attempt >= paths.length) {
            console.warn('Auto-fetch falhou. Apresentando card de upload manual (CORS fallback).');
            const fallbackCard = document.getElementById('cors-fallback-card');
            if (fallbackCard) fallbackCard.style.display = 'block';
            
            const statusBox = document.getElementById('dataset-status-box');
            if (statusBox) {
                statusBox.style.backgroundColor = 'rgba(244, 63, 94, 0.05)';
                statusBox.style.borderColor = 'rgba(244, 63, 94, 0.15)';
                statusBox.innerHTML = `
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--accent-rose); font-size: 20px;"></i>
                    <div>
                        <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 2px;">Dataset Pendente</h4>
                        <p style="font-size: 11px; color: var(--text-secondary);">Por favor, selecione ou arraste o arquivo CSV acima.</p>
                    </div>
                `;
            }
            return;
        }
        
        const path = paths[attempt];
        fetch(path)
            .then(res => {
                if (!res.ok) throw new Error();
                return res.text();
            })
            .then(text => {
                console.log(`Base de dados carregada via: ${path}`);
                loadDataFromText(text);
            })
            .catch(() => {
                attempt++;
                tryFetch();
            });
    }
    
    tryFetch();
}

function handleFile(file) {
    if (!file) return;
    showOverlay('Lendo base de dados...');
    const reader = new FileReader();
    reader.onload = function(e) {
        loadDataFromText(e.target.result);
        hideOverlay();
    };
    reader.readAsText(file);
}

function loadDataFromText(text) {
    try {
        parseCSV(text);
        isDatasetLoaded = true;
        
        // Enable navigation items visually
        document.querySelectorAll('.nav-item').forEach(item => {
            item.style.opacity = '1';
            item.style.cursor = 'pointer';
        });
        
        // Populate stats widgets
        document.getElementById('stat-total-rows').innerText = rawData.length.toLocaleString();
        document.getElementById('stat-valid-rows').innerText = cleanedData.length.toLocaleString();
        document.getElementById('stat-nulls-dropped').innerText = (rawData.length - cleanedData.length).toLocaleString();
        
        // Update dataset status box
        const statusBox = document.getElementById('dataset-status-box');
        if (statusBox) {
            statusBox.style.backgroundColor = 'rgba(16, 185, 129, 0.05)';
            statusBox.style.borderColor = 'rgba(16, 185, 129, 0.15)';
            statusBox.innerHTML = `
                <i class="fa-solid fa-circle-check" style="color: var(--accent-emerald); font-size: 20px;"></i>
                <div>
                    <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 2px;">Dataset Carregado</h4>
                    <p style="font-size: 11px; color: var(--text-secondary);">Base pronta para análise de correlação e simulação neural.</p>
                </div>
            `;
        }
        
        // Render overview preview table
        const overviewPreviewTbody = document.querySelector('#overview-preview-table tbody');
        if (overviewPreviewTbody) {
            let html = '';
            const limit = Math.min(cleanedData.length, 5);
            for (let i = 0; i < limit; i++) {
                const r = cleanedData[i];
                html += `<tr>
                    <td><strong>${r.Brand}</strong></td>
                    <td>${r.Year}</td>
                    <td>${r.Engine_Size.toFixed(1)}L</td>
                    <td>${r.Mileage.toLocaleString()} km</td>
                    <td style="color: var(--accent-emerald); font-weight: 600;">R$ ${r.Price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>`;
            }
            overviewPreviewTbody.innerHTML = html;
        }
        
        // Pre-compute EDA metrics & populate other tables
        computeEDAMetrics();
        renderRawTable();
        
        // Hide fallback card if displayed
        const fallbackCard = document.getElementById('cors-fallback-card');
        if (fallbackCard) fallbackCard.style.display = 'none';
        
    } catch (error) {
        console.error('Erro no processamento da base:', error);
        alert('Ocorreu um erro ao carregar os dados. Verifique a estrutura do CSV.');
    }
}

function showOverlay(msg) {
    overlayStatus.innerText = msg;
    overlay.classList.add('active');
}

function hideOverlay() {
    overlay.classList.remove('active');
}

// -------------------------------------------------------------
// CSV PARSING & DATA PREPROCESSING
// -------------------------------------------------------------
function parseCSV(text) {
    rawData = [];
    cleanedData = [];
    
    // Split by lines, ignoring empty ones
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) throw new Error("CSV muito curto");
    
    // Header parsing
    const headers = lines[0].split(',').map(h => h.trim());
    
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length !== headers.length) continue; // Skip malformed rows
        
        const row = {};
        let isNullRow = false;
        
        headers.forEach((h, idx) => {
            let val = cols[idx];
            // Check if null/empty
            if (val === '' || val === undefined || val === null || val.toLowerCase() === 'nan') {
                isNullRow = true;
                row[h] = null;
            } else {
                // Parse numeric columns
                if (['Year', 'Engine_Size', 'Mileage', 'Doors', 'Owner_Count', 'Price'].includes(h)) {
                    row[h] = parseFloat(val);
                    if (isNaN(row[h])) isNullRow = true;
                } else {
                    row[h] = val;
                }
            }
        });
        
        // Save raw record
        row['_index'] = i - 1; // Preserve original CSV index
        rawData.push(row);
        
        if (!isNullRow) {
            cleanedData.push(row);
        }
    }
}

// -------------------------------------------------------------
// MATHEMATICAL & STATISTICAL FUNCTIONS (EDA)
// -------------------------------------------------------------
function calculateCorrelation(x, y) {
    const n = x.length;
    if (n === 0) return 0;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    
    const meanX = sumX / n;
    const meanY = sumY / n;
    
    let num = 0;
    let denX = 0;
    let denY = 0;
    
    for (let i = 0; i < n; i++) {
        const diffX = x[i] - meanX;
        const diffY = y[i] - meanY;
        num += diffX * diffY;
        denX += diffX * diffX;
        denY += diffY * diffY;
    }
    
    if (denX === 0 || denY === 0) return 0;
    return num / Math.sqrt(denX * denY);
}

function getEncodedArray(data, column, encodingType) {
    return data.map(row => {
        const val = row[column];
        if (column === 'Brand') {
            return brandList.indexOf(val);
        }
        if (column === 'Transmission') {
            return transmissionList.indexOf(val);
        }
        if (column === 'Fuel_Type') {
            if (encodingType === 'manual') {
                return manualFuelMapping[val] !== undefined ? manualFuelMapping[val] : 0;
            } else {
                return fuelList.indexOf(val);
            }
        }
        return row[column];
    });
}

function computeEDAMetrics() {
    if (cleanedData.length === 0) return;
    
    const numericCols = ['Year', 'Engine_Size', 'Fuel_Type', 'Transmission', 'Mileage', 'Doors', 'Owner_Count', 'Price'];
    const corrMatrix = {};
    const corrPreco = {};
    
    // Build values arrays
    const arrays = {};
    numericCols.forEach(col => {
        if (['Brand', 'Transmission', 'Fuel_Type'].includes(col) || col === 'Fuel_Type') {
            arrays[col] = getEncodedArray(cleanedData, col, 'alphabetical');
        } else {
            arrays[col] = cleanedData.map(r => r[col]);
        }
    });
    // Add Brand manually as it is categorical
    arrays['Brand'] = getEncodedArray(cleanedData, 'Brand', 'alphabetical');
    const allCols = ['Brand', 'Year', 'Engine_Size', 'Fuel_Type', 'Transmission', 'Mileage', 'Doors', 'Owner_Count', 'Price'];
    
    allCols.forEach(col1 => {
        corrMatrix[col1] = {};
        allCols.forEach(col2 => {
            corrMatrix[col1][col2] = calculateCorrelation(arrays[col1], arrays[col2]);
        });
        if (col1 !== 'Price') {
            corrPreco[col1] = corrMatrix[col1]['Price'];
        }
    });
    
    edaStats = {
        corrMatrix,
        corrPreco,
        allCols
    };
}

// -------------------------------------------------------------
// CANVAS CHART & HEATMAP RENDERING
// -------------------------------------------------------------
function renderEDA() {
    computeEDAMetrics();
    renderCorrelationHeatmap();
    renderImpactChart();
    renderRawTable();
}

function renderCorrelationHeatmap() {
    const canvas = document.getElementById('corr-heatmap');
    if (!canvas || !edaStats.corrMatrix) return;
    
    const ctx = canvas.getContext('2d');
    const cols = edaStats.allCols;
    const n = cols.length;
    
    const size = canvas.width;
    const paddingLeft = 90;
    const paddingTop = 90;
    const cellSize = (size - paddingLeft) / n;
    
    ctx.clearRect(0, 0, size, size);
    
    // Draw grid & labels
    ctx.font = '550 9px Outfit';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < n; i++) {
        // Y Labels (Row names)
        ctx.fillStyle = colors.textPrimary;
        ctx.fillText(cols[i], paddingLeft - 8, paddingTop + i * cellSize + cellSize / 2);
        
        // X Labels (Col names - Rotated)
        ctx.save();
        ctx.translate(paddingLeft + i * cellSize + cellSize / 2, paddingTop - 8);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'left';
        ctx.fillText(cols[i], 0, 0);
        ctx.restore();
        
        for (let j = 0; j < n; j++) {
            const val = edaStats.corrMatrix[cols[i]][cols[j]];
            
            // Heatmap color mapping: blue (+1) to dark background (0) to red (-1)
            let color = '';
            if (val >= 0) {
                // Indigo/Cyan mix
                color = `rgba(99, 102, 241, ${val})`;
            } else {
                // Rose
                color = `rgba(244, 63, 94, ${Math.abs(val)})`;
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(paddingLeft + j * cellSize, paddingTop + i * cellSize, cellSize - 1, cellSize - 1);
            
            // Draw correlation value inside cell
            ctx.fillStyle = Math.abs(val) > 0.4 ? '#fff' : colors.textSecondary;
            ctx.font = '500 8px JetBrains Mono';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(val.toFixed(2), paddingLeft + j * cellSize + cellSize / 2, paddingTop + i * cellSize + cellSize / 2);
        }
    }
    
    // Add Mouse Hover Tooltip Handler
    canvas.onmousemove = function(e) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Scale mouse positions to canvas coordinates
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cX = mouseX * scaleX;
        const cY = mouseY * scaleY;
        
        if (cX >= paddingLeft && cY >= paddingTop) {
            const j = Math.floor((cX - paddingLeft) / cellSize);
            const i = Math.floor((cY - paddingTop) / cellSize);
            
            if (i >= 0 && i < n && j >= 0 && j < n) {
                const val = edaStats.corrMatrix[cols[i]][cols[j]];
                canvas.title = `${cols[i]} vs ${cols[j]}: ${val.toFixed(4)}`;
                return;
            }
        }
        canvas.title = '';
    };
}

function renderImpactChart() {
    const canvas = document.getElementById('impact-chart');
    if (!canvas || !edaStats.corrPreco) return;
    
    const ctx = canvas.getContext('2d');
    const data = edaStats.corrPreco;
    const keys = Object.keys(data).filter(k => k !== 'Price');
    
    // Sort by correlation value ascending
    keys.sort((a, b) => data[a] - data[b]);
    
    const size = canvas.width;
    const paddingLeft = 100;
    const paddingRight = 40;
    const paddingTop = 40;
    const paddingBottom = 40;
    
    const chartWidth = size - paddingLeft - paddingRight;
    const chartHeight = size - paddingTop - paddingBottom;
    const barHeight = chartHeight / keys.length - 8;
    
    ctx.clearRect(0, 0, size, size);
    
    // Draw vertical center axis (x = 0)
    const zeroX = paddingLeft + chartWidth / 2;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(zeroX, paddingTop - 10);
    ctx.lineTo(zeroX, size - paddingBottom + 10);
    ctx.stroke();
    
    // Title indicator
    ctx.fillStyle = colors.textSecondary;
    ctx.font = '500 10px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText('← Correlação Negativa (Diminui Preço) | Correlação Positiva (Aumenta Preço) →', size / 2, size - 15);
    
    keys.forEach((key, idx) => {
        const val = data[key];
        const y = paddingTop + idx * (barHeight + 8) + barHeight / 2;
        
        // Map bar width (val goes from -1 to 1)
        const barWidth = (val / 1.0) * (chartWidth / 2);
        
        // Colors: green for positive, red for negative
        ctx.fillStyle = val >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(244, 63, 94, 0.7)';
        ctx.strokeStyle = val >= 0 ? colors.emerald : colors.rose;
        ctx.lineWidth = 1;
        
        // Draw horizontal bar
        ctx.fillRect(zeroX, y - barHeight / 2, barWidth, barHeight);
        ctx.strokeRect(zeroX, y - barHeight / 2, barWidth, barHeight);
        
        // Draw labels
        ctx.fillStyle = colors.textPrimary;
        ctx.font = '600 10px Outfit';
        ctx.textAlign = 'right';
        ctx.fillText(key, paddingLeft - 8, y + 3);
        
        // Draw value
        ctx.fillStyle = colors.textPrimary;
        ctx.font = '500 10px JetBrains Mono';
        ctx.textAlign = val >= 0 ? 'left' : 'right';
        ctx.fillText(val.toFixed(4), zeroX + barWidth + (val >= 0 ? 6 : -6), y + 3);
    });
}

function renderRawTable() {
    const table = document.getElementById('raw-data-table');
    if (!table || cleanedData.length === 0) return;
    
    const headers = ['Brand', 'Model', 'Year', 'Engine_Size', 'Fuel_Type', 'Transmission', 'Mileage', 'Doors', 'Owner_Count', 'Price'];
    
    // Build headers
    const thead = table.querySelector('thead');
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    
    // Render first 100 rows
    const tbody = table.querySelector('tbody');
    let rowsHTML = '';
    const displayLimit = Math.min(cleanedData.length, 100);
    
    for (let i = 0; i < displayLimit; i++) {
        const r = cleanedData[i];
        rowsHTML += `<tr>
            <td>${r.Brand}</td>
            <td>${r.Model}</td>
            <td>${r.Year}</td>
            <td>${r.Engine_Size.toFixed(1)}</td>
            <td>${r.Fuel_Type}</td>
            <td>${r.Transmission}</td>
            <td>${r.Mileage.toLocaleString()} km</td>
            <td>${r.Doors}</td>
            <td>${r.Owner_Count}</td>
            <td style="color: var(--accent-emerald); font-weight:600;">R$ ${r.Price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
    }
    tbody.innerHTML = rowsHTML;
}

// -------------------------------------------------------------
// LIVE LOSS CHART RENDERER (TRAINING)
// -------------------------------------------------------------
function drawLossChart(history) {
    const canvas = document.getElementById('loss-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    // Set actual canvas size matching client display
    canvas.width = width;
    canvas.height = height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (history.length === 0) {
        ctx.fillStyle = colors.textMuted;
        ctx.font = '14px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('Inicie o treinamento para visualizar o gráfico de perda', width / 2, height / 2);
        return;
    }
    
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;
    
    const graphWidth = width - paddingLeft - paddingRight;
    const graphHeight = height - paddingTop - paddingBottom;
    
    // Compute min/max values
    const maxEpoch = history.length;
    let maxLoss = Math.max(...history);
    let minLoss = Math.min(...history);
    
    if (maxLoss === minLoss) {
        maxLoss += 1;
        minLoss -= 1;
    }
    
    // Draw Axes & grid
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop);
    ctx.lineTo(paddingLeft, height - paddingBottom);
    ctx.lineTo(width - paddingRight, height - paddingBottom);
    ctx.stroke();
    
    // Grid lines (horizontal)
    const gridCount = 5;
    ctx.font = '500 9px JetBrains Mono';
    ctx.fillStyle = colors.textSecondary;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i <= gridCount; i++) {
        const val = minLoss + (maxLoss - minLoss) * (i / gridCount);
        const y = height - paddingBottom - (i / gridCount) * graphHeight;
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(width - paddingRight, y);
        ctx.stroke();
        
        ctx.fillText(val.toFixed(6), paddingLeft - 8, y);
    }
    
    // X Label
    ctx.textAlign = 'center';
    ctx.font = '550 10px Outfit';
    ctx.fillStyle = colors.textSecondary;
    ctx.fillText(`Época (Total: ${maxEpoch})`, paddingLeft + graphWidth / 2, height - 12);
    
    // Plot Line
    ctx.strokeStyle = colors.indigo;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < history.length; i++) {
        const x = paddingLeft + (i / (maxEpoch - 1)) * graphWidth;
        const y = height - paddingBottom - ((history[i] - minLoss) / (maxLoss - minLoss)) * graphHeight;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    
    // Draw final loss bubble text
    const finalLoss = history[history.length - 1];
    ctx.fillStyle = colors.rose;
    ctx.beginPath();
    const finalX = paddingLeft + graphWidth;
    const finalY = height - paddingBottom - ((finalLoss - minLoss) / (maxLoss - minLoss)) * graphHeight;
    ctx.arc(finalX, finalY, 4, 0, 2 * Math.PI);
    ctx.fill();
}

// -------------------------------------------------------------
// NEURAL NETWORKS ENGINES (PORTED FROM NUMPY)
// -------------------------------------------------------------

// Active parameters
let activeModelWeights = null;
let activeNormalizationData = null;

// Normalization Helpers
function zScoreNormalize(X, columns) {
    const m = X.length;
    if (m === 0) return { X_norm: [], means: [], stds: [] };
    
    const n = X[0].length;
    const means = new Array(n).fill(0);
    const stds = new Array(n).fill(0);
    
    // Compute Mean
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            means[j] += X[i][j];
        }
    }
    for (let j = 0; j < n; j++) {
        means[j] /= m;
    }
    
    // Compute Std Dev
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            const diff = X[i][j] - means[j];
            stds[j] += diff * diff;
        }
    }
    for (let j = 0; j < n; j++) {
        stds[j] = Math.sqrt(stds[j] / m);
        if (stds[j] === 0) stds[j] = 1e-8;
    }
    
    // Normalize X
    const X_norm = [];
    for (let i = 0; i < m; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
            row.push((X[i][j] - means[j]) / stds[j]);
        }
        X_norm.push(row);
    }
    
    return { X_norm, means, stds };
}

function minMaxNormalize(X) {
    const m = X.length;
    if (m === 0) return { X_norm: [], mins: [], maxs: [] };
    const n = X[0].length;
    const mins = new Array(n).fill(Infinity);
    const maxs = new Array(n).fill(-Infinity);
    
    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            if (X[i][j] < mins[j]) mins[j] = X[i][j];
            if (X[i][j] > maxs[j]) maxs[j] = X[i][j];
        }
    }
    
    const X_norm = [];
    for (let i = 0; i < m; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
            const range = maxs[j] - mins[j];
            row.push(range === 0 ? 0 : (X[i][j] - mins[j]) / range);
        }
        X_norm.push(row);
    }
    return { X_norm, mins, maxs };
}

// Logistic Activations
function logistic(x) {
    // Math overflow clipping
    const clipX = Math.max(-500, Math.min(500, x));
    return 1.0 / (1.0 + Math.exp(-clipX));
}

function logisticDerivative(a) {
    return a * (1.0 - a);
}

// -------------------------------------------------------------
// INTERACTIVE TRAINING JOB SCHEDULER
// -------------------------------------------------------------
class TrainingJob {
    constructor(modelType, hyperparams, callback) {
        this.modelType = modelType;
        this.hyperparams = hyperparams;
        this.callback = callback; // (epoch, loss, weights, testPreds, done) => {}
        this.epoch = 0;
        this.maxEpochs = hyperparams.epochs;
        this.history = [];
        this.running = true;
        this.startTime = Date.now();
        
        this.prepareData();
        this.initWeights();
    }
    
    prepareData() {
        const m = cleanedData.length;
        
        if (this.modelType === 'adaline' || this.modelType === 'pmc1' || this.modelType === 'pmc2') {
            // Features used: Brand, Year, Engine_Size, Fuel_Type, Transmission, Mileage
            // Mappings are alphabetical
            const Brand = getEncodedArray(cleanedData, 'Brand', 'alphabetical');
            const Year = cleanedData.map(r => r.Year);
            const Engine = cleanedData.map(r => r.Engine_Size);
            const Fuel = getEncodedArray(cleanedData, 'Fuel_Type', 'alphabetical');
            const Trans = getEncodedArray(cleanedData, 'Transmission', 'alphabetical');
            const Mile = cleanedData.map(r => r.Mileage);
            
            // X Matrix: 800 training rows, 200 testing rows
            const X_raw = [];
            for (let i = 0; i < 1000; i++) {
                X_raw.push([Brand[i], Year[i], Engine[i], Fuel[i], Trans[i], Mile[i]]);
            }
            
            // Min-Max normalize X
            const { X_norm, mins, maxs } = minMaxNormalize(X_raw);
            
            // Normalize Y Price (Min-Max)
            const y_raw = cleanedData.slice(0, 1000).map(r => r.Price);
            this.preco_min = Math.min(...y_raw);
            this.preco_max = Math.max(...y_raw);
            const y_norm = y_raw.map(y => (y - this.preco_min) / (this.preco_max - this.preco_min));
            
            // Insert bias term x0 = -1
            this.X_all = X_norm.map(row => [-1, ...row]);
            this.y_all = y_norm;
            this.y_raw = y_raw;
            
            // Normalization data needed for predictor
            activeNormalizationData = {
                type: 'minmax',
                features: ['Brand', 'Year', 'Engine_Size', 'Fuel_Type', 'Transmission', 'Mileage'],
                mins,
                maxs,
                preco_min: this.preco_min,
                preco_max: this.preco_max,
                fuelEncoding: 'alphabetical'
            };
            
            // Train/Test Split
            this.X_train = this.X_all.slice(0, 800);
            this.y_train = this.y_all.slice(0, 800);
            this.X_test = this.X_all.slice(800, 1000);
            this.y_test = this.y_all.slice(800, 1000);
            this.test_indices = cleanedData.slice(800, 1000).map(r => r._index);
            
        } else if (this.modelType.startsWith('pmc_relu') || this.modelType === 'pmc_lotes') {
            // Features used: Year, Engine_Size, Fuel_Type, Mileage, Owner_Count, Doors
            // Mappings are: Fuel -> manual map, others raw numerical
            const Year = cleanedData.map(r => r.Year);
            const Engine = cleanedData.map(r => r.Engine_Size);
            const Fuel = getEncodedArray(cleanedData, 'Fuel_Type', 'manual');
            const Mile = cleanedData.map(r => r.Mileage);
            const Owners = cleanedData.map(r => r.Owner_Count);
            const Doors = cleanedData.map(r => r.Doors);
            
            const X_raw = [];
            for (let i = 0; i < cleanedData.length; i++) {
                X_raw.push([Year[i], Engine[i], Fuel[i], Mile[i], Owners[i], Doors[i]]);
            }
            
            // Z-Score normalize X
            const { X_norm, means, stds } = zScoreNormalize(X_raw);
            
            // Normalize Y Price (Z-score)
            const y_raw = cleanedData.map(r => r.Price);
            
            const sumY = y_raw.reduce((a, b) => a + b, 0);
            this.media_y = sumY / y_raw.length;
            
            let stdSum = 0;
            y_raw.forEach(y => { stdSum += (y - this.media_y) * (y - this.media_y); });
            this.desvio_y = Math.sqrt(stdSum / y_raw.length);
            if (this.desvio_y === 0) this.desvio_y = 1e-8;
            
            const y_norm = y_raw.map(y => (y - this.media_y) / this.desvio_y);
            
            this.X_all = X_norm;
            this.y_all = y_norm;
            this.y_raw = y_raw;
            
            activeNormalizationData = {
                type: 'zscore',
                features: ['Year', 'Engine_Size', 'Fuel_Type', 'Mileage', 'Owner_Count', 'Doors'],
                means,
                stds,
                media_y: this.media_y,
                desvio_y: this.desvio_y,
                fuelEncoding: 'manual'
            };
            
            // Train/Test Split (Same index permutation seed 42)
            // Simulating Permutation
            const len = cleanedData.length;
            const indices = Array.from({ length: len }, (_, i) => i);
            
            // Simple pseudo-random shuffle with fixed seed 42
            let seed = 42;
            function random() {
                let x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            }
            for (let i = len - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                const temp = indices[i];
                indices[i] = indices[j];
                indices[j] = temp;
            }
            
            const corte = Math.floor(0.8 * len);
            this.idx_treino = indices.slice(0, corte);
            this.idx_teste = indices.slice(corte);
            
            this.X_train = this.idx_treino.map(idx => X_norm[idx]);
            this.y_train = this.idx_treino.map(idx => y_norm[idx]);
            this.X_test = this.idx_teste.map(idx => X_norm[idx]);
            this.y_test = this.idx_teste.map(idx => y_norm[idx]);
            this.test_indices = this.idx_teste.map(idx => cleanedData[idx]._index);
            
        } else if (this.modelType === 'tdnn') {
            // Predict sequence of prices (Cell 15)
            const p = this.hyperparams.delay || 5;
            const serie_preco = cleanedData.map(r => r.Price);
            this.preco_min = Math.min(...serie_preco);
            this.preco_max = Math.max(...serie_preco);
            
            const serie_norm = serie_preco.map(y => (y - this.preco_min) / (this.preco_max - this.preco_min));
            
            const X_raw = [];
            const y_raw_tdnn = [];
            for (let i = 0; i < serie_norm.length - p; i++) {
                X_raw.push(serie_norm.slice(i, i + p));
                y_raw_tdnn.push(serie_norm[i + p]);
            }
            
            // Bias Term -1
            this.X_all = X_raw.map(row => [-1, ...row]);
            this.y_all = y_raw_tdnn;
            this.y_raw = serie_preco.slice(p);
            
            activeNormalizationData = {
                type: 'tdnn',
                p: p,
                preco_min: this.preco_min,
                preco_max: this.preco_max
            };
            
            // Train (first 500) and Test (next 200)
            this.X_train = this.X_all.slice(0, 500);
            this.y_train = this.y_all.slice(0, 500);
            this.X_test = this.X_all.slice(500, 700);
            this.y_test = this.y_all.slice(500, 700);
            this.test_indices = Array.from({ length: 200 }, (_, j) => 500 + p + j);
        }
    }
    
    initWeights() {
        const n_inputs = this.X_train[0].length;
        
        if (this.modelType === 'adaline') {
            // Random weights between 0 and 1
            this.w = Array.from({ length: n_inputs }, () => Math.random());
        } else if (this.modelType === 'pmc1' || this.modelType === 'pmc2') {
            const n_hidden = this.modelType === 'pmc2' ? 15 : 10;
            // Hidden weights W_oculta (size: inputs x hidden)
            this.W_oculta = Array.from({ length: n_inputs }, () => Array.from({ length: n_hidden }, () => Math.random()));
            // Output weights W_saida (size: hidden+1 x 1)
            this.W_saida = Array.from({ length: n_hidden + 1 }, () => [Math.random()]);
            
            // Momentum matrices
            if (this.modelType === 'pmc2') {
                this.delta_W_oculta_ant = Array.from({ length: n_inputs }, () => new Array(n_hidden).fill(0));
                this.delta_W_saida_ant = Array.from({ length: n_hidden + 1 }, () => [0]);
            }
        } else if (this.modelType === 'tdnn') {
            const n_hidden = this.hyperparams.hidden || 5;
            this.W_oculta = Array.from({ length: n_inputs }, () => Array.from({ length: n_hidden }, () => Math.random()));
            this.W_saida = Array.from({ length: n_hidden + 1 }, () => [Math.random()]);
            this.delta_W_oculta_ant = Array.from({ length: n_inputs }, () => new Array(n_hidden).fill(0));
            this.delta_W_saida_ant = Array.from({ length: n_hidden + 1 }, () => [0]);
        } else if (this.modelType.startsWith('pmc_relu') || this.modelType === 'pmc_lotes') {
            // Deep architectures: Rasa [6, 5, 1], Ideal [6, 16, 8, 1], Profunda [6, 64, 32, 16, 1]
            let topologia = [6, 16, 8, 1];
            if (this.modelType === 'pmc_relu_rasa') topologia = [6, 5, 1];
            if (this.modelType === 'pmc_relu_profunda') topologia = [6, 64, 32, 16, 1];
            if (this.modelType === 'pmc_lotes') topologia = [6, 16, 8, 1]; // standard lotes is Ideal topology
            
            this.topologia = topologia;
            this.pesos = [];
            this.vieses = [];
            this.v_pesos = [];
            this.v_vieses = [];
            
            // He Initialization
            for (let i = 0; i < topologia.length - 1; i++) {
                const W = [];
                const b = [];
                const vW = [];
                const vb = [];
                
                const factor = Math.sqrt(2.0 / topologia[i]);
                for (let r = 0; r < topologia[i]; r++) {
                    W.push(Array.from({ length: topologia[i+1] }, () => randn() * factor));
                    vW.push(new Array(topologia[i+1]).fill(0));
                }
                b.push(new Array(topologia[i+1]).fill(0));
                vb.push(new Array(topologia[i+1]).fill(0));
                
                this.pesos.push(W);
                this.vieses.push(b);
                this.v_pesos.push(vW);
                this.v_vieses.push(vb);
            }
        }
    }
    
    // Forward pass helper for Multi-layer MLP (ReLU versions)
    forwardMLP(X_batch) {
        const ativacoes = [X_batch];
        
        // Hidden Layers (ReLU)
        for (let i = 0; i < this.pesos.length - 1; i++) {
            const X_prev = ativacoes[ativacoes.length - 1];
            const m = X_prev.length;
            const h_size = this.topologia[i+1];
            
            const next_ativ = [];
            for (let r = 0; r < m; r++) {
                const row = [];
                for (let c = 0; c < h_size; c++) {
                    let net = this.vieses[i][0][c];
                    for (let k = 0; k < this.topologia[i]; k++) {
                        net += X_prev[r][k] * this.pesos[i][k][c];
                    }
                    row.push(Math.max(0, net)); // ReLU
                }
                next_ativ.push(row);
            }
            ativacoes.push(next_ativ);
        }
        
        // Output Layer (Linear)
        const X_prev = ativacoes[ativacoes.length - 1];
        const m = X_prev.length;
        const out_size = this.topologia[this.topologia.length - 1]; // 1
        const i_out = this.pesos.length - 1;
        
        const z_saida = [];
        for (let r = 0; r < m; r++) {
            const row = [];
            for (let c = 0; c < out_size; c++) {
                let net = this.vieses[i_out][0][c];
                for (let k = 0; k < this.topologia[i_out]; k++) {
                    net += X_prev[r][k] * this.pesos[i_out][k][c];
                }
                row.push(net); // Linear
            }
            z_saida.push(row);
        }
        ativacoes.push(z_saida);
        return ativacoes;
    }
    
    // Backward pass helper for Multi-layer MLP (ReLU versions)
    backwardMLP(ativacoes, y_batch, lr) {
        const m = y_batch.length;
        const L = this.pesos.length;
        
        // Error at Linear output layer: delta_L = A_L - Y
        const delta = [];
        for (let r = 0; r < m; r++) {
            delta.push([ativacoes[L][r][0] - y_batch[r]]);
        }
        
        const grad_pesos = new Array(L);
        const grad_vieses = new Array(L);
        
        // Output layer gradients
        const W_grad = [];
        const A_prev = ativacoes[L-1];
        const prev_size = this.topologia[L-1];
        const out_size = this.topologia[L];
        
        for (let r = 0; r < prev_size; r++) {
            const row = [];
            for (let c = 0; c < out_size; c++) {
                let sum = 0;
                for (let i = 0; i < m; i++) {
                    sum += A_prev[i][r] * delta[i][c];
                }
                row.push(sum / m);
            }
            W_grad.push(row);
        }
        
        const b_grad = [new Array(out_size).fill(0)];
        for (let c = 0; c < out_size; c++) {
            let sum = 0;
            for (let i = 0; i < m; i++) {
                sum += delta[i][c];
            }
            b_grad[0][c] = sum / m;
        }
        
        grad_pesos[L-1] = W_grad;
        grad_vieses[L-1] = b_grad;
        
        // Propagate backwards through hidden layers
        let current_delta = delta;
        for (let l = L - 2; l >= 0; l--) {
            const next_delta = [];
            const layer_size = this.topologia[l+1];
            const next_layer_size = this.topologia[l+2];
            const A_curr = ativacoes[l+1];
            
            for (let i = 0; i < m; i++) {
                const row = [];
                for (let c = 0; c < layer_size; c++) {
                    let sum = 0;
                    for (let k = 0; k < next_layer_size; k++) {
                        sum += current_delta[i][k] * this.pesos[l+1][c][k];
                    }
                    // Derivative of ReLU: 1 if A > 0, else 0
                    const deriv = A_curr[i][c] > 0 ? 1.0 : 0.0;
                    row.push(sum * deriv);
                }
                next_delta.push(row);
            }
            current_delta = next_delta;
            
            // Gradient of weights for layer l
            const l_W_grad = [];
            const l_A_prev = ativacoes[l];
            const l_prev_size = this.topologia[l];
            for (let r = 0; r < l_prev_size; r++) {
                const row = [];
                for (let c = 0; c < layer_size; c++) {
                    let sum = 0;
                    for (let i = 0; i < m; i++) {
                        sum += l_A_prev[i][r] * current_delta[i][c];
                    }
                    row.push(sum / m);
                }
                l_W_grad.push(row);
            }
            
            const l_b_grad = [new Array(layer_size).fill(0)];
            for (let c = 0; c < layer_size; c++) {
                let sum = 0;
                for (let i = 0; i < m; i++) {
                    sum += current_delta[i][c];
                }
                l_b_grad[0][c] = sum / m;
            }
            
            grad_pesos[l] = l_W_grad;
            grad_vieses[l] = l_b_grad;
        }
        
        // Update weights using momentum
        const momentum = this.hyperparams.momentum || 0.8;
        for (let l = 0; l < L; l++) {
            const r_size = this.topologia[l];
            const c_size = this.topologia[l+1];
            
            for (let r = 0; r < r_size; r++) {
                for (let c = 0; c < c_size; c++) {
                    this.v_pesos[l][r][c] = momentum * this.v_pesos[l][r][c] + lr * grad_pesos[l][r][c];
                    this.pesos[l][r][c] -= this.v_pesos[l][r][c];
                }
            }
            
            for (let c = 0; c < c_size; c++) {
                this.v_vieses[l][0][c] = momentum * this.v_vieses[l][0][c] + lr * grad_vieses[l][0][c];
                this.vieses[l][0][c] -= this.v_vieses[l][0][c];
            }
        }
    }
    
    // Train a single epoch
    step() {
        if (!this.running) return;
        
        const lr_initial = this.hyperparams.lr;
        let lr = lr_initial;
        
        if (this.modelType === 'adaline') {
            // Delta Rule weight update (Online - pattern by pattern)
            let sumSqErr = 0;
            for (let i = 0; i < this.X_train.length; i++) {
                const xi = this.X_train[i];
                let u = 0;
                for (let j = 0; j < xi.length; j++) {
                    u += this.w[j] * xi[j];
                }
                const erro = this.y_train[i] - u;
                sumSqErr += erro * erro;
                for (let j = 0; j < xi.length; j++) {
                    this.w[j] = this.w[j] + lr * erro * xi[j];
                }
            }
            const mse = sumSqErr / this.X_train.length;
            this.history.push(mse);
            
        } else if (this.modelType === 'pmc1' || this.modelType === 'pmc2' || this.modelType === 'tdnn') {
            // PMC Sigmoid Backprop
            const n_hidden = this.modelType === 'pmc2' ? 15 : (this.modelType === 'tdnn' ? (this.hyperparams.hidden || 5) : 10);
            const momentum = this.modelType === 'pmc1' ? 0.0 : (this.modelType === 'tdnn' ? 0.8 : 0.9);
            
            let sumSqErr = 0;
            for (let i = 0; i < this.X_train.length; i++) {
                const x_in = this.X_train[i];
                const y_desejado = this.y_train[i];
                
                // FORWARD PASS
                // Hidden layer
                const out_oculta = [];
                for (let h = 0; h < n_hidden; h++) {
                    let net = 0;
                    for (let d = 0; d < x_in.length; d++) {
                        net += x_in[d] * this.W_oculta[d][h];
                    }
                    out_oculta.push(logistic(net));
                }
                
                // Add hidden bias term -1
                const out_oculta_bias = [-1, ...out_oculta];
                
                // Output layer
                let net_saida = 0;
                for (let h = 0; h < out_oculta_bias.length; h++) {
                    net_saida += out_oculta_bias[h] * this.W_saida[h][0];
                }
                const out_saida = logistic(net_saida);
                
                // Accumulate error
                const erro = y_desejado - out_saida;
                sumSqErr += erro * erro;
                
                // BACKWARD PASS
                const delta_saida = erro * logisticDerivative(out_saida);
                
                const delta_oculta = [];
                for (let h = 0; h < n_hidden; h++) {
                    // Ignore bias weight in backpropagation (W_saida starts from index 1 for actual hidden nodes)
                    const w_out = this.W_saida[h + 1][0];
                    const deriv = logisticDerivative(out_oculta[h]);
                    delta_oculta.push(delta_saida * w_out * deriv);
                }
                
                // Update output weights
                for (let h = 0; h < out_oculta_bias.length; h++) {
                    const grad = lr * out_oculta_bias[h] * delta_saida;
                    const update = grad + (momentum * this.delta_W_saida_ant[h][0]);
                    this.W_saida[h][0] += update;
                    this.delta_W_saida_ant[h][0] = update;
                }
                
                // Update hidden weights
                for (let d = 0; d < x_in.length; d++) {
                    for (let h = 0; h < n_hidden; h++) {
                        const grad = lr * x_in[d] * delta_oculta[h];
                        const update = grad + (momentum * this.delta_W_oculta_ant[d][h]);
                        this.W_oculta[d][h] += update;
                        this.delta_W_oculta_ant[d][h] = update;
                    }
                }
            }
            const mse = sumSqErr / this.X_train.length;
            this.history.push(mse);
            
        } else if (this.modelType.startsWith('pmc_relu') || this.modelType === 'pmc_lotes') {
            const batch_size = this.modelType === 'pmc_lotes' ? (this.hyperparams.batchSize || 32) : this.X_train.length;
            
            // Apply Learning Rate Decay for batch version
            if (this.modelType === 'pmc_lotes') {
                lr = lr_initial * Math.pow(0.95, this.epoch / 500);
            }
            
            const n_samples = this.X_train.length;
            
            // Create list of indices
            const indices = Array.from({ length: n_samples }, (_, i) => i);
            
            // Shuffle indices for mini-batches
            if (this.modelType === 'pmc_lotes') {
                for (let i = n_samples - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = indices[i];
                    indices[i] = indices[j];
                    indices[j] = temp;
                }
            }
            
            // Train in mini-batches and compute training MSE on the fly (saves full extra forward pass)
            let sumSqErr = 0;
            for (let start = 0; start < n_samples; start += batch_size) {
                const end = Math.min(start + batch_size, n_samples);
                const batch_indices = indices.slice(start, end);
                
                const X_batch = batch_indices.map(idx => this.X_train[idx]);
                const y_batch = batch_indices.map(idx => this.y_train[idx]);
                
                const ativ = this.forwardMLP(X_batch);
                this.backwardMLP(ativ, y_batch, lr);
                
                // Accumulate training error before weight update step (from the forward pass)
                const preds = ativ[ativ.length - 1];
                for (let i = 0; i < preds.length; i++) {
                    const err = preds[i][0] - y_batch[i];
                    sumSqErr += err * err;
                }
            }
            const mse = sumSqErr / n_samples;
            this.history.push(mse);
        }
        
        this.epoch++;
        
        // Check if finished
        const done = this.epoch >= this.maxEpochs;
        if (done) {
            this.running = false;
            // Save model weights and configuration globally
            activeModelWeights = this.saveWeights();
        }
        
        // Execute callback
        const currentLoss = this.history[this.history.length - 1];
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
        
        // Prepare first 10 predictions
        const testPreds = this.predictTestSet();
        
        this.callback(this.epoch, currentLoss, elapsed, testPreds, done);
    }
    
    predictTestSet() {
        const testPreds = [];
        const limit = Math.min(this.X_test.length, 10);
        
        if (this.modelType === 'adaline') {
            for (let i = 0; i < limit; i++) {
                const xi = this.X_test[i];
                let u = 0;
                for (let j = 0; j < xi.length; j++) {
                    u += this.w[j] * xi[j];
                }
                
                // Desnormalize Price
                const realPrice = this.y_raw[800 + i];
                const predPrice = u * (this.preco_max - this.preco_min) + this.preco_min;
                const err = Math.abs(realPrice - predPrice);
                
                testPreds.push({
                    line: this.test_indices[i],
                    real: realPrice,
                    pred: predPrice,
                    err: err,
                    errPct: (err / realPrice) * 100
                });
            }
        } else if (this.modelType === 'pmc1' || this.modelType === 'pmc2' || this.modelType === 'tdnn') {
            const n_hidden = this.modelType === 'pmc2' ? 15 : (this.modelType === 'tdnn' ? (this.hyperparams.hidden || 5) : 10);
            
            for (let i = 0; i < limit; i++) {
                const x_in = this.X_test[i];
                
                // Forward
                const out_oculta = [];
                for (let h = 0; h < n_hidden; h++) {
                    let net = 0;
                    for (let d = 0; d < x_in.length; d++) {
                        net += x_in[d] * this.W_oculta[d][h];
                    }
                    out_oculta.push(logistic(net));
                }
                const out_oculta_bias = [-1, ...out_oculta];
                let net_saida = 0;
                for (let h = 0; h < out_oculta_bias.length; h++) {
                    net_saida += out_oculta_bias[h] * this.W_saida[h][0];
                }
                const out_saida = logistic(net_saida);
                
                // Desnormalize Price
                const realPrice = this.modelType === 'tdnn' ? this.y_raw[500 + i] : this.y_raw[800 + i];
                const predPrice = out_saida * (this.preco_max - this.preco_min) + this.preco_min;
                const err = Math.abs(realPrice - predPrice);
                
                testPreds.push({
                    line: this.test_indices[i],
                    real: realPrice,
                    pred: predPrice,
                    err: err,
                    errPct: (err / realPrice) * 100
                });
            }
        } else if (this.modelType.startsWith('pmc_relu') || this.modelType === 'pmc_lotes') {
            const ativ = this.forwardMLP(this.X_test.slice(0, limit));
            const predictions = ativ[ativ.length - 1];
            
            for (let i = 0; i < limit; i++) {
                const norm_pred = predictions[i][0];
                const realPrice = this.y_raw[this.idx_teste[i]];
                
                // Desnormalize Price using Z-score
                const predPrice = (norm_pred * this.desvio_y) + this.media_y;
                const err = Math.abs(realPrice - predPrice);
                
                testPreds.push({
                    line: this.test_indices[i],
                    real: realPrice,
                    pred: predPrice,
                    err: err,
                    errPct: (err / realPrice) * 100
                });
            }
        }
        
        return testPreds;
    }
    
    saveWeights() {
        if (this.modelType === 'adaline') {
            return { w: [...this.w] };
        } else if (this.modelType === 'pmc1' || this.modelType === 'pmc2' || this.modelType === 'tdnn') {
            return {
                W_oculta: this.W_oculta.map(row => [...row]),
                W_saida: this.W_saida.map(row => [...row])
            };
        } else {
            return {
                pesos: this.pesos.map(layer => layer.map(row => [...row])),
                vieses: this.vieses.map(layer => layer.map(row => [...row]))
            };
        }
    }
}

// -------------------------------------------------------------
// TRAINER USER INTERFACE CONTROL
// -------------------------------------------------------------
const modelSelect = document.getElementById('model-select');
const btnStart = document.getElementById('btn-start-train');
const btnStop = document.getElementById('btn-stop-train');
const statusBadge = document.getElementById('training-status');

// Sliders and containers
const paramEpochs = document.getElementById('param-epochs');
const paramLr = document.getElementById('param-lr');
const paramMomentum = document.getElementById('param-momentum');
const paramBatch = document.getElementById('param-batch');
const paramDelay = document.getElementById('param-delay');

const valEpochs = document.getElementById('val-epochs');
const valLr = document.getElementById('val-lr');
const valMomentum = document.getElementById('val-momentum');
const valBatch = document.getElementById('val-batch');
const valDelay = document.getElementById('val-delay');

const modelDescText = document.getElementById('model-desc-text');

// Event listeners to update slider values text in UI
paramEpochs.oninput = function() { valEpochs.innerText = this.value; };
paramLr.oninput = function() { valLr.innerText = parseFloat(this.value).toFixed(4); };
paramMomentum.oninput = function() { valMomentum.innerText = parseFloat(this.value).toFixed(2); };
paramBatch.oninput = function() { valBatch.innerText = this.value; };
paramDelay.oninput = function() { valDelay.innerText = this.value; };

// Dynamic settings view update depending on selected model
modelSelect.onchange = function() {
    const type = this.value;
    
    // Hide all advanced inputs first
    document.getElementById('group-momentum').style.display = 'none';
    document.getElementById('group-batch').style.display = 'none';
    document.getElementById('group-delay').style.display = 'none';
    
    if (type === 'adaline') {
        paramEpochs.value = 1500;
        paramLr.value = 0.0025;
        modelDescText.innerText = "Rede Adaline linear (Regra Delta) com entrada Bias x0=-1. Utiliza normalização Min-Max dos dados (Brand, Year, Engine Size, Fuel Type, Transmission, Mileage) e prevê o preço de forma linear.";
    } else if (type === 'pmc1') {
        paramEpochs.value = 1500;
        paramLr.value = 0.1;
        modelDescText.innerText = "Perceptron Multicamadas (PMC) clássico com 10 neurônios ocultos e ativação Sigmóide. Sem fator de momentum, treinamento lento e seguro para regressão.";
    } else if (type === 'pmc2') {
        paramEpochs.value = 1500;
        paramLr.value = 0.1;
        document.getElementById('group-momentum').style.display = 'block';
        paramMomentum.value = 0.9;
        modelDescText.innerText = "Rede PMC com 15 neurônios ocultos e fator Momentum de 0.9. Acelera drasticamente a convergência do Backpropagation clássico.";
    } else if (type === 'tdnn') {
        paramEpochs.value = 1500;
        paramLr.value = 0.1;
        document.getElementById('group-delay').style.display = 'block';
        paramDelay.value = 5;
        modelDescText.innerText = "Rede de Atraso Temporal (TDNN). Prevê a série temporal do preço dos carros usando uma janela deslizante de atrasos 'p'. Utiliza 5 neurônios na oculta e momentum.";
    } else if (type.startsWith('pmc_relu')) {
        paramEpochs.value = 1500;
        paramLr.value = 0.001;
        document.getElementById('group-momentum').style.display = 'block';
        paramMomentum.value = 0.8;
        
        if (type === 'pmc_relu_rasa') {
            modelDescText.innerText = "Rede MLP Rasa (ReLU) [6 -> 5 -> 1] com Z-score. Arquitetura enxuta, podendo apresentar subajuste (Underfitting) para capturar variações do preço.";
        } else if (type === 'pmc_relu_ideal') {
            modelDescText.innerText = "Rede MLP Ideal (ReLU) [6 -> 16 -> 8 -> 1] com Z-score. Topologia com complexidade balanceada e taxa de erro ótima no conjunto de teste.";
        } else {
            modelDescText.innerText = "Rede MLP Profunda (ReLU) [6 -> 64 -> 32 -> 16 -> 1] com Z-score. Arquitetura altamente expressiva, propensa a sobreajuste (Overfitting) se treinada por muito tempo.";
        }
    } else if (type === 'pmc_lotes') {
        paramEpochs.value = 1500;
        paramLr.value = 0.005;
        document.getElementById('group-momentum').style.display = 'block';
        paramMomentum.value = 0.9;
        document.getElementById('group-batch').style.display = 'block';
        paramBatch.value = 32;
        modelDescText.innerText = "Rede MLP (ReLU) [6 -> 16 -> 8 -> 1] utilizando treinamento em Mini-lotes (Batch Size 32) e Decaimento Exponencial da Taxa de Aprendizado (0.95 a cada 500 épocas). Convergência extremamente rápida.";
    }
    
    // Trigger input update event to refresh labels text
    paramEpochs.oninput();
    paramLr.oninput();
    paramMomentum.oninput();
    paramDelay.oninput();
    paramBatch.oninput();
    
    updateModelRules(type);
};

function updateModelRules(type) {
    const rulesContent = document.getElementById('model-rules-content');
    const codeContent = document.getElementById('model-code-content');
    if (!rulesContent || !codeContent) return;
    
    let html = '';
    let codeText = '';
    
    if (type === 'adaline') {
        html = `
            <div><strong>Arquitetura:</strong> Entrada (7 neurônios: bias x0=-1 + 6 inputs normalizados Min-Max) &rarr; Saída (1 neurônio).</div>
            <div><strong>Ativação:</strong> Linear (g(u) = u). Sem função de ativação não-linear.</div>
            <div><strong>Algoritmo:</strong> Regra Delta Online (Padrão a Padrão / SGD). Os pesos são ajustados a cada registro processado.</div>
            <div><strong>Fórmula de Ajuste:</strong> w_novo = w_atual + &eta; * (y - y_pred) * x</div>
            <div><strong>Parâmetro Adicional:</strong> Bias fixo em x0 = -1.</div>
        `;
        codeText = `// Regra Delta Online (Padrão a Padrão) em app.js
for (let i = 0; i < this.X_train.length; i++) {
    const xi = this.X_train[i];
    let u = 0;
    
    // Produto Escalar (Entrada * Pesos)
    for (let j = 0; j < xi.length; j++) {
        u += this.w[j] * xi[j];
    }
    
    // Cálculo do Erro de Predição
    const erro = this.y_train[i] - u;
    sumSqErr += erro * erro;
    
    // Atualização dos Pesos (Delta Rule)
    for (let j = 0; j < xi.length; j++) {
        this.w[j] = this.w[j] + lr * erro * xi[j];
    }
}`;
    } else if (type === 'pmc1') {
        html = `
            <div><strong>Arquitetura:</strong> Entrada (7 neurônios: bias x0=-1 + 6 inputs normalizados Min-Max) &rarr; Camada Oculta (10 neurônios + bias -1) &rarr; Saída (1 neurônio com ativação Sigmóide).</div>
            <div><strong>Ativação:</strong> Sigmóide Logística (1 / (1 + e^-u)) em todas as camadas. Preço mapeado no intervalo [0, 1] e desnormalizado após predição.</div>
            <div><strong>Algoritmo:</strong> Backpropagation clássico Online (SGD).</div>
            <div><strong>Regra de Ajuste:</strong> Gradiente descendente simples sem momentum. Atualiza após cada amostra.</div>
        `;
        codeText = `// PMC Backpropagation clássico SGD (Online) em app.js
for (let i = 0; i < this.X_train.length; i++) {
    const x_in = this.X_train[i];
    const y_desejado = this.y_train[i];
    
    // FORWARD: Camada Oculta (Ativação Sigmóide)
    const out_oculta = [];
    for (let h = 0; h < n_hidden; h++) {
        let net = 0;
        for (let d = 0; d < x_in.length; d++) {
            net += x_in[d] * this.W_oculta[d][h];
        }
        out_oculta.push(1 / (1 + Math.exp(-net)));
    }
    const out_oculta_bias = [-1, ...out_oculta]; // Bias -1
    
    // FORWARD: Camada de Saída (Ativação Sigmóide)
    let net_saida = 0;
    for (let h = 0; h < out_oculta_bias.length; h++) {
        net_saida += out_oculta_bias[h] * this.W_saida[h][0];
    }
    const out_saida = 1 / (1 + Math.exp(-net_saida));
    
    // BACKWARD: Gradientes da Saída
    const erro = y_desejado - out_saida;
    const delta_saida = erro * out_saida * (1 - out_saida);
    
    // Ajuste simples de pesos (Sem Momentum)
    // W_saida = W_saida + lr * out_oculta_bias * delta_saida
}`;
    } else if (type === 'pmc2') {
        html = `
            <div><strong>Arquitetura:</strong> Entrada (7 neurônios: bias x0=-1 + 6 inputs normalizados Min-Max) &rarr; Camada Oculta (15 neurônios + bias -1) &rarr; Saída (1 neurônio com ativação Sigmóide).</div>
            <div><strong>Ativação:</strong> Sigmóide Logística em todas as camadas. Mapeamento de preço desnormalizado para R$.</div>
            <div><strong>Algoritmo:</strong> Backpropagation com termo de Momentum (&alpha; = 0.90).</div>
            <div><strong>Fórmula de Ajuste:</strong> &Delta;w(t) = &eta; * &delta; * x + &alpha; * &Delta;w(t-1) (Evita oscilações bruscas e acelera convergência).</div>
        `;
        codeText = `// PMC Backpropagation Online com Momentum (0.90) em app.js
for (let i = 0; i < this.X_train.length; i++) {
    const x_in = this.X_train[i];
    const y_desejado = this.y_train[i];
    
    // ... Forward pass idêntico ...
    
    // BACKWARD com termo de Momentum &alpha;
    const erro = y_desejado - out_saida;
    const delta_saida = erro * out_saida * (1 - out_saida);
    
    // Atualização dos pesos da Saída com Momentum
    for (let h = 0; h < out_oculta_bias.length; h++) {
        const grad = lr * out_oculta_bias[h] * delta_saida;
        const update = grad + (momentum * this.delta_W_saida_ant[h][0]);
        this.W_saida[h][0] += update;
        this.delta_W_saida_ant[h][0] = update; // Armazena termo de momentum
    }
    // ... atualização semelhante para a camada Oculta ...
}`;
    } else if (type === 'tdnn') {
        html = `
            <div><strong>Arquitetura:</strong> Série Temporal com Atrasos. Entrada correspondente a uma janela de atrasos 'p' de preços anteriores (p = 5 por padrão) &rarr; Oculta (5 neurônios com Sigmóide) &rarr; Saída (1 neurônio com Sigmóide).</div>
            <div><strong>Regra de Treino:</strong> Backpropagation com termo de Momentum (&alpha; = 0.80). Os preços são previstos passo a passo na série temporal.</div>
        `;
        codeText = `// TDNN - Janela Deslizante de Atrasos Temporais 'p' em app.js
for (let i = 0; i < this.X_train.length; i++) {
    // Vetor de entrada x_in é a série de preços anteriores: 
    // [y(t-1), y(t-2), ..., y(t-p)]
    const x_in = this.X_train[i]; 
    const y_desejado = this.y_train[i]; // Preço no instante atual y(t)
    
    // Propagação do sinal via pesos temporais na oculta
    const out_oculta = [];
    for (let h = 0; h < n_hidden; h++) {
        let net = 0;
        for (let d = 0; d < x_in.length; d++) {
            net += x_in[d] * this.W_oculta[d][h];
        }
        out_oculta.push(1 / (1 + Math.exp(-net)));
    }
    // ... Backpropagation clássico atualiza pesos de atraso ...
}`;
    } else if (type.startsWith('pmc_relu')) {
        let topology = '';
        if (type === 'pmc_relu_rasa') topology = '6 inputs &rarr; Oculta (5) &rarr; Saída (1)';
        else if (type === 'pmc_relu_ideal') topology = '6 inputs &rarr; Oculta 1 (16) &rarr; Oculta 2 (8) &rarr; Saída (1)';
        else topology = '6 inputs &rarr; Oculta 1 (64) &rarr; Oculta 2 (32) &rarr; Oculta 3 (16) &rarr; Saída (1)';
        
        html = `
            <div><strong>Topologia:</strong> ${topology}</div>
            <div><strong>Ativações:</strong> Ocultas: <strong>ReLU (Rectified Linear Unit)</strong> (max(0, u)). Saída: <strong>Linear</strong>. Permite predizer diretamente valores monetários sem compressão sigmoidal.</div>
            <div><strong>Normalização:</strong> Z-Score das entradas (Brand, Year, Engine_Size, Fuel_Type, Transmission, Mileage, Owners, Doors).</div>
            <div><strong>Inicialização:</strong> He Initialization (randn * sqrt(2/n_inputs)), ideal para ReLU para evitar desvanecimento de gradientes.</div>
            <div><strong>Algoritmo:</strong> Gradient Descent em lote completo (Full Batch GD).</div>
        `;
        codeText = `// MLP Batch GD com ativação ReLU e saída Linear em app.js
// FORWARD PASS
let current_layer = X_batch; // Matriz de dados
for (let l = 0; l < L - 1; l++) {
    const next_layer = [];
    const h_size = vieses[l][0].length;
    
    for (let r = 0; r < X_prev.length; r++) {
        const row = [];
        for (let c = 0; c < h_size; c++) {
            let net = vieses[l][0][c];
            for (let k = 0; k < in_size; k++) {
                net += X_prev[r][k] * pesos[l][k][c];
            }
            row.push(Math.max(0, net)); // Ativação ReLU
        }
        next_layer.push(row);
    }
    current_layer = next_layer;
}
// BACKWARD PASS: Derivada da ReLU = net > 0 ? 1 : 0
// Saída Linear: Derivada = 1 (Regressão numérica direta)`;
    } else if (type === 'pmc_lotes') {
        html = `
            <div><strong>Topologia:</strong> 6 inputs &rarr; Oculta 1 (16) &rarr; Oculta 2 (8) &rarr; Saída (1) com ativação ReLU nas ocultas e Linear na saída.</div>
            <div><strong>Treinamento:</strong> Mini-lotes (Batch Size = 32). Embaralha os índices a cada época para evitar viés.</div>
            <div><strong>Taxa de Aprendizado:</strong> Decaimento Exponencial (&eta;_t = &eta;_0 * 0.95^(época / 500)). Reduz o passo conforme a rede se aproxima do mínimo local, melhorando a precisão final.</div>
            <div><strong>Normalização:</strong> Z-score. Inicialização de pesos "He".</div>
        `;
        codeText = `// MLP Mini-lotes (Mini-Batch SGD) & LR Decay em app.js
const batch_size = 32;

// Decaimento exponencial da taxa de aprendizado (&eta;):
lr = lr_initial * Math.pow(0.95, this.epoch / 500);

// Embaralha índices da base de dados a cada época
for (let i = n_samples - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
}

// Executa em sub-lotes de tamanho 32
for (let start = 0; start < n_samples; start += batch_size) {
    const end = Math.min(start + batch_size, n_samples);
    const batch_indices = indices.slice(start, end);
    
    const X_batch = batch_indices.map(idx => this.X_train[idx]);
    const y_batch = batch_indices.map(idx => this.y_train[idx]);
    
    const ativ = this.forwardMLP(X_batch);
    this.backwardMLP(ativ, y_batch, lr);
}`;
    }
    rulesContent.innerHTML = html;
    codeContent.innerText = codeText;
}

// Start Training click
btnStart.onclick = function() {
    if (currentTrainingJob && currentTrainingJob.running) return;
    
    const type = modelSelect.value;
    const hyperparams = {
        epochs: parseInt(paramEpochs.value),
        lr: parseFloat(paramLr.value),
        momentum: parseFloat(paramMomentum.value),
        batchSize: parseInt(paramBatch.value),
        delay: parseInt(paramDelay.value),
        hidden: type === 'tdnn' ? (parseInt(paramDelay.value) === 5 ? 5 : parseInt(paramDelay.value)) : 10
    };
    
    btnStart.disabled = true;
    btnStop.disabled = false;
    modelSelect.disabled = true;
    statusBadge.innerText = 'Treinando...';
    statusBadge.className = 'badge badge-amber';
    
    // Reset indicators
    const currentEpochUI = document.getElementById('train-current-epoch');
    const currentLossUI = document.getElementById('train-current-loss');
    const currentTimeUI = document.getElementById('train-current-time');
    
    let chartHistory = [];
    
    currentTrainingJob = new TrainingJob(type, hyperparams, (epoch, loss, elapsed, testPreds, done) => {
        // UI updates
        currentEpochUI.innerText = epoch;
        currentLossUI.innerText = loss.toFixed(6);
        currentTimeUI.innerText = `${elapsed}s`;
        
        // Push loss to chart
        chartHistory.push(loss);
        
        // Update Chart
        if (epoch % 5 === 0 || done) {
            drawLossChart(chartHistory);
            updateTestTable(testPreds);
        }
        
        if (done) {
            btnStart.disabled = false;
            btnStop.disabled = true;
            modelSelect.disabled = false;
            statusBadge.innerText = 'Concluído';
            statusBadge.className = 'badge badge-emerald';
            
            // Save trained model specs to Predictor Page
            activeTrainedModel = {
                type: type,
                mse: loss,
                norm: activeNormalizationData,
                weights: activeModelWeights
            };
            
            updatePredictorSpecs();
        }
    });
    
    // Training execution loop chunked using animation frame to prevent page freezing!
    // Training execution loop chunked using animation frame to prevent page freezing!
    function loop() {
        if (currentTrainingJob && currentTrainingJob.running) {
            // Run dynamically scaled number of epochs per frame to keep UI fully responsive at 60fps!
            let epochsPerFrame = 5;
            if (type === 'adaline') epochsPerFrame = 12;
            else if (type === 'pmc1' || type === 'pmc2' || type === 'tdnn') epochsPerFrame = 6;
            else if (type === 'pmc_relu_rasa') epochsPerFrame = 5;
            else if (type === 'pmc_relu_ideal') epochsPerFrame = 3;
            else if (type === 'pmc_relu_profunda') epochsPerFrame = 1;
            else if (type === 'pmc_lotes') epochsPerFrame = 2;

            for (let k = 0; k < epochsPerFrame; k++) {
                if (currentTrainingJob.running) {
                    currentTrainingJob.step();
                }
            }
            requestAnimationFrame(loop);
        }
    }
    
    requestAnimationFrame(loop);
};

// Stop training click
btnStop.onclick = function() {
    if (currentTrainingJob) {
        currentTrainingJob.running = false;
        btnStart.disabled = false;
        btnStop.disabled = true;
        modelSelect.disabled = false;
        statusBadge.innerText = 'Interrompido';
        statusBadge.className = 'badge badge-rose';
    }
};

function updateTestTable(preds) {
    const tbody = document.getElementById('test-predictions-table').querySelector('tbody');
    let html = '';
    
    preds.forEach(p => {
        const sign = p.err >= 0 ? '' : '-';
        html += `<tr>
            <td>#${p.line}</td>
            <td>R$ ${p.real.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="color: var(--accent-indigo); font-weight:600;">R$ ${p.pred.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="color: var(--accent-rose); font-weight:500;">R$ ${p.err.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${p.errPct.toFixed(2)}%</td>
        </tr>`;
    });
    
    tbody.innerHTML = html;
}

// -------------------------------------------------------------
// PREDICTOR CALCULATION & INTERACTION
// -------------------------------------------------------------
function updatePredictorSpecs() {
    const resModel = document.getElementById('res-model-used');
    const specModel = document.getElementById('res-spec-model');
    const specMse = document.getElementById('res-spec-mse');
    const specFeatures = document.getElementById('res-spec-features');
    
    if (!activeTrainedModel) {
        resModel.innerText = 'Nenhum modelo ativo';
        specModel.innerText = '-';
        specMse.innerText = '-';
        specFeatures.innerText = '-';
        return;
    }
    
    resModel.innerText = 'Modelo Treinado Pronto';
    
    let modelName = modelSelect.options[modelSelect.selectedIndex].text;
    specModel.innerText = modelName;
    specMse.innerText = activeTrainedModel.mse.toFixed(6);
    specFeatures.innerText = activeTrainedModel.norm.features.join(', ');
    
    // Dynamic Form Field Visibility
    const activeFeatures = activeTrainedModel.norm.features;
    
    document.getElementById('pred-group-brand').style.opacity = activeFeatures.includes('Brand') ? '1' : '0.4';
    document.getElementById('pred-group-transmission').style.opacity = activeFeatures.includes('Transmission') ? '1' : '0.4';
    document.getElementById('pred-group-doors').style.opacity = activeFeatures.includes('Doors') ? '1' : '0.4';
    document.getElementById('pred-group-owners').style.opacity = activeFeatures.includes('Owner_Count') ? '1' : '0.4';
    
    document.getElementById('inp-brand').disabled = !activeFeatures.includes('Brand');
    document.getElementById('inp-transmission').disabled = !activeFeatures.includes('Transmission');
    document.getElementById('inp-doors').disabled = !activeFeatures.includes('Doors');
    document.getElementById('inp-owners').disabled = !activeFeatures.includes('Owner_Count');
}

// Predict button action
document.getElementById('btn-predict-price').onclick = function() {
    if (!activeTrainedModel) {
        alert('Você precisa treinar um modelo de inteligência artificial primeiro na aba "Treinamento de Redes"!');
        return;
    }
    
    // Retrieve inputs from the form
    const brand = document.getElementById('inp-brand').value;
    const year = parseFloat(document.getElementById('inp-year').value);
    const engine = parseFloat(document.getElementById('inp-engine').value);
    const fuel = document.getElementById('inp-fuel').value;
    const transmission = document.getElementById('inp-transmission').value;
    const mileage = parseFloat(document.getElementById('inp-mileage').value);
    const doors = parseFloat(document.getElementById('inp-doors').value);
    const owners = parseFloat(document.getElementById('inp-owners').value);
    
    const norm = activeTrainedModel.norm;
    const type = activeTrainedModel.type;
    const weights = activeTrainedModel.weights;
    
    let predictedPrice = 0;
    
    if (type === 'adaline' || type === 'pmc1' || type === 'pmc2') {
        // Encoding alphabetical
        const brandCode = brandList.indexOf(brand);
        const fuelCode = fuelList.indexOf(fuel);
        const transCode = transmissionList.indexOf(transmission);
        
        const raw_vector = [brandCode, year, engine, fuelCode, transCode, mileage];
        
        // Normalize Min-Max
        const x_norm = [];
        for (let j = 0; j < raw_vector.length; j++) {
            const min = norm.mins[j];
            const max = norm.maxs[j];
            x_norm.push(max - min === 0 ? 0 : (raw_vector[j] - min) / (max - min));
        }
        
        // Add bias -1
        const x_bias = [-1, ...x_norm];
        
        if (type === 'adaline') {
            let u = 0;
            for (let j = 0; j < x_bias.length; j++) {
                u += weights.w[j] * x_bias[j];
            }
            predictedPrice = u * (norm.preco_max - norm.preco_min) + norm.preco_min;
        } else {
            // PMC Sigmoid
            const n_hidden = type === 'pmc2' ? 15 : 10;
            const out_oculta = [];
            for (let h = 0; h < n_hidden; h++) {
                let net = 0;
                for (let d = 0; d < x_bias.length; d++) {
                    net += x_bias[d] * weights.W_oculta[d][h];
                }
                out_oculta.push(logistic(net));
            }
            
            const out_oculta_bias = [-1, ...out_oculta];
            let net_saida = 0;
            for (let h = 0; h < out_oculta_bias.length; h++) {
                net_saida += out_oculta_bias[h] * weights.W_saida[h][0];
            }
            const out_saida = logistic(net_saida);
            
            predictedPrice = out_saida * (norm.preco_max - norm.preco_min) + norm.preco_min;
        }
        
    } else if (type.startsWith('pmc_relu') || type === 'pmc_lotes') {
        // Encoding manual fuel
        const fuelCode = manualFuelMapping[fuel];
        const raw_vector = [year, engine, fuelCode, mileage, owners, doors];
        
        // Z-score normalize
        const x_norm = [];
        for (let j = 0; j < raw_vector.length; j++) {
            x_norm.push((raw_vector[j] - norm.means[j]) / norm.stds[j]);
        }
        
        // Forward MLP with ReLU
        // Let's compute layer by layer
        let current_layer = [x_norm]; // Shape 1 x n_features
        const L = weights.pesos.length;
        
        // Hidden Layers
        for (let l = 0; l < L - 1; l++) {
            const next_layer = [];
            const h_size = weights.vieses[l][0].length;
            const in_size = current_layer[0].length;
            
            const row = [];
            for (let c = 0; c < h_size; c++) {
                let net = weights.vieses[l][0][c];
                for (let r = 0; r < in_size; r++) {
                    net += current_layer[0][r] * weights.pesos[l][r][c];
                }
                row.push(Math.max(0, net)); // ReLU
            }
            next_layer.push(row);
            current_layer = next_layer;
        }
        
        // Output Layer (Linear)
        const i_out = L - 1;
        const in_size = current_layer[0].length;
        let final_net = weights.vieses[i_out][0][0];
        for (let r = 0; r < in_size; r++) {
            final_net += current_layer[0][r] * weights.pesos[i_out][r][0];
        }
        
        // Desnormalize
        predictedPrice = (final_net * norm.desvio_y) + norm.media_y;
        
    } else if (type === 'tdnn') {
        // TDNN relies on previous sequence, for calculator we estimate a static test case 
        // with default average price inputs to showcase window.
        // We will mock it using the average price from the dataset to construct inputs.
        const p = norm.p;
        const avgPrice = (norm.preco_max + norm.preco_min) / 2;
        const mockSequence = new Array(p).fill(avgPrice);
        
        // Normalize sequence
        const x_norm = mockSequence.map(y => (y - norm.preco_min) / (norm.preco_max - norm.preco_min));
        const x_bias = [-1, ...x_norm];
        
        // PMC Forward
        const n_hidden = weights.W_oculta[0].length;
        const out_oculta = [];
        for (let h = 0; h < n_hidden; h++) {
            let net = 0;
            for (let d = 0; d < x_bias.length; d++) {
                net += x_bias[d] * weights.W_oculta[d][h];
            }
            out_oculta.push(logistic(net));
        }
        const out_oculta_bias = [-1, ...out_oculta];
        let net_saida = 0;
        for (let h = 0; h < out_oculta_bias.length; h++) {
            net_saida += out_oculta_bias[h] * weights.W_saida[h][0];
        }
        const out_saida = logistic(net_saida);
        predictedPrice = out_saida * (norm.preco_max - norm.preco_min) + norm.preco_min;
    }
    
    // Ensure price is not negative
    predictedPrice = Math.max(0, predictedPrice);
    
    // Count-up animation for the evaluated price
    animatePriceOutput(predictedPrice);
};

function animatePriceOutput(target) {
    const el = document.getElementById('res-price-value');
    let current = 0;
    const duration = 800; // ms
    const startTime = performance.now();
    
    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        // Ease-out quad
        const ease = progress * (2 - progress);
        current = target * ease;
        el.innerText = `R$ ${current.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

// Run initial change trigger to configure UI and load rules on startup
modelSelect.onchange();
