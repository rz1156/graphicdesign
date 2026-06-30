const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fpsCounter = document.getElementById("fps-counter");

// Offscreen canvas untuk pemrosesan blur yang disesuaikan tingkat kelembutannya
const offscreenCanvas = document.createElement("canvas");
const offscreenCtx = offscreenCanvas.getContext("2d");

// ===== STATE CONFIGURATION & HIGH ACCURACY SMOOTHING =====
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;
let globalTime = 0;
let isProcessingAI = false;

const hudFrame = {
    topLeft:     { x: 0, y: 0, targetX: 0, targetY: 0 },
    bottomLeft:  { x: 0, y: 0, targetX: 0, targetY: 0 },
    topRight:    { x: 0, y: 0, targetX: 0, targetY: 0 },
    bottomRight: { x: 0, y: 0, targetX: 0, targetY: 0 },
    opacity: 0, 
    isValid: false
};

// Inisialisasi MediaPipe Hands
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,          // Kunci di 0 agar deteksi matematika super enteng & FPS naik tajam
    minDetectionConfidence: 0.5, 
    minTrackingConfidence: 0.5
});

hands.onResults(onHandResults);

// Mengunci resolusi input AI di skala ringan agar melesat mencapai 40-50 FPS tanpa delay
const camera = new Camera(video, {
    onFrame: async () => {
        if (!isProcessingAI && video.readyState >= 2) {
            isProcessingAI = true;
            await hands.send({ image: video });
            isProcessingAI = false;
        }
    },
    width: 640,
    height: 360
});
camera.start();

// ===== ULTRA SMOOTH LERP (RESPONS ULTRA CEPAT) =====
function adaptiveLerp(current, target) {
    const distance = Math.hypot(target.x - current.x, target.y - current.y);
    
    let lerpFactor = 0.38; 
    if (distance < 3) {
        lerpFactor = 0.15; 
    } else if (distance > 12) {
        lerpFactor = 0.85; // Menempel instan di ujung jari saat bergerak cepat (No-Lag)
    }
    
    current.x += (target.x - current.x) * lerpFactor;
    current.y += (target.y - current.y) * lerpFactor;
}

// ===== INDEPENDENT RENDER LOOP =====
function processAnimation() {
    if (video.videoWidth && video.videoHeight) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (hudFrame.opacity > 0) {
        adaptiveLerp(hudFrame.topLeft, { x: hudFrame.topLeft.targetX, y: hudFrame.topLeft.targetY });
        adaptiveLerp(hudFrame.bottomLeft, { x: hudFrame.bottomLeft.targetX, y: hudFrame.bottomLeft.targetY });
        adaptiveLerp(hudFrame.topRight, { x: hudFrame.topRight.targetX, y: hudFrame.topRight.targetY });
        adaptiveLerp(hudFrame.bottomRight, { x: hudFrame.bottomRight.targetX, y: hudFrame.bottomRight.targetY });
        
        renderCyberHUDFrame();
    }

    frameCount++;
    const now = performance.now();
    globalTime = now * 0.002;
    if (now - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = now;
        fpsCounter.innerText = `SYS_FPS: ${fps}`;
    }

    requestAnimationFrame(processAnimation);
}
requestAnimationFrame(processAnimation);


