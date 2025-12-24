import { supabase } from './supabase.js'

const moduleBasePath = (() => {
  const modulePath = new URL('.', import.meta.url).pathname
  const segments = modulePath.split('/')
  const jsIndex = segments.lastIndexOf('js')

  if (jsIndex > 0) {
    const base = segments.slice(0, jsIndex).join('/')
    return base.endsWith('/') ? base : `${base}/`
  }

  return modulePath.endsWith('/') ? modulePath : `${modulePath}/`
})()

const buildUrl = (file) =>
  new URL(file, `${window.location.origin}${moduleBasePath}`).toString()

const dashboardUrl = () => buildUrl('dashboard.html')
const adminDashboardUrl = () => buildUrl('admin.html')
const loginUrl = () => buildUrl('index.html')

export async function fetchUserRole(userId) {
  if (!userId) return 'client'

  try {
    const baseQuery = supabase.from('profiles').select('role').eq('id', userId)
    const { data, error } = await (baseQuery.maybeSingle ? baseQuery.maybeSingle() : baseQuery.single())

    if (error) {
      console.warn('Unable to fetch user role, fallback to client', error)
    }

    return data?.role || 'client'
  } catch (error) {
    console.error('fetchUserRole: unexpected error', error)
    return 'client'
  }
}

export async function redirectIfLoggedIn() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    const role = await fetchUserRole(session.user.id)
    window.location.href = role === 'admin' ? adminDashboardUrl() : dashboardUrl()
  }
}

export async function requireAuth(allowedRoles = [], { redirectOnForbidden = true } = {}) {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error) {
      console.error('auth.getSession error', error)
    }

    if (!session) {
      window.location.href = loginUrl()
      return { session: null, role: null, allowed: false, error }
    }

    const role = await fetchUserRole(session.user.id)
    const allowed = !allowedRoles.length || allowedRoles.includes(role)

    if (!allowed && redirectOnForbidden) {
      window.location.href = role === 'admin' ? adminDashboardUrl() : dashboardUrl()
      return { session, role, allowed: false, error }
    }

    return { session, role, allowed, error }
  } catch (error) {
    console.error('requireAuth failure', error)
    window.location.href = loginUrl()
    return { session: null, role: null, allowed: false, error }
  }
}

export function setupAuthUI() {
  const loginForm = document.getElementById('login-form')
  const feedback = document.getElementById('login-feedback')

  if (!loginForm) return

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault()

    const submitButton = loginForm.querySelector('button[type="submit"]')
    const email = loginForm.email.value.trim()
    const password = loginForm.password.value

    feedback.textContent = ''
    feedback.className = 'form-feedback'

    submitButton.disabled = true
    submitButton.textContent = 'Connexion...'

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    submitButton.disabled = false
    submitButton.textContent = 'Se connecter'

    if (error) {
      feedback.textContent =
        'Impossible de se connecter. Vérifiez vos identifiants ou votre connexion.'
      feedback.classList.add('error')
      return
    }

    feedback.textContent = 'Connexion réussie. Redirection en cours...'
    feedback.classList.add('success')

    setTimeout(() => {
      fetchUserRole(data?.user?.id).then((role) => {
        window.location.href = role === 'admin' ? adminDashboardUrl() : dashboardUrl()
      })
    }, 600)
  })
}

export async function requireAdmin(session) {
  const base = { allowed: false, role: null, profile: null, error: null }

  if (!session) {
    return { ...base, error: new Error('Aucune session active') }
  }

  try {
    const query = supabase.from('profiles').select('id, role, full_name, phone').eq('id', session.user.id)
    const { data, error } = await (query.maybeSingle ? query.maybeSingle() : query.single())

    if (error) {
      console.error('requireAdmin: impossible de récupérer le profil', error)
      return { ...base, role: data?.role || null, profile: data || null, error }
    }

    const role = data?.role || 'client'
    const allowed = role === 'admin'
    const errorForRole = allowed ? null : new Error('Utilisateur non administrateur')
    return { allowed, role, profile: data || null, error: errorForRole }
  } catch (error) {
    console.error('requireAdmin: erreur inattendue', error)
    return { ...base, error }
  }
}

export function setupLogout(buttonSelector = '.logout-button') {
  const buttons = new Set([
    ...document.querySelectorAll(buttonSelector),
    ...document.querySelectorAll('#logout-btn'),
  ])

  buttons.forEach((button) => {
    if (!(button instanceof HTMLElement)) return
    button.addEventListener('click', async () => {
      button.disabled = true
      button.textContent = 'Déconnexion...'
      try {
        await supabase.auth.signOut()
      } catch (error) {
        console.warn('Erreur lors de la déconnexion', error)
      } finally {
        window.location.href = loginUrl()
      }
    })
  })
}
