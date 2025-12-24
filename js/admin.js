import { supabase } from './supabase.js'

const state = {
  session: null,
  orders: [],
  ordersCache: new Map(),
  drivers: [],
  activeOrderId: null,
  realtime: null,
}

const diagnostics = {
  state: {
    supabaseReady: !!supabase,
    url: window.location.href,
    sessionText: '—',
    role: '—',
    ordersCount: '—',
    lastError: null,
    raw: '',
    sessionResult: null,
    bootLog: null,
  },
  els: {
    url: document.getElementById('diag-url'),
    supabase: document.getElementById('diag-supabase'),
    session: document.getElementById('diag-session'),
    role: document.getElementById('diag-role'),
    orders: document.getElementById('diag-orders'),
    errors: document.getElementById('diag-errors'),
    raw: document.getElementById('diag-raw'),
    testBtn: document.getElementById('diagnostics-test-orders'),
    bootLog: document.getElementById('boot-log'),
  },
}

const els = {
  ordersTable: document.getElementById('orders-table'),
  ordersEmpty: document.getElementById('orders-empty'),
  ordersCount: document.getElementById('orders-count'),
  orderDetail: document.getElementById('order-detail'),
  ordersError: document.getElementById('orders-error'),
  driversTable: document.getElementById('drivers-table'),
  driversEmpty: document.getElementById('drivers-empty'),
  statusFilter: document.getElementById('status-filter'),
  assignmentFilter: document.getElementById('assignment-filter'),
  searchFilter: document.getElementById('search-filter'),
  refreshOrdersBtn: document.getElementById('refresh-orders'),
  refreshDriversBtn: document.getElementById('refresh-drivers'),
  refreshDriversSecondaryBtn: document.getElementById('refresh-drivers-secondary'),
  openFirstOrderBtn: document.getElementById('open-first-order'),
  metrics: {
    total: document.getElementById('metric-total'),
    assigned: document.getElementById('metric-assigned'),
    inTransit: document.getElementById('metric-in-transit'),
    delivered: document.getElementById('metric-delivered'),
  },
  lastSync: document.getElementById('last-sync'),
  toast: document.getElementById('toast'),
  views: document.querySelectorAll('.view'),
}

const formatDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const formatError = (error) => {
  if (!error) return null
  if (typeof error === 'string') return error
  const code = error.code ? `${error.code} – ` : ''
  if (error.message) return `${code}${error.message}`
  try {
    return `${code}${JSON.stringify(error)}`
  } catch (jsonError) {
    console.error('formatError: unable to stringify error', jsonError)
  }
  return String(error)
}

const updateDiagnostics = (partial = {}) => {
  diagnostics.state = {
    ...diagnostics.state,
    ...partial,
    url: window.location.href,
    supabaseReady: !!supabase,
  }

  const { state, els } = diagnostics

  if (els.url) els.url.textContent = state.url || window.location.href
  if (els.supabase) {
    els.supabase.textContent = state.supabaseReady ? 'OK' : 'KO'
    els.supabase.className = `pill ${state.supabaseReady ? 'pill-success' : 'pill-error'}`
  }
  if (els.session) els.session.textContent = state.sessionText || '—'
  if (els.role) els.role.textContent = state.role || '—'
  if (els.orders) els.orders.textContent = `${state.ordersCount ?? '—'}`
  if (els.errors) {
    const hasError = Boolean(state.lastError)
    els.errors.textContent = hasError ? state.lastError : 'Aucune'
    els.errors.classList.toggle('has-error', hasError)
  }
  if (els.raw) els.raw.textContent = state.raw || '—'

  console.groupCollapsed('Diagnostics admin')
  console.log('URL', state.url)
  console.log('Supabase ready', state.supabaseReady)
  console.log('Session result', state.sessionResult)
  console.log('Role', state.role)
  console.log('Orders count', state.ordersCount)
  if (state.lastError) console.error('Dernière erreur', state.lastError)
  if (state.raw) console.log('Aperçu brut', state.raw)
  console.groupEnd()
}

