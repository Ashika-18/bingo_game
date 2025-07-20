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
const bingoCaller_1 = require("./utils/bingoCaller");
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
const prisma = new client_1.PrismaClient();
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// ルートパス('/')へのGETリクエストが来た時にindex.htmlを返す
app.get('/', (req, res) => {
    // index.htmlのパスも同様に, dist/app.jsから見て public/index.html を指します
    res.sendFile(path_1.default.join(__dirname, '../public', 'index.html'));
});
// usserを新しく作る処理
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
    catch (error) { // errorの型をanyに指定(必要に応じてより具体的に)
        console.error('Error creating user:', error);
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Phone number already exists.' });
        }
        res.status(500).json({ error: 'Failed to create user.' });
    }
}));
// 全てのユーザーを取得するAPIエンドポイント
app.get('/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield prisma.user.findMany({
            select: {
                id: true,
                phoneNumber: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        res.json(users);
    }
    catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
}));
// 次のビンゴ数字を抽選するAPIエンドポ
app.post('/api/bingo/call', (req, res) => {
    const nextNumber = (0, bingoCaller_1.callNextBingoNumber)(); // bingoCaller.tsの関数を呼び出し
    if (nextNumber === null) {
        return res.status(200).json({ message: 'All numbers have been called.', number: null });
    }
    res.json({ number: nextNumber });
});
// 現在抽選済みの全ての数字を取得するAPIエンドポイント
app.get('/api/bingo/called-numbers', (req, res) => {
    const called = (0, bingoCaller_1.getCalledNumbers)(); // bingoCaller.tsの関数を呼び出し
    res.json({ getCalledNumbers: called });
});
// ビンゴの抽選状態をリセットするAPIエンドポイント
app.post('/api/bingo/reset', (req, res) => {
    (0, bingoCaller_1.resetBingoCaller)(); // bingoCaller.ts の関数を呼び出し
    res.status(200).json({ message: 'Bingo caller reset successfully.' });
});
// ビンゴカード生成APIエンドポイント
// (クライアント側で generateBingoCard を直接インポートして使う場合、このAPIは必須ではありません。
// しかし、サーバー経由でカードを生成する選択肢も提供できます。)
app.get('/api/bingo/card', (req, res) => {
    const newCard = (0, bingoCaller_1.generateBingoCard)(); // bingoCaller.ts の関数を呼び出し
    res.json(newCard);
});
app.listen(port, () => {
    console.log(`Express app running on http://localhost:${port}`);
});
process.on('SIGINT', () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
    process.exit(0);
}));
process.on('SIGTERM', () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
    process.exit(0);
}));
