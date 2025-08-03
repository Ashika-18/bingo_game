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
  BingoCell,
  removePlayerFromSession,
  Player,
  sessions,
} from './utils/bingoCaller';

interface Room {
  calledNumbers: number[];
}

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

const rooms = new Map<string, Room>();

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

// プレイヤーリストを部屋にブロードキャストする共通関数
function broadcastPlayerList(roomCode: string) {
  const session = sessions.get(roomCode);
  if (session) {
    // プレイヤーのIDと名前のリストを作成
    const playerList = [...session.players.values()].map(p => ({
      id: p.id,
      name: p.name,
    }));
    io.to(roomCode).emit('playerListUpdate', playerList);
  }
}

// Socket.IOの接続イベントリスナー
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id}`);

  let currentRoom: string | null = null;// このソケットが現在参加している部屋

    // クライアントが部屋に参加するイベント
    socket.on('joinRoom', (roomCode: string, playerName: string, callBack: (card: PlayerBingoCard | null, calledNumbers: number[]) => void) => {
      // まずセッションを初期化または取得
      const session = initializeSession(roomCode);
      // 名前の重複チェック
      const existingPlayer = [...session.players.values()].find(p => p.name === playerName);

      // 参加しようとしているプレイヤーが, 自分自身(同じソケットID)でない事を確認
      if (existingPlayer && existingPlayer.id !== socket.id) {
        console.warn(`Player ${playerName} tried to join room ${roomCode} but the name is already taken.`);
        // コールバック関数を使ってクライアントにエラーを通知
        if (typeof callBack === 'function') {
          callBack(null, []);// カードと履歴をnullで渡す
        }
        socket.emit('error', 'その名前はすでに使われています!別の名前を入力してください!');
        return;
      }

      // ここで前の部屋から退出する処理
      if (currentRoom && currentRoom !== roomCode) {
        socket.leave(currentRoom);
        console.log(`User ${socket.id} left room ${currentRoom}`);
        // bingoCaller.ts の removePlayerFromSession を呼び出し、セッションからもプレイヤーを削除
        removePlayerFromSession(currentRoom, socket.id);
        io.to(currentRoom).emit('playerLeft', socket.id);
      }

      // 新しい部屋に参加
      socket.join(roomCode);
      currentRoom = roomCode;
      console.log(`User ${socket.id} joined room ${roomCode} with name ${playerName}`);

      const playerCard = addPlayerToSession(roomCode, socket.id, playerName);// プレイヤーをセッションに追加しカードを取得
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
      const session = sessions.get(roomCode);

      // セッションが存在しないか,不正なアクセスをチェック
      if (!session || !socket.rooms.has(roomCode)) {
        console.warn(`User ${socket.id} tried to call number in invalid room ${roomCode}.`);
        socket.emit('error', '部屋に参加してから数字を引いてください!');
        return; 
      }

      if (session.isGameEnded) {
        console.log(`Game in room ${roomCode} has already ended.`);
        // クライアント側にゲーム終了を再度通知
        const winnerName = session.bingoWinnerId ? session.players.get(session.bingoWinnerId)?.name : null;
        io.to(roomCode).emit('gameEnded', { winner: winnerName, message: 'ゲームはすでに終了しています!' });
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
          if (player.isBingo && session.bingoWinnerId === null) {
            // 最初にビンゴを達成したプレイヤーを記録
            session.bingoWinnerId = player.id;
            session.isGameEnded = true;// ゲーム終了フラグを立てる

            // ビンゴしたプレイヤーがいれば、ルーム全体に通知
            io.to(roomCode).emit('playerBingoAnnounce', { playerName: player.name });

            // ゲーム終了を通知するイベントを送信
            io.to(roomCode).emit('gameEnded', { winner: player.name });
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
      // ゲームが終了している場合は処理を中断
      if (session.isGameEnded) {
        if (typeof callBack === 'function') {
          callBack(false);
        }
        return;
      }

      const player: Player | undefined = session.players.get(socket.id);
      // デバッグ用ログ追加
      console.log('--- markCell イベント ---');
      console.log(`roomCode: ${roomCode}, socket.id: ${socket.id}`);
      console.log('playerオブジェクト:', player);

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
          // ビンゴ達成時にゲーム終了フラグを立てる
          session.isGameEnded = true;
          console.log(`Player ${socket.id} achived BINGO in room ${roomCode}!`);
          io.to(roomCode).emit('playerBingoAnnounce', { playerName: player.name });// ルーム全体にビンゴを通知
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

      const bingoRoom = rooms.get(roomCode);

      if (bingoRoom) {
        bingoRoom.calledNumbers = [];
        console.log(`Room ${roomCode} calledNumbers cleared.`);
      }

      resetBingoCaller(roomCode);// 特定の部屋だけリセット
      // クライアント側でカードを生成するため, サーバー側ロジックのみリセット
      io.to(roomCode).emit('gameReset', { message: 'ゲームがリセットされました! 新しいカードを生成してください!'});
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      
        // プレイヤーが切断された際にセッションから削除するロジック
        socket.rooms.forEach(room => {
          if (room !== socket.id) {// 個別の部屋のソケットIDの部屋は除外
            // bingoCaller.ts に実装されている removePlayerFromSession を呼び出し
            removePlayerFromSession(room, socket.id);
            console.log(`User ${socket.id} removed from session ${room} on disconnect.`);
            io.to(room).emit('playerLeft', socket.id);// 部屋の他のメンバーに通知
          }
        });
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