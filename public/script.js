// public/script.js

console.log('script.js が読み込まれました。');

// グローバルスコープで変数を宣言（DOMContentLoaded内で初期化）
let socket;
let bingoCardElement = null;
let generateCardButton = null;
let callNumberButton = null;
let currentNumberDisplay = null;
let roomCodeInput = null;
let joinRoomButton = null;
let roomStatus = null;
let resetGameButton = null;
let historyList = null;
let currentBingoCard = [];
let currentRoomCode = ''; // 参加中の部屋番号

// DOMが完全に読み込まれた時に初期UI設定とイベントリスナーを登録
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

    const playerListElement = document.getElementById('player-list');

    // ★ Socket.IOのインスタンスをここで初期化します
    socket = io();

    // --- Socket.IOイベントリスナー ---
    socket.on('connect', () => {
        console.log('Connected to Socket.IO server:', socket.id);
        if (roomStatus) {
            roomStatus.textContent = '接続済み。部屋に参加してください。';
        }
        // 接続完了後に(部屋に参加)ボタンを有効化する
        if (joinRoomButton) joinRoomButton.disabled = false;
    });

    // サーバーからプレイヤーのリストの更新を受け取った時の処理を追加
    socket.on('playerListUpdate', (players, gameMasterId) => {
        if (playerListElement) {
            playerListElement.innerHTML = players.map(p => {
                const isMaster = p.id === gameMasterId;
                return `<li>${p.name} ${isMaster ? '👑' : ''}</li>`;
            }).join('');
        }
        if (callNumberButton) {
            const isMeMaster = socket.id === gameMasterId;
            const isGameReady = players.length >= 2;
            
            // ゲームマスターであり、かつプレイヤーが2人以上の場合にのみボタンを有効化
            if (isMeMaster) {
                callNumberButton.style.display = 'block';

                callNumberButton.disabled = !isGameReady;
            } else {
                callNumberButton.style.display = 'none';
            }
        }
    });

    // サーバーからルーム参加完了の応答を受け取ったとき
    socket.on('roomJoined', (data) => {
        const { roomCode, playerName } = data;
        currentRoomCode = roomCode;
        console.log(`ルーム ${roomCode} にプレイヤー ${playerName} として参加しました!`);
        roomStatus.textContent = `ルームID: ${roomCode} (プレイヤー: ${playerName})`;
        
        // 参加が完了したら参加ボタンを無効化
        if (joinRoomButton) {
            joinRoomButton.disabled = true;
        }
    })

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
    socket.on('bingoNumberCalled', (data) => {
        const {number, calledNumbers} = data;
        if (currentNumberDisplay) {
            currentNumberDisplay.textContent = number.toString();
            console.log('現在の抽選数字を更新しました!:', number);// 確認用のログを追加
        } else {
            console.error('Error: currentNumberDisplay 要素が見つかりません!');// エラーログを追加
        }
        // サーバーから送られた数字リストに基づいてカードを更新し再描画
        if (currentBingoCard.length > 0) {
            currentBingoCard.forEach(row => {
                row.forEach(cell => {
                    cell.isMarked = false;
                    
                    if (cell.value === null) {
                        cell.isMarked = true;
                    }
                    if (calledNumbers.includes(cell.value)) {
                        cell.isMarked = true;
                    }
                });
            });
            renderBingoCard(currentBingoCard);
        }

        // 呼ばれた数字リストを更新
        renderCalledNumbers(calledNumbers);
    });

    // サーバーからビンゴ達成が通知されたとき
    socket.on('playerBingoAnnounce', (data) => {
        const {playerName} = data;
        alert(`プレイヤー${playerName} がBINGO達成!`);
        // ビンゴ達成時に抽選ボタンを無効化
        if (callNumberButton) {
            callNumberButton.disabled = true;
        }
    });

    // サーバーからゲーム終了が通知されたとき
    socket.on('gameEnded', (data) => {
        const { winner, message } = data;

        if (winner) {
            if (currentNumberDisplay) {
                currentNumberDisplay.textContent = `${winner}さんのビンゴでゲーム終了!`;
            }
            alert(`${winner}さんのビンゴでゲーム終了！`);
        } else {
            if (currentNumberDisplay) {
                currentNumberDisplay.textContent = message;
            }
            alert(message);
        }
        // どちらの場合でもボタンは無効か
        if (callNumberButton) callNumberButton.disabled = true;
        if (generateCardButton) generateCardButton.disabled = true;
        if (resetGameButton) resetGameButton.disabled = false;
    });

    // サーバーからゲームリセットが通知されたとき
    socket.on('gameReset', (data) => {
        alert('ゲームがリセットされました!');
        const newCard = generateBingoCard();
        currentBingoCard = newCard;
        renderBingoCard(currentBingoCard); // 生成したカードを表示

        // UIの状態をリセット
        if (currentNumberDisplay) currentNumberDisplay.textContent = '--';
        if (callNumberButton) callNumberButton.disabled = true;
        if (generateCardButton) generateCardButton.disabled = false;
        // リセット時に参加ボタンを有効化
        if (joinRoomButton) joinRoomButton.disabled = false;
        if (resetGameButton) resetGameButton.disabled = true;
        // カードと数字のリストもリセット
        currentBingoCard = [];
        renderBingoCard(currentBingoCard);
        renderCalledNumbers([]);
        console.log('クライアント側でゲームがリセットされました。');
    });

    // サーバーからエラーメッセージを受信したとき
    socket.on('error', (message) => {
        alert(`エラー: ${message}`);
        console.error(`Socket.IO Error: ${message}`);
    });
        // joinRoomButtonのイベントリスナーはDOMContentLoaded内で設定
        if (joinRoomButton) {
            joinRoomButton.addEventListener('click', () => {
                // 既に部屋にいる場合は処理を中断
                if (currentRoomCode) {
                    alert('すでに部屋に参加中です!');
                    return;
                }
                const roomCode = roomCodeInput ? roomCodeInput.value.trim() : '';
                // ここでplayerNameを定義
                const playerName = document.getElementById('playerNameInput').value.trim();

                if (!roomCode || !playerName) {
                    alert('部屋番号とあなたの名前を入力してください!');
                    return;
                } 
                currentRoomCode = roomCode;

                socket.emit('joinRoom', roomCode, playerName, (card, calledNumbers) => {
                    if (card) {
                        currentBingoCard = card;
                        renderBingoCard(currentBingoCard);
                        renderCalledNumbers(calledNumbers);
                        if (roomStatus) roomStatus.textContent = `部屋: ${roomCode}に参加中`;
                        
                        // 参加が完了したら参加ボタンと生成ボタンを無効化
                        if (joinRoomButton) joinRoomButton.disabled = true;
                        if (generateCardButton) generateCardButton.disabled = true;
                        if (resetGameButton) resetGameButton.disabled = false;
                } 
            });
        });
    }
    // callNumberButtonのイベントリスナーはDOMContentLoaded内で設定
    if (callNumberButton) {
        callNumberButton.addEventListener('click', () => {
            if (!currentRoomCode) {
                alert('先に部屋に参加してください。');
                return;
            }
            socket.emit('callNumber', currentRoomCode); // サーバーに数字抽選イベントを送信
        });
    }

    // generateCardButtonのイベントリスナーはDOMContentLoaded内で設定
    if (generateCardButton) {
        generateCardButton.addEventListener('click', () => {
            const newCard = generateBingoCard();
            currentBingoCard = newCard;
            renderBingoCard(currentBingoCard);
            
            // 抽選数字表示をリセット
            renderBingoCard(newCard);
            if (currentNumberDisplay) {
                currentNumberDisplay.textContent = '--';
            }
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
                socket.emit('resetGame', currentRoomCode); // サーバーにゲームリセットイベントを送信
            }
        });
    }

    // 初期表示メッセージ (DOMContentLoadedイベント後に安全に実行)
    if (bingoCardElement) {
        bingoCardElement.innerHTML = '<p>部屋に参加してゲームを開始してください。</p>';
    }
    console.log('ページロード完了。部屋に参加待機中。');
});

