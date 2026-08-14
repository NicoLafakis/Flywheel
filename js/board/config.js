// Browser-facing board configuration. These are public coordinates only; the
// secret key and ticket secret live solely inside Vercel Functions.

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../net/supabase-config.js';

export const BOARDS_ENABLED = true;
export const RANKED_SCENES = Object.freeze(['chicago', 'brooklyn', 'boston', 'cambridge', 'manhattan', 'upper-manhattan']);
export const API_BASE = '/api';
export const BUILD_ID = 'ranked-v1';
export const BOARD_TIMEOUT_MS = 5000;
export { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL };
