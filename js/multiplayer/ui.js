// js/multiplayer/ui.js — Clean, Modern UI Presentation Components for Multiplayer (Zero Emojis, Pointer-Events Enabled)

import {
  COUNTDOWN_SECONDS,
  MAX_PLAYERS,
  MAX_PLAYER_NAME_LENGTH,
  MIN_PLAYERS,
  MULTIPLAYER_SCENES,
  MULTIPLAYER_SCENE_META,
  PLAYER_PALETTES,
} from './config.js';
// Names, chat text, colours and leaderboard stats all arrive over an open
// broadcast channel. Nothing from the wire reaches innerHTML or a style attribute
// without going through these first.
import { escapeHtml, safeColor, safeNumber } from './sanitize.js';

/** Same clamp the lobby and the wire validator apply, applied at the keyboard. */
function clampPlayerName(raw) {
  return String(raw || '').trim().slice(0, MAX_PLAYER_NAME_LENGTH);
}

// Why a join failed, in words a player can act on. Keyed by the reason the lobby
// surfaces through onJoinRejected.
const JOIN_ERROR_COPY = Object.freeze({
  ROOM_FULL: {
    title: 'ROOM IS FULL',
    body: 'Every slot in this match is taken. Ask the host to start a bigger room, or wait for this match to finish and try the code again.',
  },
  NO_ROOM: {
    title: 'NO SUCH ROOM',
    body: 'Nobody answered on that room code. Check the 5 characters with the host. A room also disappears once its match has ended.',
  },
  JOIN_FAILED: {
    title: 'COULD NOT JOIN',
    body: 'The match could not be joined. Check the room code with the host and try again.',
  },
  HOST_LEFT: {
    title: 'HOST LEFT',
    body: 'The player who set up this room closed it. Start your own room, or ask for a new code.',
  },
});

