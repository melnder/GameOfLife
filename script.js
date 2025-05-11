// Game configuration
const config = {
    spacing: 1, // Spacing between cells in pixels
    aliveColor: 0xffffff, // White for alive cells
    deadColor: 0x222222, // Dark gray for dead cells
    updateInterval: 100, // Milliseconds between updates
    isWidescreen: true, // 16:9 ratio (true) or 9:16 ratio (false)
    cellSizeFactor: 5, // 1-9: From small cells to large cells
    maxGridSize: 100 // Safety limit to prevent browser crashes
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
let gridWidth, gridHeight, gridSizeX, gridSizeY, cellSize;
// Create reusable objects for ray casting to avoid garbage collection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const intersection = new THREE.Vector3();

// Initialize Three.js scene
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('gameCanvas').appendChild(renderer.domElement);

    // Calculate initial grid dimensions
    calculateGridDimensions();
    
    // Create camera
    setupCamera();
    
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

// Calculate grid dimensions based on aspect ratio and cell size
function calculateGridDimensions() {
    // Calculate the grid dimensions in pixels
    gridWidth = window.innerWidth;
    gridHeight = window.innerHeight;

    if(!config.isWidescreen) {
        gridWidth = gridHeight * (9/16);
    }

    cellSize =  Math.min(gridWidth, gridHeight) * ((config.cellSizeFactor + 1) / 100);
    console.log("Cell size: ", cellSize);
    // Calculate grid size in cells (with a safety limit)
    gridSizeX = Math.min(Math.floor(gridWidth / cellSize), config.maxGridSize);
    gridSizeY = Math.min(Math.floor(gridHeight / cellSize), config.maxGridSize);
}

// Setup camera
function setupCamera() {
    // Simple camera setup for 2D rendering
    camera = new THREE.OrthographicCamera(
        window.innerWidth / -2,
        window.innerWidth / 2,
        window.innerHeight / 2,
        window.innerHeight / -2,
        0.1,
        1000
    );
    camera.position.z = 100;
    camera.lookAt(0, 0, 0);
}

// Setup the settings panel and event listeners
function setupSettingsPanel() {
    // Settings toggle
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel = document.getElementById('settingsPanel');
    
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
    
    // Set up aspect ratio toggle
    const aspectRatioToggle = document.getElementById('aspectRatioToggle');
    aspectRatioToggle.addEventListener('change', function() {
        config.isWidescreen = !this.checked;
        
        // Update the label text
        const toggleText = this.nextElementSibling.nextElementSibling;
        toggleText.textContent = config.isWidescreen ? '16:9' : '9:16';
        calculateGridDimensions();
        recreateGrid();
    });
    
    // Set up grid size preset slider
    const gridSizePresetSlider = document.getElementById('gridSizePreset');
    const gridSizePresetValue = document.getElementById('gridSizePresetValue');
    
    // Initial value display
    gridSizePresetValue.textContent = gridSizePresetSlider.value;
    
    // Update on change
    gridSizePresetSlider.addEventListener('input', function() {
        const size = parseInt(this.value);
        config.cellSizeFactor = size;
        gridSizePresetValue.textContent = size;
        
        // Debounce updates to avoid performance issues
        clearTimeout(settingsUpdateTimeout);
        settingsUpdateTimeout = setTimeout(() => {
            calculateGridDimensions();
            recreateGrid();
        }, 100);
    });
    
    // Set up update interval slider
    const updateIntervalSlider = document.getElementById('updateInterval');
    const updateIntervalValue = document.getElementById('updateIntervalValue');
    
    // Initial value display
    updateIntervalValue.textContent = updateIntervalSlider.value;
    
    // Update on change
    updateIntervalSlider.addEventListener('input', function() {
        updateIntervalValue.textContent = this.value;
        
        // Debounce updates to avoid performance issues
        clearTimeout(settingsUpdateTimeout);
        settingsUpdateTimeout = setTimeout(() => {
            config.updateInterval = parseInt(this.value);
            
            // Update interval if simulation is running
            if (isRunning) {
                clearInterval(intervalId);
                intervalId = setInterval(updateGrid, config.updateInterval);
            }
        }, 100);
    });
    
    // Setup color inputs
    const colorInputs = document.querySelectorAll('#settingsPanel input[type="color"]');
    colorInputs.forEach(input => {
        input.addEventListener('input', function() {
            if (this.id === 'aliveColor') {
                config.aliveColor = parseInt(this.value.substring(1), 16);
            } else if (this.id === 'deadColor') {
                config.deadColor = parseInt(this.value.substring(1), 16);
            }
            
            updateCellColors();
        });
    });
    
    // Initialize settings panel values
    initSettingsPanel();
}

// Initialize settings panel with current values
function initSettingsPanel() {
    // Aspect ratio toggle
    const aspectRatioToggle = document.getElementById('aspectRatioToggle');
    aspectRatioToggle.checked = !config.isWidescreen;
    const toggleText = aspectRatioToggle.nextElementSibling.nextElementSibling;
    toggleText.textContent = config.isWidescreen ? '16:9' : '9:16';
    
    // Grid size preset
    document.getElementById('gridSizePreset').value = config.gridSizePreset;
    document.getElementById('gridSizePresetValue').textContent = config.gridSizePreset;
    
    // Update interval
    document.getElementById('updateInterval').value = config.updateInterval;
    document.getElementById('updateIntervalValue').textContent = config.updateInterval;
    
    // Colors
    document.getElementById('aliveColor').value = '#' + config.aliveColor.toString(16).padStart(6, '0');
    document.getElementById('deadColor').value = '#' + config.deadColor.toString(16).padStart(6, '0');
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
    // Common geometry for all cells - use BoxGeometry for better visibility
    const geometry = new THREE.BoxGeometry(cellSize - config.spacing, cellSize - config.spacing, 1);
    const deadMaterial = new THREE.MeshBasicMaterial({ color: config.deadColor });
    
    // Calculate total grid size
    const totalGridWidth = cellSize * gridSizeX;
    const totalGridHeight = cellSize * gridSizeY;
    
    // Calculate starting position to center the grid
    const startX = -totalGridWidth / 2 + cellSize / 2;
    const startY = totalGridHeight / 2 - cellSize / 2;

    // Create a 2D array for the grid
    grid = new Array(gridSizeY);
    for (let i = 0; i < gridSizeY; i++) {
        grid[i] = new Array(gridSizeX);
        
        for (let j = 0; j < gridSizeX; j++) {
            const cell = {
                state: 0, // 0 = dead, 1 = alive
                mesh: new THREE.Mesh(geometry, deadMaterial.clone()),
                nextState: 0 // For calculating the next generation
            };

            const x = startX + j * cellSize;
            const y = startY - i * cellSize;
            
            cell.mesh.position.set(x, y, 0);
            scene.add(cell.mesh);
            grid[i][j] = cell;
        }
    }
}

// Reset the grid to all dead cells
function resetGrid() {
    for (let i = 0; i < gridSizeY; i++) {
        for (let j = 0; j < gridSizeX; j++) {
            setCell(i, j, 0);
        }
    }
    
    if (isRunning) {
        toggleSimulation(); // Stop the simulation
    }
}

// Toggle cell state (0 = dead, 1 = alive)
function setCell(row, col, state) {
    if (row < 0 || row >= gridSizeY || col < 0 || col >= gridSizeX) {
        return;
    }
    
    const cell = grid[row][col];
    cell.state = state;
    cell.mesh.material.color.set(state ? config.aliveColor : config.deadColor);
}

// Toggle the cell state based on current draw/erase mode
function toggleCell(row, col) {
    if (row < 0 || row >= gridSizeY || col < 0 || col >= gridSizeX) {
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
    for (let i = 0; i < gridSizeY; i++) {
        for (let j = 0; j < gridSizeX; j++) {
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
    for (let i = 0; i < gridSizeY; i++) {
        for (let j = 0; j < gridSizeX; j++) {
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
            if (r >= 0 && r < gridSizeY && c >= 0 && c < gridSizeX) {
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
            // Dispose of materials and geometries to prevent memory leaks
            if (grid[i][j].mesh.material) {
                grid[i][j].mesh.material.dispose();
            }
            if (grid[i][j].mesh.geometry) {
                grid[i][j].mesh.geometry.dispose();
            }
        }
    }
    
    // Recalculate grid dimensions
    calculateGridDimensions();
    
    // Update camera
    setupCamera();
    
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
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Recalculate grid dimensions and recreate grid
    calculateGridDimensions();
    recreateGrid();
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
    
    mouse.x = (mouseX / rect.width) * 2 - 1;
    mouse.y = -(mouseY / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Find intersected objects with the plane
    if (raycaster.ray.intersectPlane(plane, intersection)) {
        // Calculate the total grid size
        const totalGridWidth = cellSize * gridSizeX;
        const totalGridHeight = cellSize * gridSizeY;
        
        // Convert world position to grid coordinates
        const gridX = Math.floor((intersection.x + totalGridWidth / 2) / cellSize);
        const gridY = Math.floor((totalGridHeight / 2 - intersection.y) / cellSize);
        
        // Toggle cell if within bounds and not the same as last toggled cell
        if (gridX >= 0 && gridX < gridSizeX && gridY >= 0 && gridY < gridSizeY) {
            // Check if this is a new cell to toggle
            if (gridY !== lastCellToggled.row || gridX !== lastCellToggled.col) {
                toggleCell(gridY, gridX);
                lastCellToggled.row = gridY;
                lastCellToggled.col = gridX;
            }
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