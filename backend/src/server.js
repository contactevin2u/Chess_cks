import http from 'node:http';
import app from './app.js';
import { attachGameServer } from './realtime/gameServer.js';

const PORT = process.env.PORT || 8080;

// Wrap Express in a raw HTTP server so the WebSocket server can share
// the same port (required on Render — one port per service).
const server = http.createServer(app);
attachGameServer(server);

server.listen(PORT, () => {
  console.log(`♟️  Chess backend listening on port ${PORT}`);
});
