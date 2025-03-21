const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000 });
const clients = new Set(); // Lista de clientes conectados

console.log('Servidor WebRTC rodando na porta 3000');

wss.on('connection', (ws) => {
    console.log('Novo cliente conectado');
    clients.add(ws); // Adiciona cliente à lista

    ws.on('message', (message) => {
        const text = message.toString();
        console.log('Mensagem recebida:', text);

        // Envia a mensagem para todos os clientes conectados, menos para quem enviou
        clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(text);
            }
        });
    });

    ws.on('close', () => {
        clients.delete(ws); // Remove cliente desconectado
        console.log('Cliente desconectado');
    });
});
