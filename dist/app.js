"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/app.ts
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const path_1 = __importDefault(require("path"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const bingoCaller_1 = require("./utils/bingoCaller");
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.CLIENT_ORIGIN || "*", // 開発中は全てのoriginからの接続を許可(本番環境では制限すること)
        methods: ["GET", "POST"]
    }
});
const prisma = new client_1.PrismaClient();
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
app.get('/', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public', 'index.html'));
});
// ユーザー関連APIエンドポイント(変更なし)
app.post('/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password) {
        return res.status(400).json({ error: 'Phone number and password are required.' });
    }
    try {
        const newUser = yield prisma.user.create({
            data: {
                phoneNumber: phoneNumber,
                passwordHash: password,
            },
        });
        res.status(201).json(newUser);
    }
    catch (error) {
        console.error('Error creating user:', error);
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Phone number already exists.' });
        }
        res.status(500).json({ error: 'Failed to create user.' });
    }
}));
app.get('/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield prisma.user.findMany({
            select: {
                phoneNumber: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json(users);
    }
    catch (error) {
        console.error('Error fetching ussers:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}));
// ビンゴカード生成APIエンドポイント
app.get('/api/bingo/card', (req, res) => {
    const newCard = (0, bingoCaller_1.generateBingoCard)();
    res.json(newCard);
});
// Socket.IOの接続イベントリスナー
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);
    let currentRoom = null; // このソケットが現在参加している部屋
    // クライアントが部屋に参加するイベント
    socket.on('joinRoom', (roomCode) => {
        // 既存の部屋から退出(もし参加していれば)
        if (currentRoom) {
            socket.leave(currentRoom);
            console.log(`User ${socket.id} left room ${currentRoom}`);
        }
        // 新しい部屋に参加
        socket.join(roomCode);
        currentRoom = roomCode;
        (0, bingoCaller_1.initializeSession)(roomCode); // セッションを初期化または取得
        console.log(`User ${socket.id} joined room ${roomCode}`);
        // 部屋に入ったクライアントに, 現在の抽選済み数字を送信
        const called = (0, bingoCaller_1.getCalledNumbers)(roomCode);
        socket.emit('currentCalledNumbers', called); // 個別のソケットに送信
    });
    //「数字を引く」ボタンが押されたときのイベント (Socket.IO経由)
    socket.on('callNumber', () => {
        if (!currentRoom) {
            console.warn(`User ${socket.id} tried to call number without joining a room.`);
            socket.emit('error', '部屋に参加してから数字を引いてください!');
            return;
        }
        const nextNumber = (0, bingoCaller_1.callNextBingoNumber)(currentRoom);
        if (nextNumber !== null) {
            // その部屋の全員に, 次の抽選自体を送信
            io.to(currentRoom).emit('bingoNumberCalled', nextNumber);
            // その部屋の全員に,現在の抽選済み数字リストを更新して送信
            const called = (0, bingoCaller_1.getCalledNumbers)(currentRoom);
            io.to(currentRoom).emit('currentCalledNumbers', called);
        }
        else {
            io.to(currentRoom).emit('gameEnded', '全ての数字が抽選されました!');
        }
    });
    // 「ビンゴ状態をリセット」イベント (部屋単位でリセット)
    socket.on('resetGame', () => {
        if (!currentRoom) {
            console.warn(`User ${socket.id} tried to reset game without joining a room.`);
            socket.emit('error', '部屋に参加してからレームをリセットしてください!');
            return;
        }
        (0, bingoCaller_1.resetBingoCaller)(currentRoom); // 特定の部屋だけリセット
        // クライアント側でカードを生成するため, サーバー側ロジックのみリセット
        io.to(currentRoom).emit('gameReset', { message: 'ゲームがリセットされました! 新しいカードを生成してください!' });
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
process.on('SIGINT', () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
    server.close(() => {
        console.log('HTTP sever closed!');
        process.exit(0);
    });
}));
process.on('SIGTERM', () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
    server.close(() => {
        console.log('HTTP server closed!');
        process.exit(0);
    });
}));
