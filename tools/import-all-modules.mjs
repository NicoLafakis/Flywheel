// tools/import-all-modules.mjs — Verify all modules can be parsed and imported cleanly without errors
import * as sim from '../js/sim.js';
import * as voxelsim from '../js/voxelsim.js';
import * as levels from '../js/levels.js';
import * as save from '../js/save.js';
import * as upgrades from '../js/upgrades.js';
import * as quality from '../js/quality.js';
import * as mix from '../js/audio/mix.js';
import * as replay from '../js/replay.js';
import * as powerups from '../js/powerups.js';
import * as channel from '../js/multiplayer/channel.js';
import * as lobby from '../js/multiplayer/lobby.js';
import * as host from '../js/multiplayer/host.js';
import * as peer from '../js/multiplayer/peer.js';
import * as config from '../js/multiplayer/config.js';
import * as protocol from '../js/multiplayer/protocol.js';

console.log('All modules imported successfully in Node!');
