import { supabase } from './supabase.js'

const dashboardUrl = () => new URL('dashboard.html', window.location.href).toString()
const loginUrl = () => new URL('index.html', window.location.href).toString()

export async function redirectIfLoggedIn() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    window.location.href = dashboardUrl()
  }
}

export async function requireAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    window.location.href = loginUrl()
    return null
  }

  return session
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

    const { error } = await supabase.auth.signInWithPassword({
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
      window.location.href = dashboardUrl()
    }, 600)
  })
}

export function setupLogout(buttonSelector = '.logout-button') {
  document.querySelectorAll(buttonSelector).forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true
      button.textContent = 'Déconnexion...'
      await supabase.auth.signOut()
      window.location.href = loginUrl()
    })
  })
}
