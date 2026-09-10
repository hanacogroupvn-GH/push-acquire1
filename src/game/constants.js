// Core Acquire rules constants (Hasbro/Avalon Hill standard edition).

export const CHAINS = [
  { id: 'worldwide', name: 'Worldwide', tier: 1, color: '#c9a8e0' }, // tím nhạt
  { id: 'sackson', name: 'Sackson', tier: 1, color: '#f2c14e' }, // vàng
  { id: 'festival', name: 'Festival', tier: 2, color: '#3fa66f' }, // xanh lá
  { id: 'imperial', name: 'Imperial', tier: 2, color: '#e67e22' }, // cam
  { id: 'american', name: 'American', tier: 2, color: '#1e3a8a' }, // dark blue đậm
  { id: 'continental', name: 'Continental', tier: 3, color: '#c0392b' }, // đỏ
  { id: 'tower', name: 'Tower', tier: 3, color: '#3a3a3a' }, // đen
]

export const CHAINS_BY_ID = Object.fromEntries(CHAINS.map((c) => [c.id, c]))

export const HAND_SIZE = 6
export const STARTING_CASH = 6000
export const MAX_SHARES_PER_CHAIN = 25
export const SAFE_CHAIN_SIZE = 11
export const MAX_STOCK_PURCHASES_PER_TURN = 3
export const GAME_ENDING_CHAIN_SIZE = 41
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 6

// Official Acquire price chart. Price depends on chain size and price tier
// (tier 1 = cheapest of the 7 chains, tier 3 = priciest).
function priceRow(size) {
  if (size <= 1) return null
  if (size === 2) return [200, 300, 400]
  if (size === 3) return [300, 400, 500]
  if (size === 4) return [400, 500, 600]
  if (size === 5) return [500, 600, 700]
  if (size <= 10) return [600, 700, 800]
  if (size <= 20) return [700, 800, 900]
  if (size <= 30) return [800, 900, 1000]
  if (size <= 40) return [900, 1000, 1100]
  return [1000, 1100, 1200]
}

export function sharePrice(tier, size) {
  const row = priceRow(size)
  if (!row) return 0
  return row[tier - 1]
}

export function majorityBonus(tier, size) {
  return sharePrice(tier, size) * 10
}

export function minorityBonus(tier, size) {
  return sharePrice(tier, size) * 5
}
