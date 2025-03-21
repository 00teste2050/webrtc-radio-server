import { config } from './config.js';
import { SignalingService } from './signaling.js';

class WebRTCRadio {
    constructor() {
        this.peerConnections = new Map();
        this.localStream = null;
        this.isBroadcasting = false;
        this.isListening = false;
        
        // DOM Elements
        this.broadcasterSection = document.getElementById('broadcaster');
        this.listenerSection = document.getElementById('listener');
        this.startBroadcastBtn = document.getElementById('startBroadcast');
        this.stopBroadcastBtn = document.getElementById('stopBroadcast');
        this.connectBtn = document.getElementById('connect');
        this.disconnectBtn = document.getElementById('disconnect');
        this.broadcastStatus = document.getElementById('broadcastStatus');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.vuMeter = document.getElementById('vuMeter');
        
        this.broadcastName = document.getElementById('broadcastName');
        this.broadcastsList = document.getElementById('broadcastsList');
        this.audioContext = null;
        this.signaling = new SignalingService(config.signaling.url);
        this.setupSignaling();
        this.broadcastInfo = {
            id: crypto.randomUUID(),
            name: '',
            startTime: null,
            listeners: 0
        };

        this.initializeEventListeners();
    }

    initializeEventListeners() {
        document.getElementById('broadcasterMode').addEventListener('click', () => this.switchMode('broadcaster'));
        document.getElementById('listenerMode').addEventListener('click', () => this.switchMode('listener'));
        
        this.startBroadcastBtn.addEventListener('click', () => this.startBroadcasting());
        this.stopBroadcastBtn.addEventListener('click', () => this.stopBroadcasting());
        this.connectBtn.addEventListener('click', () => this.startListening());
        this.disconnectBtn.addEventListener('click', () => this.stopListening());
    }

    setupSignaling() {
        this.signaling.connect();
        this.signaling.onMessage = (message) => this.handleSignalingMessage(message);
    }

    handleSignalingMessage(message) {
        switch (message.type) {
            case 'broadcast-list':
                this.updateBroadcastsList(message.broadcasts);
                break;
            case 'listener-joined':
                this.handleListenerJoined(message);
                break;
            case 'offer':
                this.handleOffer(message);
                break;
            case 'answer':
                this.handleAnswer(message);
                break;
            case 'candidate':
                this.handleCandidate(message);
                break;
        }
    }

    updateBroadcastsList(broadcasts) {
        this.broadcastsList.innerHTML = '';
        broadcasts.forEach(broadcast => {
            const li = document.createElement('li');
            li.innerHTML = `
                <h4>${broadcast.name}</h4>
                <p>Listeners: ${broadcast.listeners}</p>
                <p>On air: ${this.formatDuration(Date.now() - broadcast.startTime)}</p>
            `;
            li.addEventListener('click', () => this.connectToBroadcast(broadcast.id));
            this.broadcastsList.appendChild(li);
        });
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }

    switchMode(mode) {
        this.broadcasterSection.classList.toggle('hidden', mode !== 'broadcaster');
        this.listenerSection.classList.toggle('hidden', mode !== 'listener');
    }

    async startBroadcasting() {
        if (!this.broadcastName.value.trim()) {
            alert('Please enter a broadcast name');
            return;
        }

        try {
            this.audioContext = new AudioContext();
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: config.audioConstraints,
                video: false
            });

            // Audio processing
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            const compressor = this.audioContext.createDynamicsCompressor();
            const gainNode = this.audioContext.createGain();
            
            source.connect(compressor);
            compressor.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            this.broadcastInfo.name = this.broadcastName.value;
            this.broadcastInfo.startTime = Date.now();

            this.signaling.send({
                type: 'broadcast-start',
                broadcastInfo: this.broadcastInfo
            });

            this.startVUMeter();
            this.startBroadcastBtn.classList.add('hidden');
            this.stopBroadcastBtn.classList.remove('hidden');
            this.broadcastStatus.textContent = 'Broadcasting';
            this.isBroadcasting = true;