const recordError = (context, error) => {
  const formatted = formatError(error)
  updateDiagnostics({ lastError: formatted })
  console.error(`Supabase error in ${context}`, error)
  return formatted
}

const setOrdersError = (message = '') => {
  if (!els.ordersError) return
  els.ordersError.textContent = message
  els.ordersError.classList.toggle('hidden', !message)
}

const showToast = (message, variant = 'info') => {
  if (!els.toast) return
  els.toast.textContent = message
  els.toast.className = `toast ${variant}`
  els.toast.classList.remove('hidden')
  setTimeout(() => els.toast.classList.add('hidden'), 3200)
}

const badge = (text) => `<span class="badge">${text}</span>`

const shortId = (id) => `#${id}`

const setOrdersLoading = (isLoading) => {
  if (els.ordersTable) {
    els.ordersTable.classList.toggle('loading', isLoading)
  }
  ;[els.refreshOrdersBtn, els.refreshDriversBtn, els.refreshDriversSecondaryBtn].forEach((btn) => {
    if (btn) btn.disabled = isLoading
  })
  if (diagnostics.els.testBtn) diagnostics.els.testBtn.disabled = isLoading
}

const setDetailMessage = (message) => {
  if (!els.orderDetail) return
  els.orderDetail.classList.remove('hidden')
  els.orderDetail.innerHTML = `<p class="muted">${message}</p>`
}

const updateMetrics = () => {
  if (!els.metrics.total) return

  const counters = {
    total: state.orders.length,
    assigned: 0,
    inTransit: 0,
    delivered: 0,
  }

  state.orders.forEach((order) => {
    if (order.driver_id) counters.assigned += 1
    if (order.current_status === 'delivered') counters.delivered += 1
    if (['in_transit', 'assigned', 'created'].includes(order.current_status)) counters.inTransit += 1
  })

  els.metrics.total.textContent = counters.total
  els.metrics.assigned.textContent = counters.assigned
  els.metrics.inTransit.textContent = counters.inTransit
  els.metrics.delivered.textContent = counters.delivered

  if (els.lastSync) {
    els.lastSync.textContent = `Dernière sync : ${new Date().toLocaleTimeString()}`
  }
}

