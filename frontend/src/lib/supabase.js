/**
 * Supabase client — the single connection point to our Supabase backend.
 *
 * Think of this like the key to the building. Every part of the app that
 * needs to talk to Supabase (auth, database queries, file storage) imports
 * this one shared client instead of creating their own connection each time.
 *
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY come from .env.local in
 * development, and from Vercel environment variables in production.
 * The "anon key" is safe to expose in frontend code — it's designed to be
 * public and relies on Row Level Security in the database for protection.
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Helpful error in development — tells you exactly what's missing
  // rather than a confusing "fetch failed" message.
  console.error(
    '[AutoSplit] Missing Supabase env vars. ' +
    'Copy .env.example to .env.local and fill in your Supabase URL and anon key.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
