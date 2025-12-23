import { supabase } from './supabase.js'

const orderList = document.getElementById('orders-list')
const statusTemplate = document.getElementById('status-template')
const createForm = document.getElementById('create-order-form')
const createFeedback = document.getElementById('create-feedback')
const emptyState = document.getElementById('empty-state')
let userRef = null
const orderCache = new Map()
let statusChannel = null

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return date.toLocaleString()
}

const renderStatusHistory = (events = []) => {
  if (!statusTemplate) return document.createElement('div')
  const container = statusTemplate.content.cloneNode(true)
  const list = container.querySelector('.status-list')
  list.innerHTML = ''

  events
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .forEach((event) => {
      const item = document.createElement('div')
      item.className = 'status-chip'
      item.innerHTML = `
        <div class="status-chip__header">
          <span class="status-chip__status">${event.status}</span>
          <span class="status-chip__time">${formatDate(event.created_at)}</span>
        </div>
        ${event.notes ? `<p class="status-chip__note">${event.notes}</p>` : ''}
      `
      list.appendChild(item)
    })

  return container
}

const buildOrderCard = (order) => {
  const card = document.createElement('article')
  card.className = 'card order-card'
  card.dataset.orderId = order.id

  card.innerHTML = `
    <header class="card__header">
      <div>
        <p class="eyebrow">Commande</p>
        <h3>#${order.id}</h3>
      </div>
      <div class="badge">${order.current_status}</div>
    </header>
    <div class="card__content">
      <div class="info-row">
        <div>
          <p class="label">Adresse de collecte</p>
          <p class="value">${order.pickup_address}</p>
        </div>
        <div>
          <p class="label">Adresse de livraison</p>
          <p class="value">${order.delivery_address}</p>
        </div>
      </div>
      <div class="info-row">
        <div>
          <p class="label">Collecte prévue</p>
          <p class="value">${formatDate(order.expected_pickup)}</p>
        </div>
        <div>
          <p class="label">Livraison prévue</p>
          <p class="value">${formatDate(order.expected_delivery)}</p>
        </div>
      </div>
      <div class="info-row">
        <div>
          <p class="label">Créée le</p>
          <p class="value">${formatDate(order.created_at)}</p>
        </div>
        <div>
          <p class="label">Statut actuel</p>
          <p class="value status-text">${order.current_status}</p>
        </div>
      </div>
      <div class="status-history">
        <div class="status-history__header">
          <h4>Historique des statuts</h4>
          <p class="muted">Lecture seule</p>
        </div>
        <div class="status-list"></div>
      </div>
    </div>
  `

  const historyContainer = card.querySelector('.status-history')
  historyContainer.appendChild(renderStatusHistory(order.order_status_events || []))

  return card
}

const renderOrders = (orders = []) => {
  orderList.innerHTML = ''

  if (!orders.length) {
    emptyState.classList.remove('hidden')
    return
  }

  emptyState.classList.add('hidden')

  orders.forEach((order) => {
    orderList.appendChild(buildOrderCard(order))
  })
}

const fetchOrders = async () => {
  if (!userRef) return
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, pickup_address, delivery_address, expected_pickup, expected_delivery, current_status, created_at, order_status_events (status, created_at, notes, order_id)'
    )
    .eq('user_id', userRef.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erreur lors de la récupération des commandes', error)
    orderList.innerHTML = '<p class="error">Impossible de charger vos commandes.</p>'
    return
  }

  orderCache.clear()
  data.forEach((order) => orderCache.set(order.id, order))
  renderOrders(data)
}

const handleRealtime = () => {
  if (statusChannel) return

  statusChannel = supabase.channel('order-status-events')

  statusChannel
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'order_status_events' },
      async (payload) => {
        const event = payload.new
        const orderId = event.order_id

        if (!orderCache.has(orderId)) {
          await fetchOrders()
          return
        }

        const order = orderCache.get(orderId)
        const existingHistory = order.order_status_events || []
        const updatedHistory = [...existingHistory, event]

        const updatedOrder = {
          ...order,
          current_status: event.status || order.current_status,
          order_status_events: updatedHistory,
        }

        orderCache.set(orderId, updatedOrder)
        renderOrders(Array.from(orderCache.values()))
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info('Abonné aux mises à jour de statut en temps réel')
      }
    })
}

const resetCreateForm = () => {
  createForm.reset()
  createForm.querySelector('button[type="submit"]').disabled = false
  createForm.querySelector('button[type="submit"]').textContent = 'Créer la commande'
}

const bindCreateForm = () => {
  if (!createForm) return

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!userRef) return

    createFeedback.textContent = ''
    createFeedback.className = 'form-feedback'

    const pickupAddress = createForm.pickup_address.value.trim()
    const deliveryAddress = createForm.delivery_address.value.trim()
    const expectedPickup = createForm.expected_pickup.value
    const expectedDelivery = createForm.expected_delivery.value

    if (!pickupAddress || !deliveryAddress) {
      createFeedback.textContent =
        'Les adresses de collecte et de livraison sont obligatoires.'
      createFeedback.classList.add('error')
      return
    }

    const submitButton = createForm.querySelector('button[type="submit"]')
    submitButton.disabled = true
    submitButton.textContent = 'Création en cours...'

    const { error } = await supabase.from('orders').insert([
      {
        pickup_address: pickupAddress,
        delivery_address: deliveryAddress,
        expected_pickup: expectedPickup || null,
        expected_delivery: expectedDelivery || null,
      },
    ])

    if (error) {
      console.error('Erreur de création de commande', error)
      createFeedback.textContent =
        "Création impossible. Vérifiez les champs ou réessayez dans un instant."
      createFeedback.classList.add('error')
      resetCreateForm()
      return
    }

    createFeedback.textContent = 'Commande créée ! Vous serez notifié des statuts.'
    createFeedback.classList.add('success')
    resetCreateForm()
    await fetchOrders()
  })
}

export const initOrders = (user) => {
  userRef = user
  bindCreateForm()
  fetchOrders()
  handleRealtime()
}
