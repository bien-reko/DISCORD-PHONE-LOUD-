// BIEN REKO NUCLEAR INJECTOR V5
// FIXES "DTLS CONNECTING" STUCK ERROR
// ADDS "KEEP-ALIVE" SIGNAL TO FORCE CONNECTION

(function() {

    // --- GLOBAL CONTROLS ---
    window.BienNodes = {
        context: null,
        preGain: null,
        shaper: null,
        postGain: null
    };

    // --- 1. RAGE CURVE ---
    function makeDistortionCurve(amount) {
        let k = typeof amount === 'number' ? amount : 0,
            n_samples = 44100,
            curve = new Float32Array(n_samples),
            deg = Math.PI / 180,
            i = 0, x;
        for (; i < n_samples; ++i) {
            x = i * 2 / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    // --- 2. INJECTION HOOK ---
    const NativeMediaDevices = navigator.mediaDevices;
    const NativeGetUserMedia = NativeMediaDevices.getUserMedia.bind(NativeMediaDevices);

    navigator.mediaDevices.getUserMedia = async function(constraints) {
        console.log("Bien Reko: Hooking Mic...");

        // FORCE RAW AUDIO
        if (constraints.audio) {
            constraints.audio = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 2
            };
        }

        let rawStream;
        try {
            rawStream = await NativeGetUserMedia(constraints);
        } catch (e) {
            alert("Mic Error! Check Permissions.");
            throw e;
        }
        
        // --- 3. FIX: FORCE 48kHz & KEEP-ALIVE ---
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        // FORCE 48000Hz to match Discord (Fixes robotic voice/lag)
        const ctx = new AudioContext({ 
            latencyHint: 'interactive',
            sampleRate: 48000 
        });
        window.BienNodes.context = ctx;

        // WAKE UP ENGINE
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        // NODES
        const source = ctx.createMediaStreamSource(rawStream);
        const preGain = ctx.createGain();       
        const shaper = ctx.createWaveShaper();  
        const compressor = ctx.createDynamicsCompressor(); 
        const postGain = ctx.createGain();      
        const destination = ctx.createMediaStreamDestination();

        // --- THE "DTLS FIX" (SILENT OSCILLATOR) ---
        // This generates a tiny sound that keeps the connection open
        // so Discord doesn't get stuck on "Connecting..."
        const keepAlive = ctx.createOscillator();
        const keepAliveGain = ctx.createGain();
        keepAlive.type = 'sine';
        keepAlive.frequency.value = 10; // 10Hz (Inaudible)
        keepAliveGain.gain.value = 0.0001; // Tiny volume
        keepAlive.connect(keepAliveGain);
        keepAliveGain.connect(destination);
        keepAlive.start();
        // ------------------------------------------

        window.BienNodes.preGain = preGain;
        window.BienNodes.shaper = shaper;
        window.BienNodes.postGain = postGain;

        // DEFAULTS
        preGain.gain.value = 50.0;    
        shaper.curve = makeDistortionCurve(0); 
        shaper.oversample = '4x';
        postGain.gain.value = 1.0;

        // CONNECT
        source.connect(preGain);
        preGain.connect(shaper);
        shaper.connect(compressor);
        compressor.connect(postGain);
        postGain.connect(destination);

        // UPDATE UI
        const statusEl = document.getElementById('bien-status');
        if(statusEl) {
            statusEl.innerText = "INJECTED: 100% (DTLS FIXED) ✅";
            statusEl.style.color = "#00ff00";
        }

        return destination.stream;
    };

    // --- 4. UI CREATION ---
    function createUI() {
        if (document.getElementById('bien-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'bien-panel';
        panel.style.cssText = `
            position: fixed; top: 10px; right: 10px; width: 220px;
            background: #000; border: 2px solid red; color: red;
            padding: 10px; z-index: 9999999; font-family: monospace;
            box-shadow: 0 0 15px red;
        `;

        panel.innerHTML = `
            <div style="text-align:center; font-weight:bold; color:white;">BIEN REKO V5</div>
            <div id="bien-status" style="font-size:10px; color:yellow; text-align:center;">STATUS: WAITING...</div>
            <button id="btn-fix" style="width:100%; background:yellow; color:black; font-weight:bold; margin-top:5px; cursor:pointer;">⚡ START AUDIO ⚡</button>
            
            <label style="font-size:11px; margin-top:10px; display:block;">SENSITIVITY (Shhh)</label>
            <input type="range" id="slider-sens" min="1" max="500" value="50" style="width:100%;">
            <div id="val-sens" style="text-align:right; color:white;">50x</div>

            <label style="font-size:11px; margin-top:5px; display:block;">RAGE MODE</label>
            <input type="range" id="slider-rage" min="0" max="1000" value="0" style="width:100%;">
            <div id="val-rage" style="text-align:right; color:white;">OFF</div>

            <label style="font-size:11px; margin-top:5px; display:block;">DB BLAST</label>
            <input type="range" id="slider-vol" min="1" max="100" value="1" style="width:100%;">
            <div id="val-vol" style="text-align:right; color:white;">1.0x</div>
        `;

        document.body.appendChild(panel);

        const s_sens = document.getElementById('slider-sens');
        const s_rage = document.getElementById('slider-rage');
        const s_vol = document.getElementById('slider-vol');
        const btn_fix = document.getElementById('btn-fix');

        s_sens.oninput = function() {
            document.getElementById('val-sens').innerText = this.value + "x";
            if(window.BienNodes.preGain) window.BienNodes.preGain.gain.value = this.value;
        };
        s_rage.oninput = function() {
            let val = parseInt(this.value);
            document.getElementById('val-rage').innerText = val > 0 ? "LEVEL " + val : "OFF";
            if(window.BienNodes.shaper) window.BienNodes.shaper.curve = makeDistortionCurve(val);
        };
        s_vol.oninput = function() {
            document.getElementById('val-vol').innerText = this.value + "x";
            if(window.BienNodes.postGain) window.BienNodes.postGain.gain.value = this.value;
        };
        
        btn_fix.onclick = function() {
            if (window.BienNodes.context) {
                window.BienNodes.context.resume();
                this.innerText = "AUDIO RUNNING ✅";
                this.style.background = "green";
                this.style.color = "white";
            }
        };
    }

    window.addEventListener('load', createUI);
    setTimeout(createUI, 2000);

})();
