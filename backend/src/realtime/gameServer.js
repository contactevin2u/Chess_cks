// ════════════════════════════════════════════════════════════════
//  Real-time chess rooms over WebSocket.
//
//  This is a lightweight RELAY: it pairs two players into a room and
//  forwards moves between them. Chess rules are enforced client-side;
//  the server just matches players and passes messages along.
//
//  Protocol (JSON messages):
//    client → server: {type:'create'}
//                     {type:'join', code}
//                     {type:'move', from:[r,c], to:[r,c]}
//                     {type:'restart'}
//    server → client: {type:'created', code}
//                     {type:'start', code, color:'w'|'b'}
//                     {type:'move' | 'restart' | 'opponent_left'}
//                     {type:'notfound' | 'full'}
// ════════════════════════════════════════════════════════════════
import { WebSocketServer } from 'ws';

/** rooms: code -> { white: ws|null, black: ws|null } */
const rooms = new Map();

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing 0/O/1/I
  let code;
  do {
    code = Array.from({ length: 4 }, () =>
      alphabet[Math.floor(Math.random() * alphabet.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

const send = (ws, obj) => {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
};

export function attachGameServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.roomCode = null;
    ws.color = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'create') {
        const code = makeCode();
        const cfg = msg.config || {};
        // Resolve the host's requested color (random picks one).
        let hostColor = cfg.hostColor === 'b' ? 'b'
          : cfg.hostColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b')
          : 'w';
        const timeMs = Number(cfg.timeMs) || 0;
        const incMs = Number(cfg.incMs) || 0;

        const room = { white: null, black: null, timeMs, incMs };
        room[hostColor === 'w' ? 'white' : 'black'] = ws;
        rooms.set(code, room);
        ws.roomCode = code; ws.color = hostColor;
        send(ws, { type: 'created', code, color: hostColor, timeMs });
        return;
      }

      if (msg.type === 'join') {
        const code = String(msg.code || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, { type: 'notfound' });

        // The joiner takes whichever seat the host left open.
        const seat = room.white ? 'black' : 'white';
        if (room[seat]) return send(ws, { type: 'full' });
        room[seat] = ws;
        ws.roomCode = code; ws.color = seat === 'white' ? 'w' : 'b';

        // Kick off the game for both sides, sharing the timer config.
        const payload = { type: 'start', code, timeMs: room.timeMs, incMs: room.incMs };
        send(room.white, { ...payload, color: 'w' });
        send(room.black, { ...payload, color: 'b' });
        return;
      }

      // Relay gameplay messages to the OTHER player in the room.
      if (msg.type === 'move' || msg.type === 'restart') {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const opponent = ws.color === 'w' ? room.black : room.white;
        send(opponent, msg);
      }
    });

    ws.on('close', () => {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const opponent = ws.color === 'w' ? room.black : room.white;
      send(opponent, { type: 'opponent_left' });
      rooms.delete(ws.roomCode); // tear the room down when anyone leaves
    });
  });

  console.log('🔌 WebSocket game server attached');
  return wss;
}
