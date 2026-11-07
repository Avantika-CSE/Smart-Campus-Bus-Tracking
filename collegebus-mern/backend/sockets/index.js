let ioInstance = null;

function initSocket(server, corsOrigin) {
  const { Server } = require('socket.io');
  ioInstance = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] }
  });

  ioInstance.on('connection', (socket) => {
    socket.on('join', (role) => {
      if (['student', 'admin', 'driver'].includes(role)) socket.join(role);
    });
  });

  return ioInstance;
}

function getIo() { return ioInstance; }

function emitProgressUpdate(busId, progress) {
  if (ioInstance) ioInstance.emit('progress:update', { busId, ...progress });
}

function emitNotification(forRole, notification) {
  if (ioInstance) ioInstance.to(forRole).emit('notification:new', notification);
}

module.exports = { initSocket, getIo, emitProgressUpdate, emitNotification };