// How the podium headline explains the ending. GAME_OVER carries the reason, and
// "the host walked out" has to read differently from a clean finish or nobody
// understands why the clock stopped early.
const PODIUM_REASON_COPY = Object.freeze({
  CITY_CLEARED: 'METROPOLIS 100% DEMOLISHED',
  HOST_LEFT: 'HOST LEFT THE MATCH · FINAL STANDINGS',
  TIME_EXPIRED: 'MATCH COMPLETE · TIME EXPIRED',
});

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

  showHostCreateModal({ onCancel, onCreate, onJoin, defaultName = '' }) {
    this.clear();
    const modal = document.createElement('div');
    modal.className = 'screen mp-screen';
    modal.id = 'mp-create-modal';
    modal.style.pointerEvents = 'auto';

    let activeTab = 'host';
    let selectedScene = MULTIPLAYER_SCENES[0];
    let selectedPlayers = 4;

    // One source for which cities multiplayer offers and how they read (config.js),
    // rather than three hand-written chips that drift from the list.
    const sceneChips = MULTIPLAYER_SCENES.map((scene, idx) => {
      const meta = MULTIPLAYER_SCENE_META[scene] || { name: scene.toUpperCase(), sub: '', level: `LEVEL ${idx + 1}` };
      return `
            <div class="mp-scene-chip${idx === 0 ? ' active' : ''}" data-scene="${escapeHtml(scene)}">
              <div class="mp-scene-info">
                <span class="mp-scene-name">${escapeHtml(meta.name)}</span>
                <span class="mp-scene-sub">${escapeHtml(meta.sub)}</span>
              </div>
              <div class="mp-scene-pill-badge">${escapeHtml(meta.level)}</div>
            </div>`;
    }).join('');

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
          <div class="mp-scene-grid">${sceneChips}
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
            <input id="mp-join-name" class="mp-name-input" type="text" maxlength="${MAX_PLAYER_NAME_LENGTH}" placeholder="YOUR NAME" autocomplete="off" spellcheck="false" value="${escapeHtml(defaultName)}" />
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
    const nameInput = modal.querySelector('#mp-join-name');
    const handleJoin = () => {
      const code = (roomInput.value || '').trim().toUpperCase();
      const playerName = clampPlayerName(nameInput ? nameInput.value : '');
      if (code.length >= 3) {
        if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
        if (onJoin) onJoin({ code, playerName });
        else if (this.onPeerJoin) this.onPeerJoin(code, playerName);
      } else {
        roomInput.focus();
      }
    };
    joinSubmitBtn.addEventListener('click', handleJoin);
    roomInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoin();
    });
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleJoin();
      });
    }
  }

  /**
   * REQ-MP-05: an invite link drops the player straight into a lobby, so the name
   * prompt the code-entry panel provides has to exist on that path too — two of
   * the three PRD personas arrive by link and never see the join tab.
   * Pre-filled from the saved profile so a returning player just taps through.
   */
  showJoinNamePrompt({ roomCode = '', defaultName = '', onConfirm, onCancel }) {
    this.clear();
    const modal = document.createElement('div');
    modal.className = 'screen mp-screen';
    modal.id = 'mp-name-modal';
    modal.style.pointerEvents = 'auto';

    modal.innerHTML = `
      <div class="mp-card mp-card-narrow">
        <div class="mp-header">
          <div class="mp-title">JOIN MATCH</div>
          <div class="mp-badge">ROOM ${escapeHtml(String(roomCode).toUpperCase())}</div>
        </div>

        <div class="mp-section-title">YOUR DISPLAY NAME</div>
        <div class="mp-join-box">
          <input id="mp-name-input" class="mp-name-input" type="text" maxlength="${MAX_PLAYER_NAME_LENGTH}"
                 placeholder="YOUR NAME" autocomplete="off" spellcheck="false"
                 enterkeyhint="go" value="${escapeHtml(defaultName)}" />
          <p class="mp-join-hint">This is the name the other players see on the roster and the podium. Up to ${MAX_PLAYER_NAME_LENGTH} characters.</p>
        </div>

        <div class="mp-actions" style="margin-top: 18px;">
          <button id="mp-btn-name-go" class="btn primary mp-btn-primary" type="button">JOIN ROOM</button>
          <button id="mp-btn-name-back" class="btn secondary" type="button">BACK</button>
        </div>
      </div>
    `;

    this.root.appendChild(modal);
    this._container = modal;

    const input = modal.querySelector('#mp-name-input');
    const confirm = () => {
      if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
      if (onConfirm) onConfirm(clampPlayerName(input ? input.value : ''));
    };

    modal.querySelector('#mp-btn-name-go').addEventListener('click', confirm);
    modal.querySelector('#mp-btn-name-back').addEventListener('click', () => {
      this.clear();
      if (onCancel) onCancel();
    });
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirm();
      });
      // A returning player's name is already there; select it so retyping is one
      // action rather than a backspace-16-times chore.
      input.focus();
      if (input.value) input.select();
    }
  }

  /**
   * A join that cannot succeed must say so and offer a way out. Before this, a
   * full room dropped its JOIN_REJECT on the floor and a mistyped code sat on
   * "Waiting for players..." forever.
   */
  showJoinError({ reason = 'JOIN_FAILED', roomCode = '', onBack, onRetry }) {
    this.clear();
    const copy = JOIN_ERROR_COPY[reason] || JOIN_ERROR_COPY.JOIN_FAILED;

    const modal = document.createElement('div');
    modal.className = 'screen mp-screen';
    modal.id = 'mp-join-error';
    modal.style.pointerEvents = 'auto';

    modal.innerHTML = `
      <div class="mp-card mp-card-narrow">
        <div class="mp-header">
          <div class="mp-title mp-error-title">${escapeHtml(copy.title)}</div>
          <div class="mp-badge">ROOM ${escapeHtml(String(roomCode).toUpperCase())}</div>
        </div>
        <p class="mp-error-msg">${escapeHtml(copy.body)}</p>
        <div class="mp-actions" style="margin-top: 18px;">
          <button id="mp-btn-err-retry" class="btn primary mp-btn-primary" type="button">TRY ANOTHER CODE</button>
          <button id="mp-btn-err-back" class="btn secondary" type="button">MAIN MENU</button>
        </div>
      </div>
    `;

    this.root.appendChild(modal);
    this._container = modal;

    modal.querySelector('#mp-btn-err-retry').addEventListener('click', () => {
      if (this.audio?.ui?.playTap) this.audio.ui.playTap();
      if (onRetry) onRetry();
      else if (onBack) onBack();
    });
    modal.querySelector('#mp-btn-err-back').addEventListener('click', () => {
      this.clear();
      if (onBack) onBack();
    });
  }

  showLobby(lobby, { onLeave, onForceStart }) {
    this.clear();
    const lobbyView = document.createElement('div');
    lobbyView.className = 'screen mp-screen mp-lobby-view';
    lobbyView.id = 'mp-lobby-screen';
    lobbyView.style.pointerEvents = 'auto';

    // roomCode / scene / maxPlayers reach a peer through ROOM_STATE, i.e. off the wire.
    const roomCodeText = escapeHtml(String(lobby.roomCode || '').toUpperCase());
    const sceneText = escapeHtml(String(lobby.scene || '').toUpperCase());
    const capacity = safeNumber(lobby.maxPlayers, MAX_PLAYERS);

    lobbyView.innerHTML = `
      <div class="mp-lobby-container">
        <!-- Lobby Header -->
        <div class="mp-lobby-header">
          <div class="mp-room-pill">
            <span class="mp-room-lbl">ROOM:</span>
            <span class="mp-room-code">${roomCodeText}</span>
          </div>
          <div class="mp-scene-pill">
            <span class="mp-scene-badge">${sceneText} · ${capacity} PLAYERS</span>
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
              <span>PLAYERS (<span id="mp-roster-count">${lobby.connectedCount}</span>/${capacity})</span>
              <span id="mp-lobby-status" class="mp-status-pulse">Waiting for players...</span>
            </div>
            <div id="mp-roster-grid" class="mp-roster-grid"></div>
            ${lobby.isHost ? `
              <div class="mp-host-ctrls">
                <button id="mp-force-start" class="btn primary mp-start-btn" type="button">
                  START NOW (${lobby.connectedCount}/${capacity})
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

    // Roster is built as DOM nodes (never markup) so a player name can only ever
    // be text — see _renderRosterInto.
    this._renderRosterInto(lobbyView.querySelector('#mp-roster-grid'), lobby);

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
      if (rosterGrid) this._renderRosterInto(rosterGrid, lobby);
      if (rosterCount) rosterCount.textContent = lobby.connectedCount;
      if (statusPill) {
        statusPill.textContent = lobby.isFull ? 'Lobby Full! Starting...' : 'Waiting for players...';
      }
      if (forceStartBtn) {
        forceStartBtn.textContent = `START NOW (${lobby.connectedCount}/${safeNumber(lobby.maxPlayers, MAX_PLAYERS)})`;
      }
    };

    lobby.onChat = (msg) => {
      this._appendChatMessage(msg);
    };

    // The countdown ticker polls the wall clock several times a second so every
    // screen agrees on the digit; the overlay must only react when the DISPLAYED
    // number changes, or one beep per second becomes ten.
    let lastCountdownDigit = null;

    lobby.onCountdownStart = (sec) => {
      if (this._countdownEl) {
        this._countdownEl.classList.remove('hidden');
        const num = this._countdownEl.querySelector('#mp-countdown-num');
        lastCountdownDigit = Math.max(1, Math.ceil(sec));
        if (num) num.textContent = lastCountdownDigit;
        if (this.audio?.ui?.playConfirm) this.audio.ui.playConfirm();
      }
    };

    lobby.onCountdownTick = (sec) => {
      if (!this._countdownEl) return;
      const digit = Math.max(1, Math.ceil(sec));
      if (digit === lastCountdownDigit) return;
      lastCountdownDigit = digit;
      const num = this._countdownEl.querySelector('#mp-countdown-num');
      if (num) {
        num.textContent = digit;
        num.classList.add('pop');
        setTimeout(() => num.classList.remove('pop'), 200);
      }
      if (this.audio?.ui?.playTap) this.audio.ui.playTap();
    };

    lobby.onCountdownCancel = (reason) => {
      if (this._countdownEl) {
        this._countdownEl.classList.add('hidden');
      }
    };
  }

  /**
   * Build the roster out of elements with textContent rather than a markup string:
   * a player name arrives over the wire, so it must never be parsed as HTML. Class
   * names and nesting are identical to the previous markup so css/multiplayer.css
   * still applies unchanged.
   */
  _renderRosterInto(container, lobby) {
    if (!container) return;
    container.textContent = '';
    const capacity = safeNumber(lobby.maxPlayers, MAX_PLAYERS);
    const players = Array.isArray(lobby.players) ? lobby.players : [];

    for (let i = 0; i < capacity; i++) {
      const p = players[i];
      const color = safeColor(PLAYER_PALETTES[i], i);
      const card = document.createElement('div');
      const avatar = document.createElement('div');
      const meta = document.createElement('div');
      meta.className = 'mp-player-meta';
      const nameEl = document.createElement('span');
      const tagEl = document.createElement('span');

      if (p) {
        card.className = 'mp-roster-card filled';
        card.style.setProperty('--p-color', color);
        avatar.className = 'mp-player-avatar';
        avatar.style.background = color;
        const initial = document.createElement('span');
        initial.textContent = p.isHost ? 'H' : String(i + 1);
        avatar.appendChild(initial);

        nameEl.className = 'mp-player-name';
        nameEl.textContent = String(p.name ?? `Player ${i + 1}`);
        tagEl.className = 'mp-player-tag';
        tagEl.textContent = p.isHost ? 'HOST' : 'PLAYER';

        const dot = document.createElement('div');
        dot.className = 'mp-player-dot';
        dot.style.background = color;

        meta.append(nameEl, tagEl);
        card.append(avatar, meta, dot);
      } else {
        card.className = 'mp-roster-card empty';
        avatar.className = 'mp-player-avatar empty';
        const plus = document.createElement('span');
        plus.textContent = '+';
        avatar.appendChild(plus);

        nameEl.className = 'mp-player-name empty';
        nameEl.textContent = 'Open Slot';
        tagEl.className = 'mp-player-tag empty';
        tagEl.textContent = 'WAITING...';

        meta.append(nameEl, tagEl);
        card.append(avatar, meta);
      }

      container.appendChild(card);
    }
  }

  _appendChatMessage(msg) {
    if (!this._chatContainer) return;
    const isSys = msg.slot === -1;
    const msgEl = document.createElement('div');
    msgEl.className = isSys ? 'mp-chat-msg system' : 'mp-chat-msg';

    // textContent, never innerHTML: chat text and author names are attacker-controlled.
    if (isSys) {
      const sysEl = document.createElement('span');
      sysEl.className = 'mp-chat-sys-text';
      sysEl.textContent = String(msg.text ?? '');
      msgEl.appendChild(sysEl);
    } else {
      const authorEl = document.createElement('span');
      authorEl.className = 'mp-chat-author';
      authorEl.style.color = safeColor(msg.color, msg.slot);
      authorEl.textContent = `${String(msg.name ?? 'Player')}:`;

      const bodyEl = document.createElement('span');
      bodyEl.className = 'mp-chat-body';
      bodyEl.textContent = String(msg.text ?? '');

      msgEl.append(authorEl, document.createTextNode(' '), bodyEl);
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

  showMultiplayerPodium(gameOverData, { localSlot = 0, onPlayAgain, onExit } = {}) {
    this.clear();
    const podiumView = document.createElement('div');
    podiumView.className = 'screen mp-screen mp-podium-view';
    podiumView.style.pointerEvents = 'auto';

    const lb = gameOverData?.finalLeaderboard || [];
    const winner = lb[0] || { name: 'Player 1', score: 0, slot: 0 };
    const isLocalWinner = winner.slot === localSlot;
    const reason = PODIUM_REASON_COPY[gameOverData?.reason] || PODIUM_REASON_COPY.TIME_EXPIRED;

    let cardsHTML = '';
    lb.forEach((p, idx) => {
      const isLocal = p.slot === localSlot;
      const rankLabels = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];
      const rankMedals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
      const rankDisplay = rankLabels[idx] || `#${p.rank}`;
      const medal = rankMedals[idx] || '🎖️';

      // Every value below came off the wire in GAME_OVER.finalLeaderboard.
      const nameText = escapeHtml(String(p.name ?? 'Player'));
      const rowColor = escapeHtml(safeColor(p.color, p.slot));

      cardsHTML += `
        <div class="mp-podium-card ${idx === 0 ? 'winner' : ''} ${isLocal ? 'local-player' : ''}">
          <div class="mp-card-top">
            <div class="mp-rank-section">
              <span class="mp-rank-medal">${medal}</span>
              <span class="mp-rank-badge">${rankDisplay}</span>
            </div>
            <div class="mp-player-info">
              <div class="mp-row-color" style="background: ${rowColor}"></div>
              <span class="mp-player-name">${nameText}</span>
              ${isLocal ? '<span class="mp-you-badge">YOU</span>' : ''}
              ${p.departed ? '<span class="mp-you-badge mp-left-badge">LEFT</span>' : ''}
            </div>
            <div class="mp-player-score">${safeNumber(p.score).toLocaleString()} <span class="mp-score-unit">PTS</span></div>
          </div>

          <div class="mp-stats-breakdown-grid">
            <div class="mp-breakdown-cell">
              <span class="mp-cell-label">DEVOURED</span>
              <span class="mp-cell-val">${safeNumber(p.percentCleared)}% <span class="mp-cell-sub">(${safeNumber(p.mass)} kg)</span></span>
            </div>
            <div class="mp-breakdown-cell">
              <span class="mp-cell-label">BEST COMBO</span>
              <span class="mp-cell-val">${safeNumber(p.bestChain)} <span class="mp-cell-sub">EATS</span></span>
            </div>
            <div class="mp-breakdown-cell">
              <span class="mp-cell-label">TAKEDOWNS</span>
              <span class="mp-cell-val mp-val-kills">${safeNumber(p.kills)} <span class="mp-cell-sub">(${safeNumber(p.timesEaten)} eaten)</span></span>
            </div>
            <div class="mp-breakdown-cell">
              <span class="mp-cell-label">COINS EARNED</span>
              <span class="mp-cell-val mp-val-coins">🪙 +${safeNumber(p.coins)} <span class="mp-cell-sub">(${safeNumber(p.coinsCollected)} found)</span></span>
            </div>
          </div>
        </div>
      `;
    });

    // Uppercase BEFORE escaping: escaping first would let an entity like &lt;
    // be uppercased into &LT;, which browsers still decode.
    const headerTitle = isLocalWinner
      ? '🎉 VICTORY! YOU WIN! 🎉'
      : `${escapeHtml(String(winner.name ?? 'Player').toUpperCase())} WINS!`;

    podiumView.innerHTML = `
      <div class="mp-podium-container">
        <div class="mp-podium-header">
          <div class="mp-winner-title ${isLocalWinner ? 'gold-glow' : ''}">${headerTitle}</div>
          <div class="mp-winner-sub">${reason}</div>
        </div>

        <div class="mp-leaderboard-grid">
          ${cardsHTML}
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
