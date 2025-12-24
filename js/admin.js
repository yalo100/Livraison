import { supabase } from './supabase.js'

const state = {
  session: null,
  orders: [],
  ordersCache: new Map(),
  drivers: [],
  activeOrderId: null,
  realtime: null,
}

const els = {
  ordersTable: document.getElementById('orders-table'),
  ordersEmpty: document.getElementById('orders-empty'),
  ordersCount: document.getElementById('orders-count'),
  orderDetail: document.getElementById('order-detail'),
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
    state.activeOrderId = null
    setDetailMessage('Aucune commande pour le moment. Créez-en ou attendez une nouvelle entrée Supabase.')
    updateMetrics()
    return
  }

  els.ordersEmpty.classList.add('hidden')
  els.ordersCount.textContent = `${list.length} commande${list.length > 1 ? 's' : ''}`

  list.forEach((order) => {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${shortId(order.id)}</td>
      <td>${order.profiles?.email || order.user_id || '—'}</td>
      <td>${order.driver?.email || order.driver_id || '—'}</td>
      <td>${badge(order.current_status || '—')}</td>
      <td>${formatDate(order.created_at)}</td>
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
            .map((driver) => `<option value="${driver.id}">${driver.full_name || driver.email || driver.id}</option>`)
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
  const columns = `id, user_id, driver_id, pickup_address, delivery_address, expected_pickup, expected_delivery, current_status, created_at,
    profiles:user_id (email, full_name),
    driver:driver_id (email, full_name),
    order_status_events (id, status, reason, note, performed_by, created_at),
    scan_proofs (id, scan_type, scan_payload, image_url, note, performed_by, created_at),
    driver_assignments (id, driver_id, assigned_by, assigned_at, unassigned_at, note, driver:driver_id (email, full_name))`

  let query = supabase.from('orders').select(columns).order('created_at', { ascending: false })

  const status = els.statusFilter?.value
  if (status && status !== 'all') query = query.eq('current_status', status)

  const assignment = els.assignmentFilter?.value
  if (assignment === 'assigned') query = query.not('driver_id', 'is', null)
  if (assignment === 'unassigned') query = query.is('driver_id', null)

  const search = els.searchFilter?.value?.trim()
  if (search) {
    const asNumber = Number(search)
    if (!Number.isNaN(asNumber)) {
      query = query.eq('id', asNumber)
    } else {
      query = query.or(`pickup_address.ilike.%${search}%,delivery_address.ilike.%${search}%`)
    }
  }

  return query
}

const fetchOrders = async () => {
  setOrdersLoading(true)

  let { data, error } = await buildOrdersQuery()

  if (error) {
    console.warn('Full query failed, fallback to minimal select', error)
    const fallback = await supabase
      .from('orders')
      .select('id, user_id, driver_id, pickup_address, delivery_address, expected_pickup, expected_delivery, current_status, created_at')
      .order('created_at', { ascending: false })

    data = fallback.data
    error = fallback.error
  }

  setOrdersLoading(false)

  if (error) {
    showToast('Erreur lors du chargement des commandes', 'error')
    console.error(error)
    els.ordersEmpty?.classList.remove('hidden')
    return
  }

  state.orders = data || []
  state.ordersCache.clear()
  state.orders.forEach((o) => state.ordersCache.set(o.id, o))
  renderOrders()

  if (!state.activeOrderId && state.orders.length) {
    state.activeOrderId = state.orders[0].id
  }

  if (state.activeOrderId) {
    renderOrderDetail(state.ordersCache.get(state.activeOrderId))
  }

  updateMetrics()
}

const fetchDrivers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, email, role')
    .eq('role', 'driver')
    .order('full_name', { ascending: true })

  if (error) {
    console.error(error)
    showToast('Erreur lors du chargement des livreurs', 'error')
    return
  }

  state.drivers = data || []
  renderDrivers()

  if (state.activeOrderId && state.ordersCache.has(state.activeOrderId)) {
    renderOrderDetail(state.ordersCache.get(state.activeOrderId))
  }
}

const fetchDriverStats = async () => {
  const { data, error } = await supabase
    .from('orders')
    .select('driver_id, current_status')
    .not('driver_id', 'is', null)

  if (error) {
    console.error(error)
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
  const { error: updateError } = await supabase
    .from('orders')
    .update({ driver_id: driverId })
    .eq('id', orderId)

  if (updateError) return { error: updateError }

  const { error: assignError } = await supabase.from('driver_assignments').insert({
    order_id: orderId,
    driver_id: driverId,
    assigned_by: state.session.user.id,
    assigned_at: new Date().toISOString(),
    note: 'Assigné par admin',
  })

  if (assignError) return { error: assignError }

  const { error: statusError } = await supabase.from('order_status_events').insert({
    order_id: orderId,
    status: 'assigned',
    reason: 'system',
    note: 'Assigned by admin',
    performed_by: state.session.user.id,
  })

  return { error: statusError }
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
    btn.addEventListener('click', () => {
      const target = btn.dataset.target
      if (btn.classList.contains('logout-button')) return

      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')

      els.views.forEach((view) => {
        view.classList.toggle('active', view.id === target)
      })

      const title = target === 'drivers-view' ? 'Livreurs' : 'Commandes'
      const pageTitle = document.getElementById('page-title')
      if (pageTitle) pageTitle.textContent = target ? (title || 'Commandes') : 'Commandes'

      if (target === 'drivers-view') {
        fetchDrivers()
      }
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
      openOrder(Number(target.dataset.open))
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

export const initAdmin = (session) => {
  state.session = session
  setDetailMessage('Sélectionnez une commande pour afficher le détail.')
  bindNavigation()
  bindFilters()
  bindOrdersTable()
  bindQuickActions()
  fetchDrivers()
  fetchOrders()
  handleRealtime()
}
