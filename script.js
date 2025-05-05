const chestOpenSound = document.getElementById('chestOpenSound');
const chestCloseSound = document.getElementById('chestCloseSound');

// DOM elements
const startButton = document.getElementById('startButton');
const camera = document.getElementById('camera');
const lightCanvas = document.getElementById('lightCanvas');
const lightLevelDisplay = document.getElementById('lightLevel');
const statusDisplay = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivityValue');
const testSoundButton = document.getElementById('testSoundButton');
const soundStatus = document.getElementById('soundStatus');

// Canvas context
let ctx = lightCanvas.getContext('2d', { willReadFrequently: true });

// Variables for camera and light detection
let stream = null;
let isActive = false;
let sensitivity = 10;
let isChestOpen = false;
let lightCheckInterval = null;
let previousLightLevel = 0;
let isAndroid = /Android/i.test(navigator.userAgent);
let isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Cooldown timer to prevent rapid triggering
let lastTriggerTime = 0;
const triggerCooldown = 2000; // 2 seconds cooldown between triggers

const detectionInterval = isAndroid ? 1000 : 500;

// Update sensitivity value display
sensitivitySlider.addEventListener('input', () => {
    sensitivity = parseInt(sensitivitySlider.value);
    sensitivityValue.textContent = sensitivity;
});

async function applyAdvancedCameraConstraints(track) {
    try {
        // First apply basic resolution constraints for performance
        const resolutionConstraints = {
            width: { ideal: isAndroid ? 160 : 320 },
            height: { ideal: isAndroid ? 120 : 240 }
        };
        
        await track.applyConstraints(resolutionConstraints);
        
        // Get camera capabilities to check what's supported
        const capabilities = track.getCapabilities();
        statusDisplay.textContent = 'Applying camera controls...';
        
        const advancedConstraints = {};
        
        // Apply focus controls if supported
        if (capabilities && capabilities.focusMode && 
            capabilities.focusMode.includes('manual')) {
            advancedConstraints.focusMode = 'manual';
            
            // Set focus distance if supported
            if (capabilities.focusDistance) {
                const min = capabilities.focusDistance.min || 0;
                const max = capabilities.focusDistance.max || 1;
                // Set to a middle-distance focus that works well for chest detection
                advancedConstraints.focusDistance = (min + max) / 2;
            }
        }
        
        // Apply exposure controls if supported
        if (capabilities && capabilities.exposureMode && 
            capabilities.exposureMode.includes('manual')) {
            advancedConstraints.exposureMode = 'manual';
            
            // Set exposure compensation if supported
            if (capabilities.exposureCompensation) {
                const min = capabilities.exposureCompensation.min || -2;
                const max = capabilities.exposureCompensation.max || 2;
                // Set to a middle value that works well for chest detection
                advancedConstraints.exposureCompensation = (min + max) / 2;
            }
        }
        
        // Apply white balance controls if supported
        if (capabilities && capabilities.whiteBalanceMode && 
            capabilities.whiteBalanceMode.includes('manual')) {
            advancedConstraints.whiteBalanceMode = 'manual';
        }
        
        if (Object.keys(advancedConstraints).length > 0) {
            await track.applyConstraints(advancedConstraints);
            statusDisplay.textContent = 'Camera controls applied';
        } else {
            statusDisplay.textContent = 'Advanced camera controls not supported';
        }
    } catch (error) {
        statusDisplay.textContent = `Camera control error: ${error.name}`;
        console.error('Error applying camera constraints:', error);
    }
}