// --- DOM操作とイベントリスナー ---
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
            card[rowIndex][colIndex] = (letter === 'N' && rowIndex === 2) ? {value: null, isMarked: false} : {value: numbersInColumn.shift(), isMarked: false};
        }
    });
    return card;
}
/**
 * ビンゴカードをHTMLにレンダリング（表示）する関数
 * @param {Array<Array<number | null>>} card - ビンゴカードのデータ
 */
function renderBingoCard(card) {
    if (!bingoCardElement) {
        console.error("Error: bingoCardElement not found when rendering card.");
        return;
    } 
    bingoCardElement.innerHTML = '';
    const headers = ['B', 'I', 'N', 'G', 'O'];
    headers.forEach(headerText => {
        const headerCell = document.createElement('div');
        headerCell.className = 'header-cell';
        headerCell.textContent = headerText;
        bingoCardElement.appendChild(headerCell);
    });
    card.forEach(row => {
        row.forEach(cellObj => {
            const cell = document.createElement('div');
            cell.className = 'bingo-cell';

            const cellValue = cellObj.value;
            if (cellValue === null) {
                cell.textContent = 'FREE';
                cell.classList.add('free-space');
            } else {
                cell.textContent = cellValue.toString();
                cell.id = `cell-${cellValue}`;
                cell.addEventListener('click', () => {
                    if (socket && currentRoomCode) {
                        socket.emit('markCell', currentRoomCode, cellValue, (success, updatedCard, isBingo) => {
                            if (success && updatedCard) {
                                currentBingoCard = updatedCard;
                                renderBingoCard(currentBingoCard);
                                if (isBingo){
                                    alert('-BINGO!-');
                                }
                            } else {
                                console.warn('マーキングに失敗しました!');
                            }
                        });
                    }
                });
            }
            if (cellObj.isMarked) {
                cell.classList.add('marked');
            }
            bingoCardElement.appendChild(cell);
        });
    });
}
// サーバーから呼ばれた数字リストをHTMLに描画
function renderCalledNumbers(numbers) {
    if (historyList) {
        historyList.innerHTML = '';
        numbers.forEach(num => {
            const span = document.createElement('span');
            span.textContent = num.toString();
            span.className = 'history-number';
            historyList.appendChild(span);
        });
    } else {
        console.error("Error: historyList element not found.");
    }
}
