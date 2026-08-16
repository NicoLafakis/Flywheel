// js/multiplayer/ui.js — Clean, Modern UI Presentation Components for Multiplayer (Zero Emojis, Pointer-Events Enabled)

import {
  COUNTDOWN_SECONDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MULTIPLAYER_SCENES,
  PLAYER_PALETTES,
} from './config.js';

export class MultiplayerUI {
  constructor({ rootElement, audio, onHostCreate, onPeerJoin, onLeaveLobby }) {
    this.root = rootElement || document.getElementById('screen-root');
    this.audio = audio;
    this.onHostCreate = onHostCreate;
    this.onPeerJoin = onPeerJoin;
    this.onLeaveLobby = onLeaveLobby;
    this._container = null;
    this._chatContainer = null;
    this._countdownEl = null;
  }

  showHostCreateModal({ onCancel, onCreate, onJoin }) {
    this.clear();
    const modal = document.createElement('div');
    modal.className = 'screen mp-screen';
    modal.id = 'mp-create-modal';
    modal.style.pointerEvents = 'auto';

    let activeTab = 'host';
    let selectedScene = 'gallery';
    let selectedPlayers = 4;

    modal.innerHTML = `
      <div class="mp-card">
        <div class="mp-header">
          <div class="mp-title">MULTIPLAYER</div>
          <div class="mp-badge">2-6 PLAYERS</div>
        </div>

        <div class="mp-nav-tabs">
          <button id="mp-tab-host" class="mp-tab-btn active" type="button">HOST MATCH</button>
          <button id="mp-tab-join" class="mp-tab-btn" type="button">JOIN WITH CODE</button>
        </div>

        <!-- Host Section -->
        <div id="mp-host-section" class="mp-tab-panel">
          <div class="mp-section-title">CHOOSE METROPOLIS</div>
          <div class="mp-scene-grid">
            <div class="mp-scene-chip active" data-scene="gallery">
              <div class="mp-scene-info">
                <span class="mp-scene-name">THE LAB</span>
                <span class="mp-scene-sub">Stage 1 · 12,213 Blocks · Warmup Grid</span>
              </div>
              <div class="mp-scene-pill-badge">LEVEL 1</div>
            </div>
            <div class="mp-scene-chip" data-scene="manhattan">
              <div class="mp-scene-info">
                <span class="mp-scene-name">LOWER MANHATTAN</span>
                <span class="mp-scene-sub">Stage 2 · 25,875 Blocks · Financial Grid</span>
              </div>
              <div class="mp-scene-pill-badge">LEVEL 2</div>
            </div>
            <div class="mp-scene-chip" data-scene="brooklyn">
              <div class="mp-scene-info">
                <span class="mp-scene-name">BROOKLYN</span>
                <span class="mp-scene-sub">Stage 3 · 39,984 Blocks · Waterfront Metropolis</span>
              </div>
              <div class="mp-scene-pill-badge">LEVEL 3</div>
            </div>
          </div>

          <div class="mp-section-title" style="margin-top: 14px;">PLAYER CAPACITY (2 TO 6 PLAYERS)</div>
          <div class="mp-stepper-row">
            <button id="mp-cap-minus" class="mp-step-btn" type="button" aria-label="Decrease capacity">-</button>
            <div class="mp-cap-display">
              <span id="mp-cap-num">4</span>
              <span class="mp-cap-label">4 PLAYERS (HOST + 3)</span>
            </div>
            <button id="mp-cap-plus" class="mp-step-btn" type="button" aria-label="Increase capacity">+</button>
          </div>
          <div class="mp-cap-pills">
            <button class="mp-cap-pill" data-count="2" type="button">2 PLAYERS</button>
            <button class="mp-cap-pill" data-count="3" type="button">3 PLAYERS</button>
            <button class="mp-cap-pill active" data-count="4" type="button">4 PLAYERS</button>
            <button class="mp-cap-pill" data-count="5" type="button">5 PLAYERS</button>
            <button class="mp-cap-pill" data-count="6" type="button">6 PLAYERS</button>
          </div>

          <div class="mp-actions" style="margin-top: 18px;">
            <button id="mp-btn-create" class="btn primary mp-btn-primary" type="button">CREATE ROOM</button>
            <button id="mp-btn-cancel-1" class="btn secondary" type="button">BACK</button>
          </div>
        </div>

        <!-- Join Section -->
        <div id="mp-join-section" class="mp-tab-panel hidden">
          <div class="mp-section-title">ENTER 5-LETTER ROOM CODE</div>
          <div class="mp-join-box">
            <input id="mp-room-input" class="mp-room-input" type="text" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" />
            <p class="mp-join-hint">Ask the match host for their 5-character room code or open their invite link directly.</p>
          </div>

          <div class="mp-actions" style="margin-top: 18px;">
            <button id="mp-btn-join-submit" class="btn primary mp-btn-primary" type="button">JOIN ROOM</button>
            <button id="mp-btn-cancel-2" class="btn secondary" type="button">BACK</button>
          </div>
        </div>
      </div>
    `;

    this.root.appendChild(modal);
    this._container = modal;

    // Tabs toggle
    const tabHost = modal.querySelector('#mp-tab-host');
    const tabJoin = modal.querySelector('#mp-tab-join');
    const hostSec = modal.querySelector('#mp-host-section');
    const joinSec = modal.querySelector('#mp-join-section');

    tabHost.addEventListener('click', () => {
      activeTab = 'host';
      tabHost.classList.add('active');
      tabJoin.classList.remove('active');
      hostSec.classList.remove('hidden');
      joinSec.classList.add('hidden');
      if (this.audio?.ui?.playTap) this.audio.ui.playTap();
    });

    tabJoin.addEventListener('click', () => {
      activeTab = 'join';
      tabJoin.classList.add('active');
      tabHost.classList.remove('active');
      joinSec.classList.remove('hidden');
      hostSec.classList.add('hidden');
      const input = modal.querySelector('#mp-room-input');
      if (input) input.focus();
      if (this.audio?.ui?.playTap) this.audio.ui.playTap();
    });

    // Handle scene chip selection
    const chips = modal.querySelectorAll('.mp-scene-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        selectedScene = chip.dataset.scene;
        if (this.audio?.ui?.playTap) this.audio.ui.playTap();
      });
    });

    // Handle capacity stepper and quick pills
    const capNum = modal.querySelector('#mp-cap-num');
    const capLabel = modal.querySelector('.mp-cap-label');
    const minusBtn = modal.querySelector('#mp-cap-minus');
    const plusBtn = modal.querySelector('#mp-cap-plus');
    const capPills = modal.querySelectorAll('.mp-cap-pill');

    const updateCap = () => {
      capNum.textContent = selectedPlayers;
      const rivals = selectedPlayers - 1;
      capLabel.textContent = `${selectedPlayers} PLAYERS (1 HOST + ${rivals} ${rivals === 1 ? 'RIVAL' : 'RIVALS'}${selectedPlayers === MAX_PLAYERS ? ' — MAX' : ''})`;
      minusBtn.disabled = selectedPlayers <= MIN_PLAYERS;
      minusBtn.style.opacity = selectedPlayers <= MIN_PLAYERS ? '0.35' : '1';
      plusBtn.disabled = selectedPlayers >= MAX_PLAYERS;
      plusBtn.style.opacity = selectedPlayers >= MAX_PLAYERS ? '0.35' : '1';
      capPills.forEach((pill) => {
        if (Number(pill.dataset.count) === selectedPlayers) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });
    };

    minusBtn.addEventListener('click', () => {
      if (selectedPlayers > MIN_PLAYERS) {
        selectedPlayers--;
        updateCap();
        if (this.audio?.ui?.playTap) this.audio.ui.playTap();
      }
    });

    plusBtn.addEventListener('click', () => {
      if (selectedPlayers < MAX_PLAYERS) {
        selectedPlayers++;
        updateCap();
        if (this.audio?.ui?.playTap) this.audio.ui.playTap();
      }
    });

    capPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const count = Number(pill.dataset.count);
        if (count >= MIN_PLAYERS && count <= MAX_PLAYERS) {
          selectedPlayers = count;
          updateCap();
          if (this.audio?.ui?.playTap) this.audio.ui.playTap();
        }
      });
    });

    updateCap();

    const cancelHandler = () => {
      this.clear();
      if (onCancel) onCancel();
    };
    modal.querySelector('#mp-btn-cancel-1').addEventListener('click', cancelHandler);
    modal.querySelector('#mp-btn-cancel-2').addEventListener('click', cancelHandler);

    modal.querySelector('#mp-btn-create').addEventListener('click', () => {
      if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
      if (onCreate) onCreate({ scene: selectedScene, maxPlayers: selectedPlayers });
    });

    const joinSubmitBtn = modal.querySelector('#mp-btn-join-submit');
    const roomInput = modal.querySelector('#mp-room-input');
    const handleJoin = () => {
      const code = (roomInput.value || '').trim().toUpperCase();
      if (code.length >= 3) {
        if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
        if (onJoin) onJoin(code);
        else if (this.onPeerJoin) this.onPeerJoin(code);
      } else {
        roomInput.focus();
      }
    };
    joinSubmitBtn.addEventListener('click', handleJoin);
    roomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoin();
    });
  }

  showLobby(lobby, { onLeave, onForceStart }) {
    this.clear();
    const lobbyView = document.createElement('div');
    lobbyView.className = 'screen mp-screen mp-lobby-view';
    lobbyView.id = 'mp-lobby-screen';
    lobbyView.style.pointerEvents = 'auto';

    lobbyView.innerHTML = `
      <div class="mp-lobby-container">
        <!-- Lobby Header -->
        <div class="mp-lobby-header">
          <div class="mp-room-pill">
            <span class="mp-room-lbl">ROOM:</span>
            <span class="mp-room-code">${lobby.roomCode}</span>
          </div>
          <div class="mp-scene-pill">
            <span class="mp-scene-badge">${lobby.scene.toUpperCase()} · ${lobby.maxPlayers} PLAYERS</span>
          </div>
          <button id="mp-lobby-leave" class="btn secondary mp-leave-btn" type="button">LEAVE</button>
        </div>

        <!-- Invite Banner -->
        <div class="mp-invite-card">
          <div class="mp-invite-left">
            <span class="mp-invite-title">INVITE LINK</span>
            <span class="mp-invite-sub">Share this link with other players to join the match</span>
          </div>
          <button id="mp-copy-link-btn" class="btn primary mp-copy-btn" type="button">
            COPY INVITE LINK
          </button>
        </div>

        <!-- Main Content Split (Roster + Ephemeral Chat) -->
        <div class="mp-lobby-body">
          <!-- Left: Player Roster -->
          <div class="mp-roster-column">
            <div class="mp-column-header">
              <span>PLAYERS (<span id="mp-roster-count">${lobby.connectedCount}</span>/${lobby.maxPlayers})</span>
              <span id="mp-lobby-status" class="mp-status-pulse">Waiting for players...</span>
            </div>
            <div id="mp-roster-grid" class="mp-roster-grid">
              ${this._renderRosterHTML(lobby)}
            </div>
            ${lobby.isHost ? `
              <div class="mp-host-ctrls">
                <button id="mp-force-start" class="btn primary mp-start-btn" type="button">
                  START NOW (${lobby.connectedCount}/${lobby.maxPlayers})
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Right: Ephemeral Chat -->
          <div class="mp-chat-column">
            <div class="mp-column-header">
              <span>LOBBY CHAT</span>
              <span class="mp-chat-note">EPHEMERAL (NEVER STORED)</span>
            </div>
            <div id="mp-chat-feed" class="mp-chat-feed">
              <div class="mp-chat-welcome">Lobby chat is active. Messages are in-memory only and vanish when the match begins.</div>
            </div>
            <form id="mp-chat-form" class="mp-chat-form">
              <input id="mp-chat-input" class="mp-chat-input" type="text" maxlength="140" placeholder="Type a message (Enter to send)..." autocomplete="off" />
              <button class="btn primary mp-chat-send" type="submit">SEND</button>
            </form>
          </div>
        </div>
      </div>

      <!-- Auto-Start Countdown Modal (Hidden by default) -->
      <div id="mp-countdown-modal" class="mp-countdown-overlay hidden">
        <div class="mp-countdown-card">
          <div class="mp-countdown-title">ALL PLAYERS JOINED</div>
          <div id="mp-countdown-num" class="mp-countdown-num">3</div>
          <div class="mp-countdown-sub">MATCH STARTING...</div>
        </div>
      </div>
    `;

    this.root.appendChild(lobbyView);
    this._container = lobbyView;
    this._chatContainer = lobbyView.querySelector('#mp-chat-feed');
    this._countdownEl = lobbyView.querySelector('#mp-countdown-modal');

    // Hook copy button with native navigator.clipboard + toast
    const copyBtn = lobbyView.querySelector('#mp-copy-link-btn');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(lobby.inviteUrl);
        copyBtn.textContent = 'COPIED LINK!';
        copyBtn.classList.add('copied');
        if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
        setTimeout(() => {
          copyBtn.textContent = 'COPY INVITE LINK';
          copyBtn.classList.remove('copied');
        }, 2500);
      } catch (e) {
        copyBtn.textContent = lobby.roomCode;
      }
    });

    // Leave button
    lobbyView.querySelector('#mp-lobby-leave').addEventListener('click', () => {
      if (onLeave) onLeave();
    });

    // Force start button (if host)
    const forceStartBtn = lobbyView.querySelector('#mp-force-start');
    if (forceStartBtn) {
      forceStartBtn.addEventListener('click', () => {
        if (lobby.connectedCount >= 2) {
          if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
          lobby.startCountdown();
          if (onForceStart) onForceStart();
        }
      });
    }

    // Chat form submit
    const chatForm = lobbyView.querySelector('#mp-chat-form');
    const chatInput = lobbyView.querySelector('#mp-chat-input');
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value;
      if (text && text.trim()) {
        lobby.sendChat(text);
        chatInput.value = '';
        if (this.audio?.ui?.playTap) this.audio.ui.playTap();
      }
    });

    // Wire Lobby Callbacks
    lobby.onRosterChange = (players) => {
      const rosterGrid = this.root.querySelector('#mp-roster-grid');
      const rosterCount = this.root.querySelector('#mp-roster-count');
      const statusPill = this.root.querySelector('#mp-lobby-status');
      if (rosterGrid) rosterGrid.innerHTML = this._renderRosterHTML(lobby);
      if (rosterCount) rosterCount.textContent = lobby.connectedCount;
      if (statusPill) {
        statusPill.textContent = lobby.isFull ? 'Lobby Full! Starting...' : 'Waiting for players...';
      }
      if (forceStartBtn) {
        forceStartBtn.textContent = `START NOW (${lobby.connectedCount}/${lobby.maxPlayers})`;
      }
    };

    lobby.onChat = (msg) => {
      this._appendChatMessage(msg);
    };

    lobby.onCountdownStart = (sec) => {
      if (this._countdownEl) {
        this._countdownEl.classList.remove('hidden');
        const num = this._countdownEl.querySelector('#mp-countdown-num');
        if (num) num.textContent = Math.ceil(sec);
        if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
      }
    };

    lobby.onCountdownTick = (sec) => {
      if (this._countdownEl) {
        const num = this._countdownEl.querySelector('#mp-countdown-num');
        if (num) {
          num.textContent = Math.max(1, Math.ceil(sec));
          num.classList.add('pop');
          setTimeout(() => num.classList.remove('pop'), 200);
        }
        if (this.audio?.ui?.playTap) this.audio.ui.playTap();
      }
    };

    lobby.onCountdownCancel = (reason) => {
      if (this._countdownEl) {
        this._countdownEl.classList.add('hidden');
      }
    };
  }

  _renderRosterHTML(lobby) {
    let html = '';
    for (let i = 0; i < lobby.maxPlayers; i++) {
      const p = lobby.players[i];
      const color = PLAYER_PALETTES[i] || '#00f0ff';
      if (p) {
        html += `
          <div class="mp-roster-card filled" style="--p-color: ${color}">
            <div class="mp-player-avatar" style="background: ${color}">
              <span>${p.isHost ? 'H' : (i + 1)}</span>
            </div>
            <div class="mp-player-meta">
              <span class="mp-player-name">${p.name}</span>
              <span class="mp-player-tag">${p.isHost ? 'HOST' : 'PLAYER'}</span>
            </div>
            <div class="mp-player-dot" style="background: ${color}"></div>
          </div>
        `;
      } else {
        html += `
          <div class="mp-roster-card empty">
            <div class="mp-player-avatar empty">
              <span>+</span>
            </div>
            <div class="mp-player-meta">
              <span class="mp-player-name empty">Open Slot</span>
              <span class="mp-player-tag empty">WAITING...</span>
            </div>
          </div>
        `;
      }
    }
    return html;
  }

  _appendChatMessage(msg) {
    if (!this._chatContainer) return;
    const isSys = msg.slot === -1;
    const msgEl = document.createElement('div');
    msgEl.className = isSys ? 'mp-chat-msg system' : 'mp-chat-msg';

    if (isSys) {
      msgEl.innerHTML = `<span class="mp-chat-sys-text">${msg.text}</span>`;
    } else {
      msgEl.innerHTML = `
        <span class="mp-chat-author" style="color: ${msg.color || '#fff'}">${msg.name}:</span>
        <span class="mp-chat-body">${msg.text}</span>
      `;
    }

    this._chatContainer.appendChild(msgEl);
    this._chatContainer.scrollTop = this._chatContainer.scrollHeight;
  }

  showRespawnOverlay(remainingSeconds) {
    let overlay = document.getElementById('mp-respawn-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mp-respawn-overlay';
      overlay.className = 'mp-respawn-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="mp-respawn-card">
        <div class="mp-respawn-title">SWALLOWED BY RIVAL!</div>
        <div class="mp-respawn-timer">${Math.ceil(remainingSeconds)}s</div>
        <div class="mp-respawn-sub">RESPAWNING SOON...</div>
      </div>
    `;
    overlay.classList.remove('hidden');
  }

  hideRespawnOverlay() {
    const overlay = document.getElementById('mp-respawn-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  showMultiplayerPodium(gameOverData, { onPlayAgain, onExit }) {
    this.clear();
    const podiumView = document.createElement('div');
    podiumView.className = 'screen mp-screen mp-podium-view';
    podiumView.style.pointerEvents = 'auto';

    const lb = gameOverData?.finalLeaderboard || [];
    const winner = lb[0] || { name: 'Player 1', score: 0 };

    let rowsHTML = '';
    lb.forEach((p, idx) => {
      const ranks = ['1ST', '2ND', '3RD'];
      const rankDisplay = ranks[idx] || `#${p.rank}`;
      rowsHTML += `
        <div class="mp-podium-row ${idx === 0 ? 'winner' : ''}">
          <div class="mp-rank-badge">${rankDisplay}</div>
          <div class="mp-row-color" style="background: ${p.color || '#00f0ff'}"></div>
          <div class="mp-row-name">${p.name}</div>
          <div class="mp-row-stats">
            <span class="mp-stat-score">${p.score.toLocaleString()} PTS</span>
            <span class="mp-stat-mass">${p.mass} kg</span>
            <span class="mp-stat-kills">${p.kills || 0} KILLS</span>
          </div>
        </div>
      `;
    });

    podiumView.innerHTML = `
      <div class="mp-podium-container">
        <div class="mp-podium-header">
          <div class="mp-winner-title">${winner.name.toUpperCase()} WINS!</div>
          <div class="mp-winner-sub">TOTAL METROPOLIS DEMOLITION</div>
        </div>

        <div class="mp-leaderboard-card">
          ${rowsHTML}
        </div>

        <div class="mp-podium-actions">
          <button id="mp-btn-again" class="btn primary" type="button">PLAY AGAIN</button>
          <button id="mp-btn-menu" class="btn secondary" type="button">MAIN MENU</button>
        </div>
      </div>
    `;

    this.root.appendChild(podiumView);
    this._container = podiumView;

    podiumView.querySelector('#mp-btn-again').addEventListener('click', () => {
      if (onPlayAgain) onPlayAgain();
    });

    podiumView.querySelector('#mp-btn-menu').addEventListener('click', () => {
      if (onExit) onExit();
    });
  }

  clear() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this._chatContainer = null;
    this._countdownEl = null;
  }
}
