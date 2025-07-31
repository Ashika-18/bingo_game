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
  resetBingoCaller,
  addPlayerToSession,
  markNumberOnPlayerCard,
  checkBingo,
  PlayerBingoCard,
  BingoCell
} from './utils/bingoCaller';

const app = express();
const port = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "*",// 開発中は全てのoriginからの接続を許可(本番環境では制限すること)
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
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users'});
  }
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
  socket.on('joinRoom', (roomCode: string, callBack: (card: PlayerBingoCard | null, calledNumbers: number[]) => void) => {
    // 既存の部屋から退出(もし参加していれば)
    if (currentRoom && currentRoom !== roomCode) {
      socket.leave(currentRoom);
      console.log(`User ${socket.id} left room ${currentRoom}`);
      io.to(currentRoom).emit('playerLeft', socket.id);// 部屋の他のメンバーに通知
    }

    // 新しい部屋に参加
    socket.join(roomCode);
    currentRoom = roomCode;
    console.log(`User ${socket.id} joined room ${roomCode}`);

    const playerCard = addPlayerToSession(roomCode, socket.id);// プレイヤーをセッションに追加しカードを取得
    const called = getCalledNumbers(roomCode);// 現在の呼ばれた数字を取得

    // 参加したクライアントに、生成されたカードと現在の呼ばれた数字を送信
    if (typeof callBack === 'function') {
      callBack(playerCard, called);
    } else {
      console.warn(`Client ${socket.id} did not provide a callback for joinRoom event.`);
    }
    // 部屋の他のメンバーにプレイヤーが参加したことを通知
    socket.to(roomCode).emit('playerJoined', socket.id);
  });

  //「数字を引く」ボタンが押されたときのイベント (通常はホスト/ゲームマスターのみが実行)
  socket.on('callNumber', (roomCode: string) => {
    if (!roomCode) {
      console.warn(`User ${socket.id} tried to call number without joining a room.`);
      socket.emit('error', '部屋に参加してから数字を引いてください!');
      return; 
    }

    // ユーザーが実際にその部屋にいるかの追加チェック
    if (!socket.rooms.has(roomCode)) {
      console.warn(`User ${socket.id} is not in room ${roomCode} but tried to call number.`);
      socket.emit('error', 'この部屋で数字を引く権限がありません!');
      return;
    }

    // bingoCaller.ts の callNextBingoNumber は内部でカード更新とビンゴ判定も行います
    const nextNumber = callNextBingoNumber(roomCode);

    if (nextNumber !== null) {
      console.log(`New number called: ${nextNumber} in room ${roomCode}`);
      // その部屋の全員に、次の抽選された数字と現在の抽選済み数字リストを更新して送信
      const called = getCalledNumbers(roomCode);
      io.to(roomCode).emit('bingoNumberCalled', { number: nextNumber, calledNumbers: called});

      // プレイヤーのビンゴ状態をチェックし、必要に応じて通知
      const session = initializeSession(roomCode);// 最新のセッション状態を取得
      session.players.forEach(player => {
        if (player.isBingo) {
          // ビンゴしたプレイヤーがいれば、ルーム全体に通知
          io.to(roomCode).emit('playerBingoAnnounce', { playerId: player.id});
        }
      });

    } else {
      // 全ての数字が呼ばれたら、ゲーム終了を通知
      io.to(roomCode).emit('gameEnded', '全ての数字が抽選されました!');
    }
  });

  // プレイヤーがカードのセルをマークするイベント
  socket.on('markCell', (roomCode: string, value: number, callBack: (success: boolean, updatedCard?: PlayerBingoCard, isBingo?: boolean) => void) => {
    if (!roomCode) {
      console.warn(`User ${socket.id} tried to mark cell without providing a roomCode.`);
      if (typeof callBack === 'function') {
        callBack(false);
      }
      socket.emit('error', '部屋コードを指定してからセルをマークしてください!');
      return;
    }

    if (!socket.rooms.has(roomCode)) {
      console.warn(`User ${socket.id} is not in room ${roomCode} but tried to mark cell.`);
      if (typeof callBack === 'function') {
        callBack(false);
      }
      socket.emit('error', 'この部屋でセルをマークする権限がありません!');
      return;
    }

    const session = initializeSession(roomCode);
    const player = session.players.get(socket.id);

    if (!player) {
      console.warn(`Player ${socket.id} not found in session ${roomCode} for marking cell.`);
      if (typeof callBack === 'function') {
        callBack(false);
      }
      socket.emit('error', 'プレイヤー情報が見つかりません!部屋に正しく参加してください!');
      return;
    }

    // 既に呼ばれた数字かどうかを確認 (不正なマークを防ぐため)
    if (!session.calledNumbers.includes(value)) {
      console.warn(`Number ${value} has not been called yet in room ${roomCode}.Player ${socket.id} attempted to mark. `);
      if (typeof callBack === 'function') {
        callBack(false, player.card, player.isBingo);
      }
      socket.emit('error', `数字 ${value} はまだ呼ばれていません!`);
      return;
    }

    // markNumberOnPlayerCard を使ってカードを更新
    const wasMarked = markNumberOnPlayerCard(player.card, value);

    if (wasMarked) {
      // マークが成功した場合、ビンゴ判定
      if (!player.isBingo && checkBingo(player.card)) {
        player.isBingo = true;// プレイヤーのビンゴ状態を更新
        console.log(`Player ${socket.id} achived BINGO in room ${roomCode}!`);
        io.to(roomCode).emit('playerBingoAnnounce', { playerId: socket.id});// ルーム全体にビンゴを通知
      }
      // マーク成功と更新されたカード、ビンゴ状態をクライアントに返す
      if (typeof callBack === 'function') {
      callBack(true, player.card, player.isBingo);
      }

      // 他のクライアントにもこのプレイヤーのカードが更新されたことを通知しても良い
      io.to(roomCode).emit('playerCardMarked', { playerId: socket.id, card: player.card});
    } else {
      // マーク失敗(既にマーク済みなど)
      if (typeof callBack === 'function') {
      callBack(false, player.card, player.isBingo);
      }
      socket.emit('error', `数字 ${value} は既にマーク済みか、無効なセルです!`);
    }
  });

  // 「ビンゴ状態をリセット」イベント (部屋単位でリセット)
  socket.on('resetGame', (roomCode: string) => {
    if (!roomCode) {
      console.warn(`User ${socket.id} tried to reset game without joining a room.`);
      socket.emit('error', '部屋に参加してからレームをリセットしてください!');
      return;
    }

    // ユーザーが実際にその部屋にいるかの追加チェック
    if (!socket.rooms.has(roomCode)) {
      console.warn(`User ${socket.id} is not in room ${roomCode} but tried to reset game.`);
      socket.emit('error', 'この部屋でゲームをリセットする権限がありません!');
      return;
    }

    resetBingoCaller(roomCode);// 特定の部屋だけリセット
    // クライアント側でカードを生成するため, サーバー側ロジックのみリセット
    io.to(roomCode).emit('gameReset', { message: 'ゲームがリセットされました! 新しいカードを生成してください!'});
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (currentRoom) {
      // プレイヤーが切断された際にセッションから削除するロジック
      // removePlayerFromSession(currentRoom, socket.id); // bingoCaller に実装されている場合
      // socket.rooms をループして全ての参加部屋から削除するロジック
      socket.rooms.forEach(room => {
        if (room !== socket.id) {// 個別の部屋のソケットIDの部屋は除外
          // removePlayerFromSession(room, socket.id); // 実装されていれば呼び出す
          console.log(`User ${socket.id} removed from session ${room} on disconnect.`);
          io.to(room).emit('playerLeft', socket.id);// 部屋の他のメンバーに通知
        }
      });
    }
  });
});

// Expressのlistenではなく、HTTPサーバーのlistenを使用
server.listen(port, () => {
  console.log(`Express app running on http://localhost:${port}`);
  console.log(`Socket.IO server running on http://localhost:${port}`);
});

// プロセス終了時の処理
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  server.close(() => {
    console.log('HTTP server closed!');
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