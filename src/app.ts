// src/app.ts
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from Bingo Game Express App!');
});

app.listen(port, () => {
  console.log(`Express app running on http://localhost:${port}`);
});