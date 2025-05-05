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

const detectionInterval = 500; 

// Update sensitivity value display
sensitivitySlider.addEventListener('input', () => {
    sensitivity = parseInt(sensitivitySlider.value);
    sensitivityValue.textContent = sensitivity;
});

async function applyMinimalCameraConstraints(track) {
    try {
        // Apply only the most essential constraints
        const constraints = {
            width: { ideal: 320 },  // Lower resolution for better performance
            height: { ideal: 240 }
        };
        
        await track.applyConstraints(constraints);
        
        try {
            await track.applyConstraints({
                focusMode: "manual"
            });
        } catch (e) {
            // Silently fail if focus mode isn't supported
        }
    } catch (error) {
        // Silently fail if constraints aren't supported
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
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 320 },  // Lower resolution for better performance
                height: { ideal: 240 }
            }
        });
        
        // Set video source and start playing
        camera.srcObject = stream;
        await camera.play();
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            applyMinimalCameraConstraints(videoTrack);
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
            previousLightLevel = parseInt(lightLevelDisplay.textContent || '0');
            
            // Start light detection with increased interval for better performance
            lightCheckInterval = setInterval(detectLightLevel, detectionInterval);
        }, 500); // Reduced stabilization time for faster startup
    } catch (error) {
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
    
    try {
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
    
    const silentSound = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0; // Silent
    silentSound.connect(gainNode);
    gainNode.connect(audioContext.destination);
    silentSound.start(0);
    silentSound.stop(0.001);
}

// Play chest open sound with iOS compatibility
function playChestOpenSound() {
    chestOpenSound.currentTime = 0;
    
    const playPromise = chestOpenSound.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            if (error.name === 'NotAllowedError') {
                unlockAudio();
                
                setTimeout(() => {
                    chestOpenSound.play().catch(() => {
                        console.log('Still unable to play sound');
                    });
                }, 100);
            }
        });
    }
}

// Play chest close sound with iOS compatibility
function playChestCloseSound() {
    chestCloseSound.currentTime = 0;
    
    const playPromise = chestCloseSound.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            if (error.name === 'NotAllowedError') {
                unlockAudio();
                
                setTimeout(() => {
                    chestCloseSound.play().catch(() => {
                        console.log('Still unable to play sound');
                    });
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
    
    forceIOSAudioUnlock();
    
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
    forceIOSAudioUnlock();
});
