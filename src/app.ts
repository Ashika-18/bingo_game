// src/app.ts
import express from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';

import {
  initializeSession,
  callNextBingoNumber,
  generateBingoCard,
  getCalledNumbers,
  resetBingoCaller
} from './utils/bingoCaller';

const app = express();
const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",// 開発中は全てのoriginからの接続を許可(本番環境では制限すること)
    methods: ["GET", "POST"]
  }
});

const prisma = new PrismaClient();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// ユーザー関連APIエンドポイント(変更なし)
app.post('/users', async (req, res) => {
  const {phoneNumber, password} = req.body;
  if (!phoneNumber || !password) {
    return res.status(400).json({ error: 'Phone number and password are required.'});
  }
  try {
    const newUser = await prisma.user.create({
      data: {
        phoneNumber: phoneNumber,
        passwordHash: password,
      },
    });
    res.status(201).json(newUser);
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Phone number already exists.'});
    }
    res.status(500).json({ error: 'Failed to create user.'});
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        phoneNumber: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching ussers:', error);
    res.status(500).json({ error: 'Failed to fetch users'});
  }
});

// ビンゴ関連APIエンドポイント（HTTP APIとしては残しておくが、
// 複数人ゲームのロジックはSocket.IOへ移行するため、使用頻度は減る可能性あり）

// 次のビンゴ数字を抽選するAPIエンドポイント (roomCodeをクエリパラメータで受け取るように変更)
app.post('/api/bingo/call', (req, res) => {
  const roomCode = req.body.roomCode || 'default';// roomCode をリクエストボディから取得,無ければ 'default'
  const nextNumber = callNextBingoNumber(roomCode);
  if (nextNumber === null) {
    return res.status(200).json({ message: 'All numbers have been called.', number: null});
  }
  res.json({ number: nextNumber});
});

// 現在抽選済みの全ての数字を取得するAPIエンドポイント (roomCodeをクエリパラメータで受け取るように変更)
app.get('/api/bingo/called-numbers', (req, res) => {
  const roomCode = req.query.roomCode as string || 'default';// roomCode をクエリパラメータから取得
  const called = getCalledNumbers(roomCode);
  res.json({ getCalledNumbers: called});
});

// ビンゴの抽選状態をリセットするAPIエンドポイント (roomCodeをリクエストボディで受け取るように変更)
app.post('/api/bingo/reset', (req, res) => {
  const roomCode = req.body.roomCode || 'default';// roomCode をリクエストボディから取得
  resetBingoCaller(roomCode);
  res.status(200).json({ message: 'Bingo caller reset successfully.'});
});

// ビンゴカード生成APIエンドポイント
app.get('/api/bingo/card', (req, res) => {
  const newCard = generateBingoCard();
  res.json(newCard);
});

// Socket.IOの接続イベントリスナー
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  let currentRoom: string | null = null;// このソケットが現在参加している部屋

  // クライアントが部屋に参加するイベント
  socket.on('joinRoom', (roomCode: string) => {
    // 既存の部屋から退出(もし参加していれば)
    if (currentRoom) {
      socket.leave(currentRoom);
      console.log(`User ${socket.id} left room ${currentRoom}`);
    }
    // 新しい部屋に参加
    socket.join(roomCode);
    currentRoom = roomCode;
    initializeSession(roomCode);// セッションを初期化または取得
    console.log(`User ${socket.id} joined room ${roomCode}`);

    // 部屋に入ったクライアントに, 現在の抽選済み数字を送信
    const called = getCalledNumbers(roomCode);
    socket.emit('currentCalledNumbers', called)// 個別のソケットに送信
  });

  //「数字を引く」ボタンが押されたときのイベント (Socket.IO経由)
  socket.on('callNumber', () => {
    if (!currentRoom) {
      console.warn(`User ${socket.id} tried to call number without joining a room.`);
      socket.emit('error', '部屋に参加してから数字を引いてください!');
      return; 
    }
    const nextNumber = callNextBingoNumber(currentRoom);
    if (nextNumber !== null) {
      // その部屋の全員に現在の抽選済み数字リストを更新して送信
      const called = getCalledNumbers(currentRoom);
      io.to(currentRoom).emit('currentCalledNumbers', called);
    } else {
      io.to(currentRoom).emit('gameEnded', '全ての数字が抽選されました');
    }
  });
  // 「ビンゴ状態をリセット」イベント (部屋単位でリセット)
  socket.on('resetGame', () => {
    if (!currentRoom) {
      console.warn(`User ${socket.id} tried to reset game without joining a room.`);
      socket.emit('error', '部屋に参加してからレームをリセットしてください!');
      return;
    }
    resetBingoCaller(currentRoom);// 特定の部屋だけリセット
    // クライアント側でカードを生成するため, サーバー側ロジックのみリセット
    io.to(currentRoom).emit('gameReset', { message: 'ゲームがリセットされました! 新しいカードを生成してください!'});
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoom) {
      // 部屋からユーザーが全ていなくなったらセッションをクリーンアップするロジックをここに追加しても良い
      console.log(`User ${socket.id} left room ${currentRoom}`);
    }
  });
});

// Expressのlistenではなく、HTTPサーバーのlistenを使用
server.listen(port, () => {
  console.log(`Express app running on http://lovalhost:${port}`);
  console.log(`Socket.IO server running on http://localhost:${port}`);
});

process.on('SIGINT', async () => {
  await prisma.$dissconnect();
  server.close(() => {
    console.log('HTTP sever closed!');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  server.close(() => {
    console.log('HTTP server closed!');
    process.exit(0);
  });
});