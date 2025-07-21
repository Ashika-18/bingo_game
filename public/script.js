// public/script.js

console.log('script.js が読み込まれました。');

// DOM要素の変数をnullで宣言し、DOMContentLoadedで初期化する
let bingoCardElement = null;
let generateCardButton = null;
let callNumberButton = null;
let currentNumberDisplay = null;
let roomCodeInput = null;
let joinRoomButton = null;
let roomStatus = null;
let resetGameButton = null;
let historyList = null; // history-list (全て小文字) を取得する変数

// Socket.IOサーバーに接続
const socket = io();

// 現在のビンゴカードの状態を保持する変数
let currentBingoCard = [];
let currentRoomCode = ''; // 参加中の部屋番号

// --- Socket.IOイベントリスナー ---
socket.on('connect', () => {
    console.log('Connected to Socket.IO server:', socket.id);
    if (roomStatus) {
        roomStatus.textContent = '接続済み。部屋に参加してください。';
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from Socket.IO server.');
    if (roomStatus) {
        roomStatus.textContent = '切断されました。';
    }
    if (callNumberButton) callNumberButton.disabled = true;
    if (resetGameButton) resetGameButton.disabled = true;
    if (generateCardButton) generateCardButton.disabled = true;
});

// サーバーから抽選数字がブロードキャストされたとき
socket.on('bingoNumberCalled', (number) => {
    if (currentNumberDisplay) {
        currentNumberDisplay.textContent = number.toString();
        console.log('現在の抽選数字を更新しました!:', number);// 確認用のログを追加
    } else {
        console.error('Error: currrentNumberDisplay 要素が見つかりません!');// エラーログを追加
    }
    markNumberOnCard(number);
    // TODO: ここでビンゴ判定ロジックを呼び出す
});

// サーバーから現在の抽選済み数字リストが送信されたとき (参加時や数字抽選後)
socket.on('currentCalledNumbers', (calledNumbers) => {
    console.log('Received current called numbers:', calledNumbers);
    if (historyList) {
        historyList.innerHTML = ''; // リストをクリア
        calledNumbers.forEach(num => {
            const span = document.createElement('span');
            span.textContent = num.toString();
            span.className = 'history-number';
            historyList.appendChild(span);
        });
    } else {
        console.error("Error: historyList element not found when receiving currentCalledNumbers.");
    }
});

// サーバーからゲーム終了が通知されたとき
socket.on('gameEnded', (message) => {
    if (currentNumberDisplay) {
        currentNumberDisplay.textContent = message;
    }
    alert(message);
    if (callNumberButton) callNumberButton.disabled = true;
});

// サーバーからゲームリセットが通知されたとき
socket.on('gameReset', (data) => {
    alert(data.message);
    const newCard = generateBingoCard(); // クライアント側でカード生成
    renderBingoCard(newCard); // 生成したカードを表示

    // UIの状態をリセット
    if (currentNumberDisplay) currentNumberDisplay.textContent = '--';
    if (callNumberButton) callNumberButton.disabled = false;
    if (historyList) historyList.innerHTML = ''; // 履歴をクリア
    console.log('クライアント側でゲームがリセットされました。');
});

// サーバーからエラーメッセージを受信したとき
socket.on('error', (message) => {
    alert(`エラー: ${message}`);
    console.error(`Socket.IO Error: ${message}`);
});


// --- DOM操作とイベントリスナー ---

/**
 * ビンゴカードをHTMLにレンダリング（表示）する関数
 * @param {Array<Array<number | null>>} card - ビンゴカードのデータ
 */
function renderBingoCard(card) {
    if (bingoCardElement) {
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
                    cell.classList.add('free-space');
                } else {
                    cell.textContent = cellValue.toString();
                }
                bingoCardElement.appendChild(cell);
            }
        }
    } else {
        console.error("Error: bingoCardElement not found when rendering card.");
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


// ページが完全に読み込まれた時に初期UI設定とイベントリスナーを登録
// ★ここのDOMContentLoadedは一つだけです。二重ネストは削除してください。
document.addEventListener('DOMContentLoaded', () => {
    // 全てのDOM要素をここで確実に取得する
    bingoCardElement = document.getElementById('bingo-card');
    generateCardButton = document.getElementById('generateCardButton');
    callNumberButton = document.getElementById('callNumberButton');
    currentNumberDisplay = document.getElementById('current-number');
    roomCodeInput = document.getElementById('roomCodeInput');
    joinRoomButton = document.getElementById('joinRoomButton');
    roomStatus = document.getElementById('roomStatus');
    resetGameButton = document.getElementById('resetGameButton');
    historyList = document.getElementById('history-list'); // IDは全て小文字の 'history-list' です

    // 初期状態ではボタンを無効化 (DOMContentLoaded後に実行)
    // ここで null チェックを行うことで、エラーを防ぎます
    if (callNumberButton) callNumberButton.disabled = true;
    if (resetGameButton) resetGameButton.disabled = true;
    if (generateCardButton) generateCardButton.disabled = true;

    // joinRoomButtonのイベントリスナーはDOMContentLoaded内で設定
    if (joinRoomButton) {
        joinRoomButton.addEventListener('click', () => {
            const roomCode = roomCodeInput ? roomCodeInput.value.trim() : '';
            if (roomCode) {
                currentRoomCode = roomCode;
                socket.emit('joinRoom', roomCode); // サーバーに部屋参加イベントを送信
                if (roomStatus) roomStatus.textContent = `部屋: ${roomCode} に参加中`;
                
                if (generateCardButton) generateCardButton.disabled = false;
                if (callNumberButton) callNumberButton.disabled = false;
                if (resetGameButton) resetGameButton.disabled = false;
                
                const newCard = generateBingoCard();
                renderBingoCard(newCard);
            } else {
                alert('部屋番号を入力してください。');
            }
        });
    }

    // callNumberButtonのイベントリスナーはDOMContentLoaded内で設定
    if (callNumberButton) {
        callNumberButton.addEventListener('click', () => {
            if (!currentRoomCode) {
                alert('先に部屋に参加してください。');
                return;
            }
            socket.emit('callNumber'); // サーバーに数字抽選イベントを送信
        });
    }

    // generateCardButtonのイベントリスナーはDOMContentLoaded内で設定
    if (generateCardButton) {
        generateCardButton.addEventListener('click', () => {
            if (!currentRoomCode) {
                alert('先に部屋に参加してください。');
                return;
            }
            const newCard = generateBingoCard();
            renderBingoCard(newCard);

            if (currentNumberDisplay) currentNumberDisplay.textContent = '--';
        });
    }

    // resetGameButtonのイベントリスナーはDOMContentLoaded内で設定
    if (resetGameButton) {
        resetGameButton.addEventListener('click', () => {
            if (!currentRoomCode) {
                alert('先に部屋に参加してください。');
                return;
            }
            if (confirm('本当にゲームをリセットしますか？この部屋の全員に影響します。')) {
                socket.emit('resetGame'); // サーバーにゲームリセットイベントを送信
            }
        });
    }

    // 初期表示メッセージ (DOMContentLoadedイベント後に安全に実行)
    if (bingoCardElement) {
        bingoCardElement.innerHTML = '<p>部屋に参加してゲームを開始してください。</p>';
    }
    console.log('ページロード完了。部屋に参加待機中。');
});


// generateBingoCard 関数を public/script.js の中に直接定義します。
function generateBingoCard() {
    const card = Array(5).fill(null).map(() => Array(5).fill(null));
    const ranges = {
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
        numbersInColumn.sort((a, b) => a - b);

        for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
            if (letter === 'N' && rowIndex === 2) {
                card[rowIndex][colIndex] = null; // FREEスペース
            } else {
                card[rowIndex][colIndex] = numbersInColumn.shift();
            }
        }
    });
    return card;
}