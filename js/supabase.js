import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://xxhicwzvcufixuinzwur.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4aGljd3p2Y3VmaXh1aW56d3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MTU2NjcsImV4cCI6MjA4MjA5MTY2N30.Q-Zq1YnejtjH9F7t01qAbaQ8k_-OTke85y8JOQQOyKI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
