// Game configuration
const config = {
    gridSizeX: 160, // Number of cells in X dimension (width)
    gridSizeY: 90,  // Number of cells in Y dimension (height)
    cellSize: 0.2, // Size of each cell
    spacing: 0.01, // Spacing between cells
    aliveColor: 0xffffff, // White for alive cells
    deadColor: 0x222222, // Dark gray for dead cells
    updateInterval: 100, // Milliseconds between updates
    zoomLevel: 10 // Controls the visual size of cells (lower = bigger cells)
};

// Game state
let scene, camera, renderer;
let grid = [];
let isRunning = false;
let intervalId = null;
let mouseDown = false;
let lastCellToggled = { row: -1, col: -1 }; // Track last toggled cell to prevent toggling the same cell repeatedly
let settingsUpdateTimeout = null; // For debouncing settings updates
let isEraseMode = false; // False = draw mode (add cells), True = erase mode (remove cells)

// Calculate total grid width and height
let gridWidth = config.gridSizeX * (config.cellSize + config.spacing) - config.spacing;
let gridHeight = config.gridSizeY * (config.cellSize + config.spacing) - config.spacing;

// Initialize Three.js scene
function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Create camera with fixed zoom based on cell size rather than grid size
    setupCamera();

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('gameCanvas').appendChild(renderer.domElement);

    // Create grid of cells
    createGrid();

    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    
    // Set up settings panel and controls
    setupSettingsPanel();
    
    // Add keyboard controls
    window.addEventListener('keydown', onKeyDown);

    // Start animation loop
    animate();
}

// Setup camera with consistent zoom level
function setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    // Use fixed viewSize based on cell size instead of grid dimensions
    const viewSize = config.zoomLevel;
    
    camera = new THREE.OrthographicCamera(
        -viewSize * aspect / 2, 
        viewSize * aspect / 2,
        viewSize / 2, 
        -viewSize / 2,
        0.1, 
        1000
    );
    camera.position.z = 5;
}

// Setup the settings panel and event listeners
function setupSettingsPanel() {
    // Settings toggle
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsContainer = document.getElementById('settingsContainer');
    
    settingsToggle.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
        settingsToggle.classList.toggle('active');
    });
    
    // Start/reset buttons
    document.getElementById('startBtn').addEventListener('click', toggleSimulation);
    document.getElementById('resetBtn').addEventListener('click', resetGrid);
    
    // Set up draw/erase mode toggle
    const drawModeToggle = document.getElementById('drawModeToggle');
    drawModeToggle.addEventListener('change', function() {
        isEraseMode = this.checked;
        
        // Update the label text
        const toggleText = this.nextElementSibling.nextElementSibling;
        toggleText.textContent = isEraseMode ? 'Erase' : 'Draw';
    });
    
    // Set up slider value displays
    const sliders = ['gridSizeX', 'gridSizeY', 'cellSize', 'updateInterval'];
    sliders.forEach(sliderId => {
        const slider = document.getElementById(sliderId);
        const valueDisplay = document.getElementById(`${sliderId}Value`);
        
        // Initial value display
        valueDisplay.textContent = slider.value;
        
        // Update value display on slider change
        slider.addEventListener('input', function() {
            valueDisplay.textContent = this.value;
            
            // Debounce updates to avoid performance issues
            clearTimeout(settingsUpdateTimeout);
            settingsUpdateTimeout = setTimeout(() => {
                updateSettingsFromPanel();
            }, 100);
        });
    });
    
    // Setup color inputs
    const colorInputs = document.querySelectorAll('#settingsPanel input[type="color"]');
    colorInputs.forEach(input => {
        input.addEventListener('input', function() {
            updateSettingsFromPanel(['aliveColor', 'deadColor']);
        });
    });
    
    // Initialize settings panel values
    initSettingsPanel();
}

// Initialize settings panel with current values
function initSettingsPanel() {
    document.getElementById('gridSizeX').value = config.gridSizeX;
    document.getElementById('gridSizeXValue').textContent = config.gridSizeX;
    
    document.getElementById('gridSizeY').value = config.gridSizeY;
    document.getElementById('gridSizeYValue').textContent = config.gridSizeY;
    
    document.getElementById('cellSize').value = config.cellSize;
    document.getElementById('cellSizeValue').textContent = config.cellSize;
    
    document.getElementById('updateInterval').value = config.updateInterval;
    document.getElementById('updateIntervalValue').textContent = config.updateInterval;
    
    document.getElementById('aliveColor').value = '#' + config.aliveColor.toString(16).padStart(6, '0');
    document.getElementById('deadColor').value = '#' + config.deadColor.toString(16).padStart(6, '0');
}