            // Setup WebRTC connection
            this.setupBroadcasterPeerConnection();
        } catch (error) {
            console.error('Error starting broadcast:', error);
            this.broadcastStatus.textContent = `Error: ${error.message}`;
        }
    }

    stopBroadcasting() {
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.signaling.send({
            type: 'broadcast-end',
            broadcastId: this.broadcastInfo.id
        });

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();

        this.startBroadcastBtn.classList.remove('hidden');
        this.stopBroadcastBtn.classList.add('hidden');
        this.broadcastStatus.textContent = 'Not Broadcasting';
        this.isBroadcasting = false;
    }

    setupBroadcasterPeerConnection() {
        const pc = new RTCPeerConnection(config.iceServers);
        
        this.localStream.getTracks().forEach(track => {
            pc.addTrack(track, this.localStream);
        });

        pc.onicecandidate = event => {
            if (event.candidate) {
                // Send the candidate to signaling server
                this.signaling.send({
                    type: 'candidate',
                    candidate: event.candidate
                });
            }
        };

        // More WebRTC setup here...
    }

    startVUMeter() {
        if (!this.localStream) return;

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(this.localStream);
        const analyser = audioContext.createAnalyser();
        
        source.connect(analyser);
        analyser.fftSize = 256;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const updateMeter = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const volume = Math.min(100, Math.round((average / 255) * 100));
            
            this.vuMeter.style.setProperty('--level', `${volume}%`);
            if (this.isBroadcasting) {
                requestAnimationFrame(updateMeter);
            }
        };

        updateMeter();
    }

    async startListening() {
        try {
            const pc = new RTCPeerConnection(config.iceServers);
            
            pc.ontrack = event => {
                const audio = new Audio();
                audio.srcObject = event.streams[0];
                audio.play();
            };

            this.connectBtn.classList.add('hidden');
            this.disconnectBtn.classList.remove('hidden');
            this.connectionStatus.textContent = 'Connected';
            this.isListening = true;

            // Setup WebRTC connection for listener
            await this.setupListenerPeerConnection(pc);
        } catch (error) {
            console.error('Error starting listening:', error);
            this.connectionStatus.textContent = `Error: ${error.message}`;
        }
    }

    stopListening() {
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();

        this.connectBtn.classList.remove('hidden');
        this.disconnectBtn.classList.add('hidden');
        this.connectionStatus.textContent = 'Not Connected';
        this.isListening = false;
    }

    async setupListenerPeerConnection(pc) {
        // WebRTC setup for listener...
    }

    async connectToBroadcast(broadcastId) {
        try {
            const pc = new RTCPeerConnection(config.iceServers);
            
            pc.ontrack = event => {
                const audioContext = new AudioContext();
                const source = audioContext.createMediaStreamSource(event.streams[0]);
                const gainNode = audioContext.createGain();
                
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                this.startListenerVUMeter(event.streams[0]);
            };

            this.signaling.send({
                type: 'connect-request',
                broadcastId: broadcastId
            });

            // More WebRTC setup here...
        } catch (error) {
            console.error('Error connecting to broadcast:', error);
            this.connectionStatus.textContent = `Error: ${error.message}`;
        }
    }

    startListenerVUMeter(stream) {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        
        source.connect(analyser);
        analyser.fftSize = 256;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const listenerVuMeter = document.getElementById('listenerVuMeter');
        
        const updateMeter = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const volume = Math.min(100, Math.round((average / 255) * 100));
            
            listenerVuMeter.style.setProperty('--level', `${volume}%`);
            if (this.isListening) {
                requestAnimationFrame(updateMeter);
            }
        };

        updateMeter();
    }

    handleListenerJoined(message) {
        // Handle listener joined
    }

    handleOffer(message) {
        // Handle offer
    }

    handleAnswer(message) {
        // Handle answer
    }

    handleCandidate(message) {
        // Handle candidate
    }

    sendToSignalingServer(message) {
        // Implement signaling server communication
        console.log('Sending to signaling server:', message);
    }
}

const radio = new WebRTCRadio();