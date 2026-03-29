/**
 * AuthContext — the global auth state manager.
 *
 * This is a React "context" — think of it like a bulletin board that the whole
 * app can read. Once you log in, this context holds your user info and session
 * token so every page and component can access it without passing it around
 * manually.
 *
 * Supabase handles the heavy lifting: it stores the session in localStorage,
 * refreshes the JWT automatically before it expires, and fires events when
 * auth state changes (login, logout, token refresh).
 *
 * Usage anywhere in the app:
 *   const { user, signOut, loading } = useAuth()
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { identifyUser, resetIdentity } from '../lib/analytics'

// Create the context (like creating the bulletin board)
const AuthContext = createContext(null)

/**
 * AuthProvider wraps the whole app so every component can call useAuth().
 * It listens for Supabase auth state changes and keeps the `user` state
 * in sync — so a login on the login page automatically updates the sidebar.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // loading = true until we've checked if there's an existing session
  // (prevents the app from flashing the login page before we know the user is logged in)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. On mount, check if there's already a session in localStorage
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // 2. Subscribe to future auth changes (sign in, sign out, token refresh)
    // This fires any time auth state changes, keeping the UI in sync.
    // We also call identifyUser() here so PostHog links all events to this user ID.
    // On sign-out, we reset the PostHog identity so the next user gets a clean slate.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // Link PostHog session recordings and events to this user's Supabase ID.
        // We deliberately use the user ID (not email) to avoid sending PII to PostHog.
        identifyUser(session.user.id)
      } else {
        // User signed out — reset PostHog so the next person gets a fresh anonymous session
        resetIdentity()
      }
    })

    // 3. Clean up the subscription when the component unmounts
    return () => subscription.unsubscribe()
  }, [])

  /**
   * Sign up with email + password.
   * Supabase will send a confirmation email unless you've disabled that in the dashboard.
   * Returns { error } — error is null if successful.
   */
  const signUp = async (email, password) => {
    // Return both data and error — data.session is non-null when Supabase
    // auto-confirms the user (i.e. email confirmation is disabled in the dashboard).
    // SignupPage uses this to redirect straight to /groups instead of showing
    // the "check your email" screen.
    const { data, error } = await supabase.auth.signUp({ email, password })
    return { data, error }
  }

  /**
   * Sign in with email + password.
   * Returns { error } — error is null if successful.
   */
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  /**
   * Sign in with Google OAuth — redirects the browser to Google's login page.
   * After the user approves, Google sends them back to our app, Supabase
   * sets the session automatically, and the AuthContext listener picks it up.
   * No password needed — Google vouches for the user's identity.
   */
  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // After Google auth completes, land on /groups instead of /login
        redirectTo: `${window.location.origin}/groups`,
      },
    })
  }

  /**
   * Sign out — clears the session from localStorage and resets auth state.
   */
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * useAuth hook — the easy way to access auth state in any component.
 * Just call `const { user, signOut } = useAuth()` and you're done.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