// ===== PIPELINE DATA TRACKING ASINKRON =====
function onHandResults(results) {
    let leftHand = null;
    let rightHand = null;

    if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((landmarks, index) => {
            const label = results.multiHandedness[index].label; 
            
            // Render kustom manual berupa lingkaran titik minimalis warna Biru Neon
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "rgba(0, 216, 255, 0.8)";
            ctx.lineWidth = 2;

            // Gambar sendi pergelangan dan jari secara manual & sangat ringan
            landmarks.forEach((pt) => {
                const px = pt.x * canvas.width;
                const py = pt.y * canvas.height;
                ctx.beginPath();
                ctx.arc(px, py, 3, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            });

            if (label === "Left") leftHand = landmarks;
            if (label === "Right") rightHand = landmarks;
        });
    }

    if (leftHand && rightHand) {
        hudFrame.isValid = true;
        
        hudFrame.topLeft.targetX     = leftHand[8].x * canvas.width;
        hudFrame.topLeft.targetY     = leftHand[8].y * canvas.height;
        hudFrame.bottomLeft.targetX  = leftHand[4].x * canvas.width;
        hudFrame.bottomLeft.targetY  = leftHand[4].y * canvas.height;

        hudFrame.topRight.targetX    = rightHand[8].x * canvas.width;
        hudFrame.topRight.targetY    = rightHand[8].y * canvas.height;
        hudFrame.bottomRight.targetX = rightHand[4].x * canvas.width;
        hudFrame.bottomRight.targetY = rightHand[4].y * canvas.height;
        
        hudFrame.opacity = Math.min(1, hudFrame.opacity + 0.2); 
    } else {
        hudFrame.isValid = false;
        hudFrame.opacity = Math.max(0, hudFrame.opacity - 0.15); 
    }
}

// ===== ADVANCED CANVAS RENDERING API =====
function renderCyberHUDFrame() {
    ctx.save();
    ctx.globalAlpha = hudFrame.opacity;

    const pTL = hudFrame.topLeft;
    const pBL = hudFrame.bottomLeft;
    const pTR = hudFrame.topRight;
    const pBR = hudFrame.bottomRight;

    // --- FITUR A: HIGH PERFORMANCE SMOOTH BLUR MASKING ---
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.clip(); 

    // PERBAIKAN UTAMA: Mengubah pixelSize menjadi 350. 
    // Struktur pikselasi diperkecil secara ekstrem agar efek blur menjadi sangat samar, 
    // jernih, transparan, dan tidak lagi menghalangi objek video di belakangnya.
    const pixelSize = 350; 
    offscreenCanvas.width = Math.max(1, canvas.width / pixelSize);
    offscreenCanvas.height = Math.max(1, canvas.height / pixelSize);
    
    offscreenCtx.imageSmoothingEnabled = true; 
    offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);
    
    // Lapisan overlay biru neon yang dibuat semakin transparan (0.02) agar visual makin jernih
    ctx.fillStyle = "rgba(0, 216, 255, 0.02)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Efek Scanlines Transparan
    const scanlineY = (performance.now() * 0.05) % canvas.height;
    ctx.strokeStyle = "rgba(0, 216, 255, 0.03)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, scanlineY);
    ctx.lineTo(canvas.width, scanlineY);
    ctx.stroke();
    ctx.restore();

    // --- FITUR B: DYNAMIC CONNECTING LINES ---
    const glowIntensity = 4 + Math.sin(globalTime * 4) * 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.shadowBlur = glowIntensity;
    ctx.shadowColor = "#00d8ff";

    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();
    ctx.stroke();

    // --- FITUR C: HUD SIKU POINTER (BENTUK L DI UJUNG JARI) ---
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 5;
    ctx.shadowColor = "#00d8ff";
    
    const avgDist = Math.hypot(pTR.x - pTL.x, pTR.y - pTL.y) * 0.12;
    const len = Math.max(10, Math.min(25, avgDist)); 

    ctx.beginPath();
    ctx.moveTo(pTL.x + len, pTL.y); ctx.lineTo(pTL.x, pTL.y); ctx.lineTo(pTL.x, pTL.y + len);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pTR.x - len, pTR.y); ctx.lineTo(pTR.x, pTR.y); ctx.lineTo(pTR.x, pTR.y + len);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pBR.x - len, pBR.y); ctx.lineTo(pBR.x, pBR.y); ctx.lineTo(pBR.x, pBR.y - len);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pBL.x + len, pBL.y); ctx.lineTo(pBL.x, pBL.y); ctx.lineTo(pBL.x, pBL.y - len);
    ctx.stroke();

    // Teks Indikator Box "RIZ_PROJECT"
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px monospace";
    
    ctx.save();
    ctx.translate(pTL.x, pTL.y - 6);
    ctx.scale(-1, 1); 
    ctx.fillText("RIZ_PROJECT_ACTIVE_MATRIX", -180, 0); 
    ctx.restore();

    ctx.restore();
}
