// src/app.ts
import express from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { callNextBingoNumber, generateBingoCard, getCalledNumbers, resetBingoCaller } from './utils/bingoCaller';

const app = express();
const port = process.env.PORT || 3000;

const prisma = new PrismaClient();
 
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ルートパス('/')へのGETリクエストが来た時にindex.htmlを返す
app.get('/', (req, res) => {
  // index.htmlのパスも同様に, dist/app.jsから見て public/index.html を指します
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// usserを新しく作る処理
app.post('/users', async (req, res) => {
  const {phoneNumber, password } = req.body;
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
  } catch (error: any) {// errorの型をanyに指定(必要に応じてより具体的に)
    console.error('Error creating user:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Phone number already exists.'});
    }
    res.status(500).json({ error: 'Failed to create user.'});
  }
});
// 全てのユーザーを取得するAPIエンドポイント
app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
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

// 次のビンゴ数字を抽選するAPIエンドポ
app.post('/api/bingo/call', (req, res) => {
  const nextNumber = callNextBingoNumber();// bingoCaller.tsの関数を呼び出し
  if (nextNumber === null) {
    return res.status(200).json({ message: 'All numbers have been called.', number: null});
  }
  res.json({ number: nextNumber});
});

// 現在抽選済みの全ての数字を取得するAPIエンドポイント
app.get('/api/bingo/called-numbers', (req, res) => {
  const called = getCalledNumbers();// bingoCaller.tsの関数を呼び出し
  res.json({ getCalledNumbers: called });
});

// ビンゴの抽選状態をリセットするAPIエンドポイント
app.post('/api/bingo/reset', (req, res) => {
  resetBingoCaller();// bingoCaller.ts の関数を呼び出し
  res.status(200).json({ message: 'Bingo caller reset successfully.' });
});

// ビンゴカード生成APIエンドポイント
// (クライアント側で generateBingoCard を直接インポートして使う場合、このAPIは必須ではありません。
// しかし、サーバー経由でカードを生成する選択肢も提供できます。)
app.get('/api/bingo/card', (req, res) => {
  const newCard = generateBingoCard();// bingoCaller.ts の関数を呼び出し
  res.json(newCard);
});

app.listen(port, () => {
  console.log(`Express app running on http://localhost:${port}`);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});