import { supabase } from './supabase.js'

const state = {
  session: null,
  orders: [],
  ordersCache: new Map(),
  drivers: [],
  activeOrderId: null,
  realtime: null,
}

const ordersTable = document.getElementById('orders-table')
const ordersEmpty = document.getElementById('orders-empty')
const ordersCount = document.getElementById('orders-count')
const orderDetail = document.getElementById('order-detail')

const driversTable = document.getElementById('drivers-table')
const driversEmpty = document.getElementById('drivers-empty')

const statusFilter = document.getElementById('status-filter')
const assignmentFilter = document.getElementById('assignment-filter')
const searchFilter = document.getElementById('search-filter')
const refreshOrdersBtn = document.getElementById('refresh-orders')

const toast = document.getElementById('toast')

const formatDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

const showToast = (message, variant = 'info') => {
  if (!toast) return
  toast.textContent = message
  toast.className = `toast ${variant}`
  toast.classList.remove('hidden')
  setTimeout(() => toast.classList.add('hidden'), 3200)
}

const badge = (text) => `<span class="badge">${text}</span>`

const shortId = (id) => `#${id}`

const renderOrders = () => {
  ordersTable.innerHTML = ''
  const list = state.orders

  if (!list.length) {
    ordersEmpty.classList.remove('hidden')
    ordersCount.textContent = '0 commande'
    return
  }

  ordersEmpty.classList.add('hidden')
  ordersCount.textContent = `${list.length} commande${list.length > 1 ? 's' : ''}`

  list.forEach((order) => {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${shortId(order.id)}</td>
      <td>${order.profiles?.email || '—'}</td>
      <td>${order.driver?.email || '—'}</td>
      <td>${badge(order.current_status)}</td>
      <td>${formatDate(order.created_at)}</td>
      <td class="table-actions"><button data-open="${order.id}" class="ghost-btn">Ouvrir</button></td>
    `
    ordersTable.appendChild(row)
  })
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
  if (!order) {
    orderDetail.classList.add('hidden')
    return
  }

  orderDetail.classList.remove('hidden')
  orderDetail.innerHTML = `
    <div class="detail-header">
      <div>
        <p class="eyebrow">Commande</p>
        <h2>${shortId(order.id)}</h2>
        <p class="muted">Client : ${order.profiles?.email || '—'}</p>
      </div>
      <div class="pill">${order.current_status}</div>
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
        <p class="value">${order.driver?.email || 'Non assigné'}</p>
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

const fetchOrders = async () => {
  let query = supabase
    .from('orders')
    .select(
      `id, user_id, driver_id, pickup_address, delivery_address, expected_pickup, expected_delivery, current_status, created_at,
       profiles:user_id (email, full_name),
       driver:driver_id (email, full_name),
       order_status_events (id, status, reason, note, performed_by, created_at),
       scan_proofs (id, scan_type, scan_payload, image_url, note, performed_by, created_at),
       driver_assignments (id, driver_id, assigned_by, assigned_at, unassigned_at, note, driver:driver_id (email, full_name))`
    )
    .order('created_at', { ascending: false })

  const status = statusFilter.value
  if (status && status !== 'all') query = query.eq('current_status', status)

  const assignment = assignmentFilter.value
  if (assignment === 'assigned') query = query.not('driver_id', 'is', null)
  if (assignment === 'unassigned') query = query.is('driver_id', null)

  const search = searchFilter.value.trim()
  if (search) {
    const asNumber = Number(search)
    if (!Number.isNaN(asNumber)) {
      query = query.eq('id', asNumber)
    } else {
      query = query.or(
        `pickup_address.ilike.%${search}%,delivery_address.ilike.%${search}%`
      )
    }
  }

  const { data, error } = await query

  if (error) {
    showToast("Erreur lors du chargement des commandes", 'error')
    console.error(error)
    return
  }

  state.orders = data || []
  state.ordersCache.clear()
  state.orders.forEach((o) => state.ordersCache.set(o.id, o))
  renderOrders()
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
  driversTable.innerHTML = ''
  const stats = await fetchDriverStats()

  if (!state.drivers.length) {
    driversEmpty.classList.remove('hidden')
    return
  }
  driversEmpty.classList.add('hidden')

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
    driversTable.appendChild(row)
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
    .subscribe()
}

const bindNavigation = () => {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target
      if (btn.classList.contains('logout-button')) return

      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')

      document.querySelectorAll('.view').forEach((view) => {
        view.classList.toggle('active', view.id === target)
      })

      const title = target === 'drivers-view' ? 'Livreurs' : 'Commandes'
      document.getElementById('page-title').textContent = title

      if (target === 'drivers-view') {
        fetchDrivers()
      }
    })
  })
}

const bindFilters = () => {
  ;[statusFilter, assignmentFilter, searchFilter].forEach((el) => {
    el?.addEventListener('change', fetchOrders)
    el?.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') fetchOrders()
    })
  })
  refreshOrdersBtn?.addEventListener('click', fetchOrders)

  ordersTable.addEventListener('click', (event) => {
    const target = event.target
    if (target instanceof HTMLButtonElement && target.dataset.open) {
      openOrder(Number(target.dataset.open))
    }
  })
}

export const initAdmin = (session) => {
  state.session = session
  bindNavigation()
  bindFilters()
  fetchDrivers()
  fetchOrders()
  handleRealtime()
}