const renderOrders = () => {
  if (!els.ordersTable || !els.ordersEmpty || !els.ordersCount) return

  els.ordersTable.innerHTML = ''
  const list = state.orders

  if (!list.length) {
    els.ordersEmpty.classList.remove('hidden')
    els.ordersCount.textContent = '0 commande'
    setOrdersError('')
    state.activeOrderId = null
    setDetailMessage('Aucune commande pour le moment. Créez-en ou attendez une nouvelle entrée Supabase.')
    updateMetrics()
    return
  }

  els.ordersEmpty.classList.add('hidden')
  els.ordersCount.textContent = `${list.length} commande${list.length > 1 ? 's' : ''}`
  setOrdersError('')

  list.forEach((order) => {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${shortId(order.id)}</td>
      <td>${badge(order.current_status || '—')}</td>
      <td>${formatDate(order.created_at)}</td>
      <td>${order.pickup_address || '—'}</td>
      <td>${order.delivery_address || '—'}</td>
      <td>${order.driver_id || '—'}</td>
      <td class="table-actions"><button data-open="${order.id}" class="ghost-btn">Ouvrir</button></td>
    `
    els.ordersTable.appendChild(row)
  })

  updateMetrics()
}

const renderStatusHistory = (events = []) => {
  const container = document.createElement('div')
  container.className = 'timeline-list'

  events
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach((event) => {
      const item = document.createElement('div')
      item.className = 'timeline-item'
      item.innerHTML = `
        <div>
          <p class="muted">${formatDate(event.created_at)}</p>
          <strong>${event.status}</strong>
          <p class="muted">${event.reason || ''}</p>
          ${event.note ? `<p>${event.note}</p>` : ''}
        </div>
        <span class="pill">${event.performed_by || '—'}</span>
      `
      container.appendChild(item)
    })

  if (!events.length) {
    container.innerHTML = '<p class="muted">Aucun statut.</p>'
  }

  return container
}

const renderProofs = (proofs = []) => {
  const container = document.createElement('div')
  container.className = 'proofs'

  if (!proofs.length) {
    container.innerHTML = '<p class="muted">Aucune preuve enregistrée.</p>'
    return container
  }

  proofs
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach((proof) => {
      const item = document.createElement('div')
      item.className = 'proof'
      item.innerHTML = `
        <div>
          <p class="muted">${formatDate(proof.created_at)}</p>
          <strong>${proof.scan_type}</strong>
          ${proof.note ? `<p>${proof.note}</p>` : ''}
          ${proof.scan_payload ? `<p class="muted">${proof.scan_payload}</p>` : ''}
        </div>
        ${proof.image_url ? `<a href="${proof.image_url}" target="_blank" rel="noopener" class="ghost-btn">Voir</a>` : ''}
      `
      container.appendChild(item)
    })

  return container
}

const renderAssignments = (assignments = []) => {
  const container = document.createElement('div')
  container.className = 'assignments'

  if (!assignments.length) {
    container.innerHTML = '<p class="muted">Aucune assignation.</p>'
    return container
  }

  assignments
    .slice()
    .sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at))
    .forEach((assignment) => {
      const item = document.createElement('div')
      item.className = 'assignment'
      item.innerHTML = `
        <div>
          <p class="muted">${formatDate(assignment.assigned_at)}</p>
          <strong>${assignment.driver?.email || assignment.driver_id}</strong>
          ${assignment.note ? `<p>${assignment.note}</p>` : ''}
        </div>
        <span class="pill">${assignment.assigned_by || '—'}</span>
      `
      container.appendChild(item)
    })

  return container
}

const setActiveView = (targetId = 'orders-view') => {
  els.views.forEach((view) => {
    const isActive = view.id === targetId
    view.classList.toggle('active', isActive)
    view.classList.toggle('hidden', !isActive)
  })
}

const renderOrderDetail = (order) => {
  if (!els.orderDetail) return
  if (!order) {
    setDetailMessage('Sélectionnez une commande pour afficher le détail.')
    return
  }

  els.orderDetail.classList.remove('hidden')
  els.orderDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">Commande</p>
        <h2>${shortId(order.id)}</h2>
        <p class="muted">Client : ${order.profiles?.email || order.user_id || '—'}</p>
      </div>
      <div class="pill">${order.current_status || '—'}</div>
    </div>
    <div class="detail-grid">
      <div>
        <p class="label">Collecte</p>
        <p class="value">${order.pickup_address || '—'}</p>
        <p class="muted">${formatDate(order.expected_pickup)}</p>
      </div>
      <div>
        <p class="label">Livraison</p>
        <p class="value">${order.delivery_address || '—'}</p>
        <p class="muted">${formatDate(order.expected_delivery)}</p>
      </div>
      <div>
        <p class="label">Livreur</p>
        <p class="value">${order.driver?.email || order.driver_id || 'Non assigné'}</p>
      </div>
      <div>
        <p class="label">Créée le</p>
        <p class="value">${formatDate(order.created_at)}</p>
      </div>
    </div>

    <div class="detail-actions">
      <div class="field">
        <label for="driver-select">Assigner un livreur</label>
        <select id="driver-select">
          <option value="">Sélectionner</option>
          ${state.drivers
            .filter((driver) => Boolean(driver.full_name))
            .map((driver) => `<option value="${driver.id}">${driver.full_name}</option>`)
            .join('')}
        </select>
      </div>
      <button id="assign-driver" class="button">Assigner</button>
    </div>

    <div class="split">
      <div>
        <h3>Historique des statuts</h3>
        ${renderStatusHistory(order.order_status_events || []).outerHTML}
      </div>
      <div>
        <h3>Preuves</h3>
        ${renderProofs(order.scan_proofs || []).outerHTML}
      </div>
    </div>

    <div>
      <h3>Assignations</h3>
      ${renderAssignments(order.driver_assignments || []).outerHTML}
    </div>
  `

  const assignBtn = document.getElementById('assign-driver')
  const select = document.getElementById('driver-select')
  if (select && order.driver_id) select.value = order.driver_id

  assignBtn?.addEventListener('click', async () => {
    const driverId = select.value
    if (!driverId) {
      showToast('Sélectionnez un livreur avant d’assigner', 'error')
      return
    }
    assignBtn.disabled = true
    assignBtn.textContent = 'Assignation...'
    const { error } = await assignDriver(order.id, driverId)
    assignBtn.disabled = false
    assignBtn.textContent = 'Assigner'

    if (error) {
      showToast('Assignation impossible. Vérifiez les droits ou réessayez.', 'error')
      return
    }

    showToast('Livreur assigné')
    await fetchOrders()
    await openOrder(order.id)
  })
}

const buildOrdersQuery = () => {
  let query = supabase.from('orders').select('*').order('created_at', { ascending: false })

  const status = els.statusFilter?.value
  if (status && status !== 'all') query = query.eq('current_status', status)

  const assignment = els.assignmentFilter?.value
  if (assignment === 'assigned') query = query.not('driver_id', 'is', null)
  if (assignment === 'unassigned') query = query.is('driver_id', null)

  const search = els.searchFilter?.value?.trim()
  if (search) {
    const encoded = search.replace(/%/g, '\\%').replace(/_/g, '\\_')
    query = query.or(
      `id.ilike.%${encoded}%,pickup_address.ilike.%${encoded}%,delivery_address.ilike.%${encoded}%`
    )
  }

  return query
}

const runOrdersQuery = async () => {
  try {
    const query = buildOrdersQuery()
    const { data, error } = await query
    return { data: data || [], error }
  } catch (error) {
    return { data: [], error }
  }
}

const fetchOrders = async ({ captureRaw = false } = {}) => {
  setOrdersLoading(true)
  const { data, error } = await runOrdersQuery()
  setOrdersLoading(false)

  if (error) {
    const message = recordError('fetchOrders', error)
    const isRls = error?.code === '42501' || /permission|rls/i.test(error?.message || '')
    const uiMessage = isRls
      ? 'RLS / permissions : vérifiez les politiques et le rôle.'
      : 'Erreur lors du chargement des commandes.'
    setOrdersError(uiMessage)
    els.ordersEmpty?.classList.remove('hidden')
    els.ordersEmpty.textContent = 'Impossible de récupérer les commandes.'
    updateDiagnostics({ ordersCount: 0 })
    showToast(uiMessage, 'error')
    return { data: [], error }
  }

  state.orders = data || []
  state.ordersCache.clear()
  state.orders.forEach((o) => state.ordersCache.set(o.id, o))
  const rawPreview =
    captureRaw && Array.isArray(state.orders)
      ? JSON.stringify({ preview: state.orders.slice(0, 2), count: state.orders.length }, null, 2)
      : diagnostics.state.raw

  updateDiagnostics({
    ordersCount: state.orders.length,
    lastError: null,
    raw: rawPreview,
  })
  renderOrders()

  if (!state.activeOrderId && state.orders.length) {
    state.activeOrderId = state.orders[0].id
  }

  if (state.activeOrderId) {
    renderOrderDetail(state.ordersCache.get(state.activeOrderId))
  }

  updateMetrics()
  return { data: state.orders, error: null }
}

const fetchDrivers = async () => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role')
      .eq('role', 'driver')
      .order('full_name', { ascending: true })

    if (error) {
      recordError('fetchDrivers', error)
      showToast('Erreur lors du chargement des livreurs', 'error')
      return
    }

    const driversWithName = (data || []).filter((driver) => Boolean(driver.full_name))

    state.drivers = driversWithName
    renderDrivers()

    if (state.activeOrderId && state.ordersCache.has(state.activeOrderId)) {
      renderOrderDetail(state.ordersCache.get(state.activeOrderId))
    }
  } catch (error) {
    recordError('fetchDrivers', error)
    showToast('Erreur inattendue lors du chargement des livreurs', 'error')
  }
}

