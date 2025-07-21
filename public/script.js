// public/script.js
import { io } from 'socket.io-client';

const bingoCardElement = document.getElementById('bingo-card');
const generateCardButton = document.getElementById('generateCardButton');
const callNumberButton = document.getElementById('callNumberButton');
const currentNumberDisplay = document.getElementById('current-number');

const roomCodeInput = document.getElementById('roomCodeInput');
const joinRoomButton = document.getElementById('joinRoomButton');
const roomStatus = document.getElementById('roomStatus');
const resetGameButton = document.getElementById('resetGameButton');
const historyList = document.getElementById('history-List');

// Socket.IOサーバーに接続
const socket = io();

// 現在のビンゴカードの状態を保持する変数
let currentBingoCard = [];
let currentRoomCode = '';// 参加中の部屋番号

// 初期状態ではボタンを無効化
callNumberButton.disabled = true;
resetGameButton.disabled = true;
generateCardButton.disabled = true;// 部屋に参加するまでカードも生成無効に

// Socket.IOイベントリスナー
socket.on('connect', () => {
    console.log('Connected to Socket.IO server:', socket.id);
    roomStatus.textContent = '接続済み. 部屋に参加してください!';
});

socket.on('disconnect', () => {
    console.log('Disconnected from Socket.IO sever.');
    roomStatus.textContent = '切断されました!';
    callNumberButton.disabled = true;
    resetGameButton.disabled = true;
    generateCardButton.disabled = true;
});

// サーバーから抽選数字がブロードキャストされたとき
socket.on('bingoNumberCalled', (number) => {
    currentNumberDisplay.textContent = number.toString();
    markNumberOnCard(number);
    // TODO: ここでビンゴ判定ロジックを呼び出す
});

// サーバーから現在の抽選済み数字リストが送信されたとき (参加時や数字抽選後)
socket.on('currentCalledNumbers', (calledNumbers) => {
    console.log('Received current called numbers:', calledNumbers);
    historyList.innerHTML = '';// リストをクリア
    calledNumbers.forEach(num => {
        const span = document.createElement('span');
        span.textContent = num.toString();
        span.className = 'history-number';
        historyList.appendChild(span);
    });
});

// サーバーからゲーム終了が通知されたとき
socket.on('gameEnded', (message) => {
    currentNumberDisplay.textContent = message;
    alert(message);
    callNumberButton.disabled = true;
});

// サーバーからゲームリセットが通知されたとき
socket.on('gameReset', (data) => {
    alert(data.message);
    const newCard = generateBingoCard();// クライアント側でカード生成
    renderBingoCard(newCard);// 生成したカードを表示

    // UIの状態をリセット
    currentNumberDisplay.textContent = '__';
    callNumberButton.disabled = false;
    historyList.innerHTML = '';// 履歴をクリア
    console.log('クライアント側でゲーム他リセットされました!');
});

// サーバーからエラーメッセージを受信したとき
socket.on('error', (message) => {
    alert(`エラー: ${message}`);
});

/**
 * ビンゴカードをHTMLにレンダリング（表示）する関数
 * @param {Array<Array<number | null>>} card - ビンゴカードのデータ
 */
function renderBingoCard(card) {
    bingoCardElement.innerHTML = '';
    currentBingoCard = card;

    const headers = ['B', 'I', 'N', 'G', 'O'];
    headers.forEach(headerText => {
        const headerCell = document.createElement('div');
        headerCell.className = 'header-cell';
        headerCell.textContent = headerText;
        bingoCardElement.appendChild(headerCell);
    });

    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cellValue = card[row][col];
            const cell = document.createElement('div');
            cell.className = 'bingo-cell';

            if (cellValue !== null) {
                cell.id = `cell-${cellValue}`;
            }
            if (cellValue === null) {
                cell.textContent = 'FREE';
                cell.classList.add('ftee-space');
            }
            bingoCardElement.appendChild(cell);
        }
    }
}

/**
 * ビンゴカード上の数字をマークする関数
 * @param {number} numberToMark - マークする数字
 */
function markNumberOnCard(numberToMark) {
    const cellToMark = document.getElementById(`cell-${numberToMark}`);
    if (cellToMark) {
        cellToMark.classList.add('marked');
    }
}

// 「部屋に参加」ボタンのクリックイベント
joinRoomButton.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    if (roomCode) {
        currentRoomCode = roomCode;
        socket.emit('joinRoom', roomCode);// サーバーに部屋参加イベントを送信
        roomStatus.textContent = `部屋: ${roomCode} に参加中`;

        generateCardButton.disabled = false;
        callNumberButton.disabled = false;
        resetGameButton.disabled = false;

        const newCard = generateBingoCard();
        renderBingoCard(newCard);
    } else {
        alert('部屋番号を入力してください!');
    }
});

// 「数字を引く」ボタンがクリックされた時の処理 (Socket.IOイベント送信に変更)
callNumberButton.addEventListener('click', () => {
    if (!currentRoomCode) {
        alert('先に部屋に参加してください!');
        return;
    }
    socket.emit('callNumber');// サーバーに数字抽選イベントを送信
});

// 「新しいカードを生成」ボタンがクリックされた時の処理 (クライアント内生成)
generateCardButton.addEventListener('click', () => {
    if (!currentRoomCode) {
        alert('先に部屋に参加してください!');
        return;
    }
    const newCard = generateBingoCard();
    renderBingoCard(newCard);

    currentNumberDisplay.textContent = '__';
});

// 「ゲームをリセット」ボタンがクリックされた時の処理
resetGameButton.addEventListener('click', () => {
    if (!currentRoomCode) {
        alert('先に部屋に参加してください!');
        return;
    }
    if (confirm('本当にゲームをリセットしますか？この部屋の全員に影響します!')) {
        socket.emit('resetGame');// サーバーにゲームリセットイベントを送信
    }
});

// ページが完全に読み込まれた時に初期UI設定 (カード生成は部屋参加後に行う)
document.addEventListener('DOMContentLoaded', () => {
    bingoCardElement.innerHTML = '<p>部屋に参加してゲームを開始してください！</p>';
    console.log('ページロード完了!部屋に参加待機中!');
});

// generateBingoCard 関数を public/script.js の中に直接定義します。
// これにより、クライアント側でビンゴカードを生成できます。
function generateBingoCard() {
    const card = Array(5).fill(null).map(() => Array(5).fill(null));
    const range = {
        'B': { min: 1, max: 15 },
        'I': { min: 16, max: 30 },
        'N': { min: 31, max: 45 },
        'G': { min: 46, max: 60 },
        'O': { min: 61, max: 75 }    
    };
    const letters = ['B', 'I', 'N', 'G', 'O'];
    letters.forEach((letter, colIndex) => {
        const range = ranges[letter];
        const numbersInColumn = [];
        while (numbersInColumn.length < 5) {
            const num = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
            if (!numbersInColumn.includes(num)) {
                numbersInColumn.push(num);
            }
        }
numbersInColumn.sort((a, b) => a -b);
for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
    if (letter === 'N' && rowIndex === 2) {
        card[rowIndex][colIndex] = null;// FREE スペース
    } else {
        card[rowIndex][colIndex] = numbersInColumn.shift();
        }
    }
});
    return card; 
 }