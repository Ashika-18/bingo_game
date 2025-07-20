// src/app.ts
import express from 'express';
import { PrismaClient } from '../src/generated/prisma';
import { disconnect } from 'process';
import { callNextBingoNumber, getCalledNumbers, resetBingoCaller } from './utils/bingoCaller';

const app = express();
const port = process.env.PORT || 3000;

const prisma = new PrismaClient();
 
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hi! Everyone, how are you doing?');
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
// userを呼び出す処理
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
app.post

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