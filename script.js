// Audio elements for chest sounds
let chestOpenSound = new Audio();
let chestCloseSound = new Audio();

// Set audio sources
chestOpenSound.src = 'sounds/chest_open.ogg';
chestCloseSound.src = 'sounds/chest_close.ogg';

// DOM elements
const startButton = document.getElementById('startButton');
const camera = document.getElementById('camera');
const lightCanvas = document.getElementById('lightCanvas');
const lightLevelDisplay = document.getElementById('lightLevel');
const statusDisplay = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivityValue');

// Canvas context
let ctx = lightCanvas.getContext('2d');

// Variables for camera and light detection
let stream = null;
let isActive = false;
let sensitivity = 10;
let isChestOpen = false;
let lightCheckInterval = null;
let previousLightLevel = 0;

// Cooldown timer to prevent rapid triggering
let lastTriggerTime = 0;
const triggerCooldown = 2000; // 2 seconds cooldown between triggers

// Update sensitivity value display
sensitivitySlider.addEventListener('input', () => {
    sensitivity = parseInt(sensitivitySlider.value);
    sensitivityValue.textContent = sensitivity;
});

// Apply camera constraints to disable auto-focus and auto-exposure
async function applyAdvancedCameraConstraints(track) {
    try {
        const capabilities = track.getCapabilities();
        const settings = {};
        
        console.log('Camera capabilities:', capabilities);
        
        // Disable auto focus if supported
        if (capabilities.focusMode && capabilities.focusMode.includes('manual')) {
            settings.focusMode = 'manual';
            if (capabilities.focusDistance) {
                settings.focusDistance = capabilities.focusDistance.max;
            }
        }
        
        // Disable auto exposure if supported
        if (capabilities.exposureMode && capabilities.exposureMode.includes('manual')) {
            settings.exposureMode = 'manual';
            if (capabilities.exposureTime) {
                // Set a fixed exposure time
                const midExposure = (capabilities.exposureTime.max + capabilities.exposureTime.min) / 2;
                settings.exposureTime = midExposure;
            }
        }
        
        // Lock white balance if supported
        if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('manual')) {
            settings.whiteBalanceMode = 'manual';
        }
        
        // Apply the constraints if we have any settings to apply
        if (Object.keys(settings).length > 0) {
            await track.applyConstraints({ advanced: [settings] });
            console.log('Applied advanced camera settings:', settings);
        } else {
            console.log('Camera does not support manual controls');
        }
    } catch (error) {
        console.error('Error applying advanced camera constraints:', error);
    }
}

// Start camera and light detection
startButton.addEventListener('click', async () => {
    if (isActive) {
        stopCamera();
        return;
    }
    
    try {
        // Request camera with preference for the environment-facing (back) camera
        // and with manual focus and exposure if possible
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                // Try to disable auto focus and auto exposure at the getUserMedia level
                focusMode: { ideal: 'manual' },
                exposureMode: { ideal: 'manual' },
                whiteBalanceMode: { ideal: 'manual' }
            }
        });
        
        // Set video source and start playing
        camera.srcObject = stream;
        await camera.play();
        
        // Get video track and apply advanced constraints
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            await applyAdvancedCameraConstraints(videoTrack);
        }
        
        // Reset variables
        previousLightLevel = 0;
        lastTriggerTime = 0;
        
        // Update UI
        isActive = true;
        startButton.textContent = 'Stop Camera';
        statusDisplay.textContent = 'Active - monitoring light levels';
        
        // Wait a moment for camera to stabilize before starting detection
        setTimeout(() => {
            // Get initial light level
            detectLightLevel();
            previousLightLevel = parseInt(lightLevelDisplay.textContent);
            
            // Start light detection
            lightCheckInterval = setInterval(detectLightLevel, 200);
        }, 1000);
    } catch (error) {
        console.error('Error accessing camera:', error);
        statusDisplay.textContent = `Error: ${error.message}`;
    }
});

// Stop camera and light detection
function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        camera.srcObject = null;
    }
    
    if (lightCheckInterval) {
        clearInterval(lightCheckInterval);
    }
    
    // Update UI
    isActive = false;
    startButton.textContent = 'Start Camera';
    statusDisplay.textContent = 'Not active';
}

// Detect light level from camera feed
function detectLightLevel() {
    if (!isActive || !camera.videoWidth) return;
    
    // Draw current video frame to canvas
    ctx.drawImage(camera, 0, 0, 1, 1);
    
    // Get pixel data
    const pixelData = ctx.getImageData(0, 0, 1, 1).data;
    
    // Calculate brightness (simple average of RGB)
    const brightness = Math.round((pixelData[0] + pixelData[1] + pixelData[2]) / 3);
    
    // Update display
    lightLevelDisplay.textContent = brightness;
    
    // Check if we're in the cooldown period
    const currentTime = Date.now();
    if (currentTime - lastTriggerTime < triggerCooldown) {
        return;
    }
    
    // Calculate light difference
    const lightDifference = brightness - previousLightLevel;
    
    // If light increased significantly (chest opened)
    if (lightDifference > sensitivity && !isChestOpen) {
        playChestOpenSound();
        isChestOpen = true;
        lastTriggerTime = currentTime;
        console.log(`Light increased by ${lightDifference} (from ${previousLightLevel} to ${brightness})`);
    }
    // If light decreased significantly (chest closed)
    else if (lightDifference < -sensitivity && isChestOpen) {
        playChestCloseSound();
        isChestOpen = false;
        lastTriggerTime = currentTime;
        console.log(`Light decreased by ${Math.abs(lightDifference)} (from ${previousLightLevel} to ${brightness})`);
    }
    
    // Update previous light level (only if not in cooldown period)
    if (currentTime - lastTriggerTime >= triggerCooldown) {
        previousLightLevel = brightness;
    }
}

// Play chest open sound
function playChestOpenSound() {
    chestOpenSound.currentTime = 0;
    chestOpenSound.play().catch(error => console.error('Error playing open sound:', error));
    console.log('Chest opened!');
}

// Play chest close sound
function playChestCloseSound() {
    chestCloseSound.currentTime = 0;
    chestCloseSound.play().catch(error => console.error('Error playing close sound:', error));
    console.log('Chest closed!');
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isActive) {
        // Page is hidden, pause light detection but keep camera running
        clearInterval(lightCheckInterval);
        statusDisplay.textContent = 'Paused - page in background';
    } else if (!document.hidden && isActive) {
        // Page is visible again, resume light detection
        lightCheckInterval = setInterval(detectLightLevel, 200);
        statusDisplay.textContent = 'Active - monitoring light levels';
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopCamera();
});