// Update settings from panel inputs
function updateSettingsFromPanel(onlyProperties = null) {
    // Store previous settings to check if we need to recreate the grid
    const prevSettings = {
        gridSizeX: config.gridSizeX,
        gridSizeY: config.gridSizeY,
        cellSize: config.cellSize,
        spacing: config.spacing,
        updateInterval: config.updateInterval
    };
    
    // Only update the specified properties or all properties
    const updateAll = !onlyProperties;
    
    if (updateAll || onlyProperties && onlyProperties.includes('gridSizeX')) {
        config.gridSizeX = parseInt(document.getElementById('gridSizeX').value);
    }
    
    if (updateAll || onlyProperties && onlyProperties.includes('gridSizeY')) {
        config.gridSizeY = parseInt(document.getElementById('gridSizeY').value);
    }
    
    if (updateAll || onlyProperties && onlyProperties.includes('cellSize')) {
        config.cellSize = parseFloat(document.getElementById('cellSize').value);
        // Adjust zoom level when cell size changes to keep visual size consistent
        config.zoomLevel = 2 / config.cellSize; // This creates an inverse relationship
    }
    
    if (updateAll || onlyProperties && onlyProperties.includes('updateInterval')) {
        config.updateInterval = parseInt(document.getElementById('updateInterval').value);
        
        // Update interval if simulation is running
        if (isRunning) {
            clearInterval(intervalId);
            intervalId = setInterval(updateGrid, config.updateInterval);
        }
    }
    
    // Update colors
    if (updateAll || onlyProperties && onlyProperties.includes('aliveColor')) {
        const aliveColorHex = document.getElementById('aliveColor').value;
        config.aliveColor = parseInt(aliveColorHex.substring(1), 16);
    }
    
    if (updateAll || onlyProperties && onlyProperties.includes('deadColor')) {
        const deadColorHex = document.getElementById('deadColor').value;
        config.deadColor = parseInt(deadColorHex.substring(1), 16);
    }
    
    // Always recalculate grid dimensions
    gridWidth = config.gridSizeX * (config.cellSize + config.spacing) - config.spacing;
    gridHeight = config.gridSizeY * (config.cellSize + config.spacing) - config.spacing;
    
    // Check if only colors need to be updated
    const needsRecreation = (
        prevSettings.gridSizeX !== config.gridSizeX ||
        prevSettings.gridSizeY !== config.gridSizeY ||
        prevSettings.cellSize !== config.cellSize
    );
    
    if (needsRecreation) {
        // Full grid recreation needed
        recreateGrid();
    } else if ((onlyProperties && (onlyProperties.includes('aliveColor') || onlyProperties.includes('deadColor')))) {
        // Just update colors
        updateCellColors();
    }
}

// Update just the colors of all cells
function updateCellColors() {
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
            const cell = grid[i][j];
            cell.mesh.material.color.set(cell.state ? config.aliveColor : config.deadColor);
        }
    }
}

// Create the grid of cells
function createGrid() {
    const geometry = new THREE.BoxGeometry(config.cellSize, config.cellSize, config.cellSize);
    const deadMaterial = new THREE.MeshBasicMaterial({ color: config.deadColor });
    const aliveMaterial = new THREE.MeshBasicMaterial({ color: config.aliveColor });

    // Calculate starting position to center the grid
    const startX = -gridWidth / 2 + config.cellSize / 2;
    const startY = gridHeight / 2 - config.cellSize / 2;

    // Create a 2D array for the grid
    grid = new Array(config.gridSizeY);
    for (let i = 0; i < config.gridSizeY; i++) {
        grid[i] = new Array(config.gridSizeX);
        
        for (let j = 0; j < config.gridSizeX; j++) {
            const cell = {
                state: 0, // 0 = dead, 1 = alive
                mesh: new THREE.Mesh(geometry, deadMaterial.clone()),
                nextState: 0 // For calculating the next generation
            };

            const x = startX + j * (config.cellSize + config.spacing);
            const y = startY - i * (config.cellSize + config.spacing);
            
            cell.mesh.position.set(x, y, 0);
            scene.add(cell.mesh);
            grid[i][j] = cell;
        }
    }
}

// Reset the grid to all dead cells
function resetGrid() {
    for (let i = 0; i < config.gridSizeY; i++) {
        for (let j = 0; j < config.gridSizeX; j++) {
            setCell(i, j, 0);
        }
    }
    
    if (isRunning) {
        toggleSimulation(); // Stop the simulation
    }
    
    // Reset last toggled cell
    lastCellToggled = { row: -1, col: -1 };
}

// Toggle cell state (0 = dead, 1 = alive)
function setCell(row, col, state) {
    if (row < 0 || row >= config.gridSizeY || col < 0 || col >= config.gridSizeX) {
        return;
    }
    
    const cell = grid[row][col];
    cell.state = state;
    cell.mesh.material.color.set(state ? config.aliveColor : config.deadColor);
}

// Toggle the cell state based on current draw/erase mode
function toggleCell(row, col) {
    if (row < 0 || row >= config.gridSizeY || col < 0 || col >= config.gridSizeX) {
        return;
    }
    
    const cell = grid[row][col];
    
    // In draw mode, always set to alive; in erase mode, always set to dead
    const newState = isEraseMode ? 0 : 1;
    
    // Only change if different from current state to avoid visual flickering
    if (cell.state !== newState) {
        setCell(row, col, newState);
    }
}

