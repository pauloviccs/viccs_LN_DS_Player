import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log("Supabase Config Debug:");
console.log("URL:", supabaseUrl);
console.log("Key Length:", supabaseAnonKey ? supabaseAnonKey.length : 0);
console.log("Key Start:", supabaseAnonKey ? supabaseAnonKey.substring(0, 10) : "N/A");

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase URL or Key. Check your .env file.");
}

export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
