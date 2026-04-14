require('dotenv').config();

const app = require('./src/app');
const db = require('./src/config/db');

const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server);

/* =========================
   SOCKET CONNECTION
========================= */
io.on('connection', (socket) => {

  console.log('✅ User connected:', socket.id);

  /* =========================
     PRIVATE ROOM
  ========================= */
  socket.on('joinRoom', ({ userId }) => {
    socket.join(userId.toString());
  });

  socket.on('sendMessage', (data) => {
    const { sender_id, receiver_id, message } = data;

    db.query(
      `INSERT INTO chat_message (sender_id, receiver_id, message) VALUES (?, ?, ?)`,
      [sender_id, receiver_id, message],
      (err) => {
        if (err) return console.log(err);

        const msgData = {
          sender_id,
          receiver_id,
          message,
          time: new Date()
        };

        io.to(receiver_id.toString()).emit('receiveMessage', msgData);
        io.to(sender_id.toString()).emit('receiveMessage', msgData);
      }
    );
  });

  /* =========================
     FAMILY ROOM (GROUP CHAT)
  ========================= */
  socket.on('joinFamilyRoom', ({ familyId }) => {
    socket.join("family_" + familyId);
    console.log(`User joined family room: family_${familyId}`);
  });

  socket.on('sendGroupMessage', (data) => {
    const { sender_id, family_id, message } = data;

    db.query(
      `INSERT INTO chat_message (sender_id, receiver_id, message)
       VALUES (?, NULL, ?)`,
      [sender_id, message],
      (err) => {
        if (err) return console.log(err);

        db.query(
          `SELECT first_name FROM family_member WHERE member_id=?`,
          [sender_id],
          (err2, res2) => {

            const msgData = {
              sender_id,
              message,
              first_name: res2?.[0]?.first_name || 'User'
            };

            io.to("family_" + family_id)
              .emit('receiveGroupMessage', msgData);
          }
        );
      }
    );
  });

  /* =========================
     TYPING (OPTIONAL)
  ========================= */
  socket.on('typing', ({ sender_id, receiver_id }) => {
    socket.to(receiver_id.toString()).emit('typing', { sender_id });
  });

  /* =========================
     DISCONNECT
  ========================= */
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
  });

});

/* =========================
   START SERVER
========================= */
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});