// Start or stop the simulation
function toggleSimulation() {
    isRunning = !isRunning;
    
    const startBtn = document.getElementById('startBtn');
    const settingsContainer = document.getElementById('settingsContainer');
    const settingsPanel = document.getElementById('settingsPanel');
    
    if (isRunning) {
        startBtn.textContent = 'Pause';
        intervalId = setInterval(updateGrid, config.updateInterval);
        
        // Hide settings when simulation starts
        settingsPanel.classList.add('hidden');
        settingsContainer.classList.add('hidden');
    } else {
        startBtn.textContent = 'Start';
        clearInterval(intervalId);
        
        // Show settings when simulation stops
        settingsContainer.classList.remove('hidden');
    }
}

// Update the grid based on Conway's Game of Life rules
function updateGrid() {
    // Calculate next state for each cell
    for (let i = 0; i < config.gridSizeY; i++) {
        for (let j = 0; j < config.gridSizeX; j++) {
            const liveNeighbors = countLiveNeighbors(i, j);
            const cell = grid[i][j];
            
            if (cell.state === 1) {
                // Live cell rules
                cell.nextState = (liveNeighbors === 2 || liveNeighbors === 3) ? 1 : 0;
            } else {
                // Dead cell rules
                cell.nextState = (liveNeighbors === 3) ? 1 : 0;
            }
        }
    }
    
    // Apply the next state
    for (let i = 0; i < config.gridSizeY; i++) {
        for (let j = 0; j < config.gridSizeX; j++) {
            const cell = grid[i][j];
            if (cell.state !== cell.nextState) {
                setCell(i, j, cell.nextState);
            }
        }
    }
}

// Count the number of live neighbors for a cell
function countLiveNeighbors(row, col) {
    let count = 0;
    
    // Check all 8 neighbors (including diagonals)
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            // Skip the cell itself
            if (i === 0 && j === 0) continue;
            
            const r = row + i;
            const c = col + j;
            
            // Check bounds
            if (r >= 0 && r < config.gridSizeY && c >= 0 && c < config.gridSizeX) {
                count += grid[r][c].state;
            }
        }
    }
    
    return count;
}

// Recreate the entire grid
function recreateGrid() {
    // Remember simulation state
    const wasRunning = isRunning;
    if (isRunning) {
        toggleSimulation();
    }
    
    // Remove all existing cells
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
            scene.remove(grid[i][j].mesh);
        }
    }
    
    // Update camera with consistent zoom
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = config.zoomLevel;
    
    camera.left = -viewSize * aspect / 2;
    camera.right = viewSize * aspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    camera.updateProjectionMatrix();
    
    // Recreate grid
    createGrid();
    
    // If simulation was running, restart it
    if (wasRunning) {
        toggleSimulation();
    }
}

// Animate the scene
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Handle window resize
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const viewSize = config.zoomLevel;
    
    camera.left = -viewSize * aspect / 2;
    camera.right = viewSize * aspect / 2;
    camera.top = viewSize / 2;
    camera.bottom = -viewSize / 2;
    
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Handle mouse events for drawing cells
function onMouseDown(event) {
    mouseDown = true;
    handleMouseInteraction(event);
}

function onMouseUp() {
    mouseDown = false;
    lastCellToggled = { row: -1, col: -1 }; // Reset tracking
}

function onMouseMove(event) {
    if (mouseDown) {
        handleMouseInteraction(event);
    }
}

function handleMouseInteraction(event) {
    // Skip if simulation is running
    if (isRunning) return;
    
    const rect = renderer.domElement.getBoundingClientRect();
    
    // Get mouse position in normalized device coordinates (-1 to +1)
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Create a raycaster for picking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(
        (mouseX / rect.width) * 2 - 1,
        -(mouseY / rect.height) * 2 + 1
    );
    
    raycaster.setFromCamera(mouse, camera);
    
    // Find intersected objects - create a dummy plane for intersection
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const intersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersection);
    
    // Calculate grid position from world position
    const halfGridWidth = gridWidth / 2;
    const halfGridHeight = gridHeight / 2;
    
    const gridX = Math.floor((intersection.x + halfGridWidth) / (config.cellSize + config.spacing));
    const gridY = Math.floor((halfGridHeight - intersection.y) / (config.cellSize + config.spacing));
    
    // Toggle cell if within bounds and not the same as last toggled cell
    if (gridX >= 0 && gridX < config.gridSizeX && gridY >= 0 && gridY < config.gridSizeY) {
        // Check if this is a new cell to toggle
        if (gridY !== lastCellToggled.row || gridX !== lastCellToggled.col) {
            toggleCell(gridY, gridX);
            lastCellToggled.row = gridY;
            lastCellToggled.col = gridX;
        }
    }
}

// Handle keyboard controls
function onKeyDown(event) {
    switch(event.code) {
        case 'Space':
            // Toggle simulation with space bar
            event.preventDefault();
            toggleSimulation();
            break;
        case 'Escape':
            // Reset grid with escape key
            event.preventDefault();
            resetGrid();
            
            // Show settings if they were hidden
            document.getElementById('settingsContainer').classList.remove('hidden');
            break;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init); 