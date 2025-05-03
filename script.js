let chestOpenSound = new Audio();
let chestCloseSound = new Audio();

chestOpenSound.src = 'sounds/chest_open.ogg';
chestCloseSound.src = 'sounds/chest_close.ogg';

const startButton = document.getElementById('startButton');
const camera = document.getElementById('camera');
const lightCanvas = document.getElementById('lightCanvas');
const lightLevelDisplay = document.getElementById('lightLevel');
const statusDisplay = document.getElementById('status');
const sensitivitySlider = document.getElementById('sensitivity');
const sensitivityValue = document.getElementById('sensitivityValue');

let ctx = lightCanvas.getContext('2d');
let stream = null;
let isActive = false;
let previousLightLevel = 0;
let sensitivity = 10;
let isChestOpen = false;
let lightCheckInterval = null;

sensitivitySlider.addEventListener('input', () => {
    sensitivity = parseInt(sensitivitySlider.value);
    sensitivityValue.textContent = sensitivity;
});

startButton.addEventListener('click', async () => {
    if (isActive) {
        stopCamera();
        return;
    }
    
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' }
            }
        });
        
        camera.srcObject = stream;
        await camera.play();
        
        isActive = true;
        startButton.textContent = 'Stop Camera';
        statusDisplay.textContent = 'Active - monitoring light levels';
        
        lightCheckInterval = setInterval(detectLightLevel, 200);
    } catch (error) {
        console.error('Error accessing camera:', error);
        statusDisplay.textContent = `Error: ${error.message}`;
    }
});

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        camera.srcObject = null;
    }
    
    if (lightCheckInterval) {
        clearInterval(lightCheckInterval);
    }
    
    isActive = false;
    startButton.textContent = 'Start Camera';
    statusDisplay.textContent = 'Not active';
}

function detectLightLevel() {
    if (!isActive || !camera.videoWidth) return;
    
    ctx.drawImage(camera, 0, 0, 1, 1);
    
    const pixelData = ctx.getImageData(0, 0, 1, 1).data;
    
    const brightness = Math.round((pixelData[0] + pixelData[1] + pixelData[2]) / 3);
    
    lightLevelDisplay.textContent = brightness;
    
    const lightDifference = brightness - previousLightLevel;
    
    if (lightDifference > sensitivity && !isChestOpen) {
        playChestOpenSound();
        isChestOpen = true;
    }
    else if (lightDifference < -sensitivity && isChestOpen) {
        playChestCloseSound();
        isChestOpen = false;
    }
    
    previousLightLevel = brightness;
}

function playChestOpenSound() {
    chestOpenSound.currentTime = 0;
    chestOpenSound.play().catch(error => console.error('Error playing open sound:', error));
    console.log('Chest opened!');
}

function playChestCloseSound() {
    chestCloseSound.currentTime = 0;
    chestCloseSound.play().catch(error => console.error('Error playing close sound:', error));
    console.log('Chest closed!');
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden && isActive) {
        clearInterval(lightCheckInterval);
        statusDisplay.textContent = 'Paused - page in background';
    } else if (!document.hidden && isActive) {
        lightCheckInterval = setInterval(detectLightLevel, 200);
        statusDisplay.textContent = 'Active - monitoring light levels';
    }
});

window.addEventListener('beforeunload', () => {
    stopCamera();
});