const fetchDriverStats = async () => {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('driver_id, current_status')
      .not('driver_id', 'is', null)

    if (error) {
      recordError('fetchDriverStats', error)
      return new Map()
    }

    const stats = new Map()
    data.forEach((order) => {
      if (!stats.has(order.driver_id)) {
        stats.set(order.driver_id, { assigned: 0, in_progress: 0, delivered: 0 })
      }
      const entry = stats.get(order.driver_id)
      entry.assigned += 1
      if (order.current_status === 'delivered') entry.delivered += 1
      else entry.in_progress += 1
    })

    return stats
  } catch (error) {
    recordError('fetchDriverStats', error)
    return new Map()
  }
}

const renderDrivers = async () => {
  if (!els.driversTable || !els.driversEmpty) return
  els.driversTable.innerHTML = ''
  const stats = await fetchDriverStats()

  if (!state.drivers.length) {
    els.driversEmpty.classList.remove('hidden')
    return
  }
  els.driversEmpty.classList.add('hidden')

  state.drivers.forEach((driver) => {
    const stat = stats.get(driver.id) || { assigned: 0, in_progress: 0, delivered: 0 }
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${driver.full_name || '—'}</td>
      <td>${driver.phone || '—'}</td>
      <td>${driver.id}</td>
      <td>${stat.assigned}</td>
      <td>${stat.in_progress}</td>
      <td>${stat.delivered}</td>
    `
    els.driversTable.appendChild(row)
  })
}

const openOrder = async (id) => {
  if (!state.ordersCache.has(id)) {
    await fetchOrders()
  }
  const order = state.ordersCache.get(id)
  state.activeOrderId = id
  renderOrderDetail(order)
}

const assignDriver = async (orderId, driverId) => {
  try {
    const { error: updateError } = await supabase
      .from('orders')
      .update({ driver_id: driverId })
      .eq('id', orderId)

    if (updateError) {
      recordError('assignDriver:update', updateError)
      return { error: updateError }
    }

    const { error: assignError } = await supabase.from('driver_assignments').insert({
      order_id: orderId,
      driver_id: driverId,
      assigned_by: state.session.user.id,
      assigned_at: new Date().toISOString(),
      note: 'Assigné par admin',
    })

    if (assignError) {
      recordError('assignDriver:insert-assignment', assignError)
      return { error: assignError }
    }

    const { error: statusError } = await supabase.from('order_status_events').insert({
      order_id: orderId,
      status: 'assigned',
      reason: 'system',
      note: 'Assigned by admin',
      performed_by: state.session.user.id,
    })

    if (statusError) {
      recordError('assignDriver:insert-status', statusError)
    }
    return { error: statusError }
  } catch (error) {
    recordError('assignDriver:unexpected', error)
    return { error }
  }
}

const handleRealtime = () => {
  if (state.realtime) return

  state.realtime = supabase
    .channel('admin-order-events')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'order_status_events' },
      async (payload) => {
        const orderId = payload.new.order_id
        if (state.activeOrderId && state.activeOrderId === orderId) {
          await fetchOrders()
          await openOrder(orderId)
          showToast('Statut mis à jour en temps réel')
        }
      }
    )
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async () => {
      await fetchOrders()
      showToast('Nouvelle commande reçue')
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
      const orderId = payload.new.id
      state.ordersCache.set(orderId, { ...state.ordersCache.get(orderId), ...payload.new })
      await fetchOrders()
      if (state.activeOrderId === orderId) {
        await openOrder(orderId)
      }
    })
    .subscribe()
}

const bindNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.setAttribute('type', 'button')
    btn.addEventListener('click', () => {
      const target = btn.dataset.target
      if (btn.classList.contains('logout-button')) return

      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')

      setActiveView(target || 'orders-view')

      const title = target === 'drivers-view' ? 'Livreurs' : 'Commandes'
      const pageTitle = document.getElementById('page-title')
      if (pageTitle) pageTitle.textContent = target ? (title || 'Commandes') : 'Commandes'

      if (target === 'drivers-view') {
        fetchDrivers()
        return
      }
      fetchOrders()
    })
  })
}

const bindFilters = () => {
  ;[els.statusFilter, els.assignmentFilter].forEach((el) => {
    el?.addEventListener('change', fetchOrders)
  })

  if (els.searchFilter) {
    let debounce
    els.searchFilter.addEventListener('input', () => {
      clearTimeout(debounce)
      debounce = setTimeout(fetchOrders, 250)
    })
    els.searchFilter.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') fetchOrders()
    })
  }

  els.refreshOrdersBtn?.addEventListener('click', fetchOrders)
}

const bindOrdersTable = () => {
  if (!els.ordersTable) return
  els.ordersTable.addEventListener('click', (event) => {
    const target = event.target
    if (target instanceof HTMLButtonElement && target.dataset.open) {
      openOrder(target.dataset.open)
    }
  })
}

const bindQuickActions = () => {
  els.refreshDriversBtn?.addEventListener('click', fetchDrivers)
  els.refreshDriversSecondaryBtn?.addEventListener('click', fetchDrivers)
  els.openFirstOrderBtn?.addEventListener('click', () => {
    if (!state.orders.length) {
      showToast('Aucune commande à ouvrir', 'error')
      return
    }
    openOrder(state.orders[0].id)
  })
}

const initDiagnostics = async (session, role, adminError) => {
  updateDiagnostics({
    role: role || diagnostics.state.role,
    lastError: formatError(adminError),
  })
  if (diagnostics.els.url) diagnostics.els.url.textContent = window.location.href

  try {
    const sessionResult = await supabase.auth.getSession()
    updateDiagnostics({
      sessionResult: sessionResult.data,
      sessionText: JSON.stringify(sessionResult.data, null, 2),
    })
  } catch (error) {
    recordError('initDiagnostics', error)
  }

  if (diagnostics.els.testBtn && !diagnostics.els.testBtn.dataset.bound) {
    diagnostics.els.testBtn.dataset.bound = 'true'
      diagnostics.els.testBtn.addEventListener('click', async () => {
        diagnostics.els.testBtn.disabled = true
        diagnostics.els.raw.textContent = 'Requête en cours...'
        const { data, error } = await fetchOrders({ captureRaw: true })
        diagnostics.els.testBtn.disabled = false

      const payload = {
        count: data?.length || 0,
        preview: (data || []).slice(0, 2),
        error: error ? formatError(error) : null,
      }
      updateDiagnostics({
        raw: JSON.stringify(payload, null, 2),
        lastError: formatError(error),
        ordersCount: data?.length ?? diagnostics.state.ordersCount,
      })

      if (error) {
        showToast('Erreur lors du test fetch orders', 'error')
      } else {
        showToast('Test fetch orders OK', 'success')
      }
    })
  }
}

export const initAdmin = (session, { role = '—', allowed = true, profile = null, error = null } = {}) => {
  state.session = session
  updateDiagnostics({
    sessionText: session ? JSON.stringify({ user: session.user }, null, 2) : '—',
    role: role || diagnostics.state.role,
  })
  setDetailMessage('Sélectionnez une commande pour afficher le détail.')
  setActiveView('orders-view')
  bindNavigation()
  bindFilters()
  bindOrdersTable()
  bindQuickActions()
  initDiagnostics(session, role, error)

  if (!allowed) {
    updateDiagnostics({
      lastError: formatError(error) || 'Accès refusé : rôle non admin',
      ordersCount: 0,
    })
    return
  }

  if (profile?.full_name) {
    console.info('Connecté en tant que', profile.full_name)
  }

  fetchDrivers()
  fetchOrders({ captureRaw: true })
  handleRealtime()
}

export const registerGlobalErrorHandlers = (appendBootLog) => {
  const reportError = (label, errorEvent) => {
    const error = errorEvent?.error || errorEvent?.reason || errorEvent
    const formatted = formatError(error)
    updateDiagnostics({ lastError: formatted || label })
    if (appendBootLog) appendBootLog(`${label}: ${formatted || 'Unknown error'}`, true)
  }

  window.addEventListener('error', (event) => reportError('Erreur globale', event))
  window.addEventListener('unhandledrejection', (event) => reportError('Rejet promesse', event))
}
