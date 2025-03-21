export const config = {
    iceServers: [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302'
            ]
        }
    ],
    audioConstraints: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 2,
        latency: 0,
        volume: 1.0
    },
    signaling: {
        url: 'wss://your-signaling-server.com',
        reconnectInterval: 5000,
        maxReconnectAttempts: 5
    },
    broadcast: {
        maxListeners: 100,
        bufferSize: 1024,
        bitrate: 128000
    }
};