// Start camera and light detection
startButton.addEventListener('click', async () => {
    if (isActive) {
        stopCamera();
        return;
    }
    
    try {
        statusDisplay.textContent = 'Starting camera...';
        
        // Request camera with preference for the environment-facing (back) camera
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: isAndroid ? 160 : 320 },
                height: { ideal: isAndroid ? 120 : 240 }
            }
        });
        
        // Set video source and start playing
        camera.srcObject = stream;
        await camera.play();
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            const settings = videoTrack.getSettings();
            console.log('Camera settings:', settings);
            
            await applyAdvancedCameraConstraints(videoTrack);
        }
        
        // Reset variables
        previousLightLevel = 0;
        lastTriggerTime = 0;
        
        // Update UI
        isActive = true;
        startButton.textContent = 'Stop Camera';
        
        const stabilizationTime = isAndroid ? 300 : 500;
        
        // Wait a moment for camera to stabilize before starting detection
        setTimeout(() => {
            // Get initial light level
            detectLightLevel();
            previousLightLevel = parseInt(lightLevelDisplay.textContent || '0');
            
            // Start light detection with optimized interval
            lightCheckInterval = setInterval(detectLightLevel, detectionInterval);
            statusDisplay.textContent = 'Active - monitoring light levels';
        }, stabilizationTime);
    } catch (error) {
        statusDisplay.textContent = `Error: ${error.message}`;
        console.error('Camera error:', error);
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

// Performance-optimized light level detection
function detectLightLevel() {
    if (!isActive || !camera.videoWidth) return;
    
    try {
        // Draw current video frame to canvas (1x1 pixel for efficiency)
        ctx.drawImage(camera, 0, 0, 1, 1);
        
        // Get pixel data
        const pixelData = ctx.getImageData(0, 0, 1, 1).data;
        
        // Calculate brightness (simple average of RGB)
        const brightness = Math.round((pixelData[0] + pixelData[1] + pixelData[2]) / 3);
        
        // Update display (only on non-Android or every other frame on Android)
        if (!isAndroid || Date.now() % 2 === 0) {
            lightLevelDisplay.textContent = brightness;
        }
        
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
        }
        // If light decreased significantly (chest closed)
        else if (lightDifference < -sensitivity && isChestOpen) {
            playChestCloseSound();
            isChestOpen = false;
            lastTriggerTime = currentTime;
        }
        
        // Update previous light level (only if not in cooldown period)
        if (currentTime - lastTriggerTime >= triggerCooldown) {
            previousLightLevel = brightness;
        }
    } catch (e) {
    }
}

let audioContext = null;

function unlockAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    if (isIOS) {
        const silentSound = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0; // Silent
        silentSound.connect(gainNode);
        gainNode.connect(audioContext.destination);
        silentSound.start(0);
        silentSound.stop(0.001);
    }
}

function playChestOpenSound() {
    chestOpenSound.currentTime = 0;
    
    const playPromise = chestOpenSound.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            if (error.name === 'NotAllowedError' && isIOS) {
                unlockAudio();
                
                setTimeout(() => {
                    chestOpenSound.play().catch(() => {});
                }, 100);
            }
        });
    }
}

function playChestCloseSound() {
    chestCloseSound.currentTime = 0;
    
    const playPromise = chestCloseSound.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            if (error.name === 'NotAllowedError' && isIOS) {
                unlockAudio();
                
                setTimeout(() => {
                    chestCloseSound.play().catch(() => {});
                }, 100);
            }
        });
    }
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isActive) {
        // Page is hidden, pause light detection but keep camera running
        clearInterval(lightCheckInterval);
        statusDisplay.textContent = 'Paused - page in background';
    } else if (!document.hidden && isActive) {
        // Page is visible again, resume light detection
        lightCheckInterval = setInterval(detectLightLevel, detectionInterval);
        statusDisplay.textContent = 'Active - monitoring light levels';
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopCamera();
});

function forceIOSAudioUnlock() {
    if (!isIOS) return;
    
    unlockAudio();
    
    const originalVolumeOpen = chestOpenSound.volume;
    const originalVolumeClose = chestCloseSound.volume;
    
    chestOpenSound.volume = 0;
    chestCloseSound.volume = 0;
    
    chestOpenSound.play().catch(() => {});
    chestCloseSound.play().catch(() => {});
    
    setTimeout(() => {
        chestOpenSound.volume = originalVolumeOpen;
        chestCloseSound.volume = originalVolumeClose;
    }, 100);
    
    document.body.addEventListener('touchstart', function iosUnlockOnTouch() {
        unlockAudio();
        document.body.removeEventListener('touchstart', iosUnlockOnTouch);
    }, { once: true });
}

testSoundButton.addEventListener('click', () => {
    soundStatus.textContent = "Attempting to play sound...";
    soundStatus.style.color = "blue";
    
    if (isIOS) {
        forceIOSAudioUnlock();
    }
    
    chestOpenSound.currentTime = 0;
    const playPromise = chestOpenSound.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            soundStatus.textContent = "Sound played successfully!";
            soundStatus.style.color = "green";
        }).catch(error => {
            soundStatus.textContent = `Error: ${error.name}. Trying again...`;
            soundStatus.style.color = "red";
            
            unlockAudio();
            
            setTimeout(() => {
                chestOpenSound.currentTime = 0;
                chestOpenSound.play().then(() => {
                    soundStatus.textContent = "Sound played on second attempt!";
                    soundStatus.style.color = "green";
                }).catch(secondError => {
                    soundStatus.textContent = `Failed: ${secondError.name}. Try tapping screen first.`;
                    soundStatus.style.color = "red";
                });
            }, 300);
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    if (isIOS) {
        forceIOSAudioUnlock();
    }
});
