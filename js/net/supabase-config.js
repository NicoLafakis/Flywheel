// Supabase project coordinates. The ONLY file a project move rewrites; no logic.
//
// Both values below are PUBLIC BY DESIGN. The URL is where every player's
// browser connects, and the publishable key is Supabase's browser-facing key —
// it grants nothing beyond what Row Level Security and channel policy allow,
// and it ships to every client exactly like a Google Maps browser key does.
// (Supabase docs: "publishable keys are safe to use in a browser".)
//
// The SECRET key (sb_secret_...) must NEVER appear in this file, in js/, or in
// anything the browser loads. It lives in .env.local (gitignored) and is used
// only by server-side tooling.

export const SUPABASE_URL = 'https://zrsrvhrkgfuqhcjnjezw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vwCXTJyvrlmYevk8uI-l_A_N31ZhC0d';
