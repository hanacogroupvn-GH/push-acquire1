import { neighborsOf, shuffledTileBag } from './board.js'
import {
  CHAINS,
  CHAINS_BY_ID,
  HAND_SIZE,
  STARTING_CASH,
  MAX_SHARES_PER_CHAIN,
  SAFE_CHAIN_SIZE,
  MAX_STOCK_PURCHASES_PER_TURN,
  GAME_ENDING_CHAIN_SIZE,
  sharePrice,
  majorityBonus,
  minorityBonus,
} from './constants.js'

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

// playerConfigs: [{ name, isAI }, ...] (a bare string is treated as a human name)
export function initGame(playerConfigs, random = Math.random) {
  const order = playerConfigs.map((c) => (typeof c === 'string' ? { name: c, isAI: false } : c))
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const tileBag = shuffledTileBag(random)
  const players = order.map((config, i) => ({
    id: `p${i}`,
    name: config.name,
    isAI: !!config.isAI,
    cash: STARTING_CASH,
    shares: Object.fromEntries(CHAINS.map((c) => [c.id, 0])),
    tiles: [],
  }))
  for (const player of players) {
    for (let i = 0; i < HAND_SIZE; i += 1) {
      if (tileBag.length > 0) player.tiles.push(tileBag.pop())
    }
  }

  return {
    phase: 'place-tile',
    players,
    currentPlayerIndex: 0,
    board: {}, // tileId -> chainId | 'unincorporated' | 'pending-merger'
    chains: Object.fromEntries(CHAINS.map((c) => [c.id, { id: c.id, tiles: [] }])),
    bank: Object.fromEntries(CHAINS.map((c) => [c.id, MAX_SHARES_PER_CHAIN])),
    tileBag,
    deadTiles: [],
    pendingFounding: null,
    pendingMerger: null,
    purchasesThisTurn: Object.fromEntries(CHAINS.map((c) => [c.id, 0])),
    log: [],
    gameEnded: false,
    finalStandings: null,
    winnerId: null,
    // Names that have been founded at least once. A name founding for the
    // very first time is assigned automatically (see PLACE_TILE below) --
    // players only get to choose a chain name when re-founding one that has
    // already existed before (and gone defunct in a merger).
    everFounded: [],
    // In-game randomness (auto-founding picks) needs to be reproducible from
    // a plain, structuredClone-safe value -- a function can't survive the
    // structuredClone() done throughout this reducer. Seeded once here from
    // the caller's random source; see drawRandom().
    rngSeed: Math.floor(random() * 0x7fffffff),
  }
}

// Deterministic PRNG draw, advancing (and persisting) the seed on the
// mutable draft `state` passed in. Kept as a plain number on state instead of
// a function so every reducer branch that clones state via structuredClone()
// keeps working.
function drawRandom(state) {
  state.rngSeed = (state.rngSeed * 1103515245 + 12345) & 0x7fffffff
  return state.rngSeed / 0x7fffffff
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function currentPlayer(state) {
  return state.players[state.currentPlayerIndex]
}

export function activeChains(state) {
  return Object.values(state.chains).filter((c) => c.tiles.length > 0)
}

export function isChainSafe(chain) {
  return chain.tiles.length >= SAFE_CHAIN_SIZE
}

export function availableChainIds(state) {
  return CHAINS.filter((c) => state.chains[c.id].tiles.length === 0).map((c) => c.id)
}

export function endConditionMet(state) {
  const active = activeChains(state)
  if (active.length === 0) return false
  if (active.some((c) => c.tiles.length >= GAME_ENDING_CHAIN_SIZE)) return true
  return active.every(isChainSafe)
}

export function totalPurchasesThisTurn(state) {
  return Object.values(state.purchasesThisTurn).reduce((sum, n) => sum + n, 0)
}

// Which player must act next, regardless of whose "turn" it nominally is --
// a merger can interrupt with a different player's stock decision.
export function actorForPhase(state) {
  if (state.phase === 'merger-stock-decision') {
    return state.players.find((p) => p.id === state.pendingMerger.currentShareholderId) ?? null
  }
  if (state.phase === 'game-over') return null
  return currentPlayer(state)
}

export function classifyPlacement(state, tileId) {
  const chainIds = new Set()
  const looseSingles = []
  for (const n of neighborsOf(tileId)) {
    const occupant = state.board[n]
    if (!occupant) continue
    if (occupant === 'unincorporated') looseSingles.push(n)
    else if (occupant !== 'pending-merger') chainIds.add(occupant)
  }
  return { neighborChainIds: [...chainIds], looseSingles }
}

export function isTileDead(state, tileId) {
  const { neighborChainIds, looseSingles } = classifyPlacement(state, tileId)
  if (neighborChainIds.length >= 2) {
    const safeCount = neighborChainIds.filter((id) => isChainSafe(state.chains[id])).length
    if (safeCount >= 2) return true
  }
  if (neighborChainIds.length === 0 && looseSingles.length >= 1) {
    if (availableChainIds(state).length === 0) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Internal helpers (mutate a draft state that the caller already cloned)
// ---------------------------------------------------------------------------

function turnOrderFrom(state, startIndex) {
  const n = state.players.length
  return Array.from({ length: n }, (_, i) => state.players[(startIndex + i) % n])
}

function roundUpToHundred(n) {
  return Math.ceil(n / 100) * 100
}

function payPlayer(state, playerId, amount, reason, chainId) {
  if (amount <= 0) return
  const player = state.players.find((p) => p.id === playerId)
  player.cash += amount
  state.log.push({ type: 'bonus', playerId, amount, reason, chainId })
}

// Pure: given a snapshot of players' holdings, returns { playerId: amount }
// for the majority/minority bonus payout of one chain. Used both to actually
// pay out (below) and by the AI to estimate the value of a prospective move.
export function computeChainBonusPayouts(players, chainId, size, tier) {
  const payouts = {}
  const holders = players
    .map((p) => ({ id: p.id, count: p.shares[chainId] }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count)
  if (holders.length === 0) return payouts

  const majBonus = majorityBonus(tier, size)
  const minBonus = minorityBonus(tier, size)
  const topCount = holders[0].count
  const topHolders = holders.filter((h) => h.count === topCount)

  if (topHolders.length >= 2) {
    const share = roundUpToHundred((majBonus + minBonus) / topHolders.length)
    for (const h of topHolders) payouts[h.id] = (payouts[h.id] ?? 0) + share
    return payouts
  }

  payouts[topHolders[0].id] = (payouts[topHolders[0].id] ?? 0) + majBonus
  const rest = holders.filter((h) => h.id !== topHolders[0].id)
  if (rest.length === 0) {
    payouts[topHolders[0].id] += minBonus
    return payouts
  }
  const secondCount = rest[0].count
  const minorityHolders = rest.filter((h) => h.count === secondCount)
  const share = roundUpToHundred(minBonus / minorityHolders.length)
  for (const h of minorityHolders) payouts[h.id] = (payouts[h.id] ?? 0) + share
  return payouts
}

function payChainBonuses(state, chainId, size, tier) {
  const payouts = computeChainBonusPayouts(state.players, chainId, size, tier)
  for (const [playerId, amount] of Object.entries(payouts)) {
    payPlayer(state, playerId, amount, 'chain-bonus', chainId)
  }
}

function goToBuyStock(state) {
  state.phase = 'buy-stock'
  state.purchasesThisTurn = Object.fromEntries(CHAINS.map((c) => [c.id, 0]))
  return state
}

// Assigns `state.pendingFounding`'s tiles to `chainId`, whether chosen by a
// player (re-founding) or picked automatically (a name's first-ever founding
// -- see PLACE_TILE). `state` must already be a mutable draft.
function foundChain(state, chainId, { auto = false } = {}) {
  const chain = state.chains[chainId]
  chain.tiles = [...state.pendingFounding.tileIds]
  for (const t of chain.tiles) state.board[t] = chainId
  const founder = currentPlayer(state)
  const freeShare = state.bank[chainId] > 0
  if (freeShare) {
    state.bank[chainId] -= 1
    founder.shares[chainId] += 1
  }
  if (!state.everFounded.includes(chainId)) state.everFounded.push(chainId)
  state.log.push({ type: 'found', chainId, playerId: founder.id, freeShare, auto })
  state.pendingFounding = null
  return goToBuyStock(state)
}

function finalizeMerger(state) {
  const pm = state.pendingMerger
  const survivor = state.chains[pm.survivorId]
  const allTiles = new Set(survivor.tiles)
  for (const chainId of pm.involvedChainIds) {
    if (chainId === pm.survivorId) continue
    const chain = state.chains[chainId]
    for (const t of chain.tiles) allTiles.add(t)
    chain.tiles = []
  }
  for (const t of pm.absorbedTileIds) allTiles.add(t)
  survivor.tiles = [...allTiles]
  for (const t of allTiles) state.board[t] = pm.survivorId

  state.log.push({ type: 'merge-complete', survivorId: pm.survivorId, chainIds: pm.involvedChainIds })
  state.pendingMerger = null
  return goToBuyStock(state)
}

function advanceToNextShareholder(state) {
  const pm = state.pendingMerger
  if (pm.shareholderQueue.length === 0) {
    return advanceToNextDefunctChain(state)
  }
  pm.currentShareholderId = pm.shareholderQueue[0]
  state.phase = 'merger-stock-decision'
  return state
}

function advanceToNextDefunctChain(state) {
  const pm = state.pendingMerger
  if (pm.defunctQueue.length === 0) {
    return finalizeMerger(state)
  }
  const chainId = pm.defunctQueue.shift()
  pm.currentDefunctChainId = chainId
  const size = pm.chainSizesAtMerger[chainId]
  payChainBonuses(state, chainId, size, CHAINS_BY_ID[chainId].tier)
  const order = turnOrderFrom(state, state.currentPlayerIndex)
  pm.shareholderQueue = order.filter((p) => p.shares[chainId] > 0).map((p) => p.id)
  return advanceToNextShareholder(state)
}

function beginDefunctProcessing(state) {
  const pm = state.pendingMerger
  for (const t of pm.absorbedTileIds) state.board[t] = 'pending-merger'
  const defunct = pm.involvedChainIds.filter((id) => id !== pm.survivorId)
  defunct.sort((a, b) => pm.chainSizesAtMerger[b] - pm.chainSizesAtMerger[a])
  pm.defunctQueue = defunct
  return advanceToNextDefunctChain(state)
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function gameReducer(state, action) {
  switch (action.type) {
    case 'START_GAME':
      return initGame(action.players, action.random)

    // Wholesale rewind to a snapshot captured before a placement -- see
    // GameContext's UNDO_PLACEMENT handling. Not a normal gameplay action.
    case 'RESTORE_STATE':
      return action.state

    case 'PLACE_TILE': {
      if (state.phase !== 'place-tile') return state
      const player = currentPlayer(state)
      if (!player.tiles.includes(action.tileId)) return state
      if (isTileDead(state, action.tileId)) return state

      const { neighborChainIds, looseSingles } = classifyPlacement(state, action.tileId)
      const next = structuredClone(state)
      const np = currentPlayer(next)
      np.tiles = np.tiles.filter((t) => t !== action.tileId)

      if (neighborChainIds.length === 0 && looseSingles.length === 0) {
        next.board[action.tileId] = 'unincorporated'
        next.log.push({ type: 'place', tileId: action.tileId, playerId: player.id })
        return goToBuyStock(next)
      }

      if (neighborChainIds.length === 0) {
        next.pendingFounding = { tileIds: [action.tileId, ...looseSingles], triggerTileId: action.tileId }
        for (const t of next.pendingFounding.tileIds) next.board[t] = 'unincorporated'
        next.log.push({ type: 'place', tileId: action.tileId, playerId: player.id })

        // A name that has never been founded before is assigned
        // automatically (randomly, among the still-virgin names) rather than
        // letting the player pick -- picking freely among all 7 identities on
        // a brand-new founding is too strong a strategic lever. Only once a
        // name has been through the cycle once (founded, then merged away)
        // does re-founding become a deliberate player choice.
        const virginAvailable = availableChainIds(next).filter((id) => !next.everFounded.includes(id))
        if (virginAvailable.length > 0) {
          const pick = virginAvailable[Math.floor(drawRandom(next) * virginAvailable.length)]
          return foundChain(next, pick, { auto: true })
        }

        next.phase = 'found-chain'
        return next
      }

      if (neighborChainIds.length === 1) {
        const chainId = neighborChainIds[0]
        const chain = next.chains[chainId]
        const addedTiles = [action.tileId, ...looseSingles]
        chain.tiles.push(...addedTiles)
        for (const t of addedTiles) next.board[t] = chainId
        next.log.push({ type: 'grow', chainId, tileId: action.tileId, playerId: player.id })
        return goToBuyStock(next)
      }

      // Merger: tile touches 2+ distinct chains.
      const sizes = Object.fromEntries(neighborChainIds.map((id) => [id, next.chains[id].tiles.length]))
      const maxSize = Math.max(...Object.values(sizes))
      const candidates = neighborChainIds.filter((id) => sizes[id] === maxSize)

      next.pendingMerger = {
        triggerTileId: action.tileId,
        absorbedTileIds: [action.tileId, ...looseSingles],
        involvedChainIds: neighborChainIds,
        chainSizesAtMerger: sizes,
        survivorId: candidates.length === 1 ? candidates[0] : null,
        candidates: candidates.length > 1 ? candidates : null,
        defunctQueue: [],
        currentDefunctChainId: null,
        shareholderQueue: [],
        currentShareholderId: null,
      }
      next.log.push({ type: 'merge-trigger', chainIds: neighborChainIds, tileId: action.tileId, playerId: player.id })

      if (candidates.length > 1) {
        next.phase = 'choose-merger-survivor'
        return next
      }
      return beginDefunctProcessing(next)
    }

    case 'PASS_PLACEMENT': {
      // Only legal when the tile bag ran out and the player's hand is empty --
      // otherwise there is always a real placement (or a dead tile to discard) to make.
      if (state.phase !== 'place-tile') return state
      const player = currentPlayer(state)
      if (player.tiles.length > 0) return state
      const next = structuredClone(state)
      next.log.push({ type: 'pass', playerId: player.id })
      return goToBuyStock(next)
    }

    case 'DISCARD_DEAD_TILE': {
      if (state.phase !== 'place-tile') return state
      const player = currentPlayer(state)
      if (!player.tiles.includes(action.tileId)) return state
      if (!isTileDead(state, action.tileId)) return state
      const next = structuredClone(state)
      const np = currentPlayer(next)
      np.tiles = np.tiles.filter((t) => t !== action.tileId)
      next.deadTiles.push(action.tileId)
      if (next.tileBag.length > 0) np.tiles.push(next.tileBag.pop())
      next.log.push({ type: 'discard-dead', tileId: action.tileId, playerId: player.id })
      return next
    }

    case 'CHOOSE_CHAIN_NAME': {
      if (state.phase !== 'found-chain') return state
      if (state.chains[action.chainId].tiles.length !== 0) return state
      const next = structuredClone(state)
      return foundChain(next, action.chainId)
    }

    case 'CHOOSE_MERGER_SURVIVOR': {
      if (state.phase !== 'choose-merger-survivor') return state
      if (!state.pendingMerger.candidates?.includes(action.chainId)) return state
      const next = structuredClone(state)
      next.pendingMerger.survivorId = action.chainId
      return beginDefunctProcessing(next)
    }

    case 'RESOLVE_STOCK_DECISION': {
      if (state.phase !== 'merger-stock-decision') return state
      if (state.pendingMerger.currentShareholderId !== action.playerId) return state
      const next = structuredClone(state)
      const pm = next.pendingMerger
      const player = next.players.find((p) => p.id === action.playerId)
      const chainId = pm.currentDefunctChainId
      const held = player.shares[chainId]

      const tradeUnits = Math.max(
        0,
        Math.min(action.tradeUnits ?? 0, Math.floor(held / 2), next.bank[pm.survivorId]),
      )
      const remainingAfterTrade = held - tradeUnits * 2
      const sellCount = Math.max(0, Math.min(action.sellCount ?? 0, remainingAfterTrade))
      const price = sharePrice(CHAINS_BY_ID[chainId].tier, pm.chainSizesAtMerger[chainId])

      player.shares[chainId] -= tradeUnits * 2 + sellCount
      player.shares[pm.survivorId] += tradeUnits
      next.bank[pm.survivorId] -= tradeUnits
      next.bank[chainId] += tradeUnits * 2 + sellCount
      player.cash += sellCount * price

      next.log.push({
        type: 'stock-decision',
        playerId: action.playerId,
        chainId,
        tradeUnits,
        sellCount,
        kept: held - tradeUnits * 2 - sellCount,
      })

      pm.shareholderQueue.shift()
      return advanceToNextShareholder(next)
    }

    case 'BUY_SHARE': {
      if (state.phase !== 'buy-stock') return state
      if (totalPurchasesThisTurn(state) >= MAX_STOCK_PURCHASES_PER_TURN) return state
      const chain = state.chains[action.chainId]
      if (!chain || chain.tiles.length === 0) return state
      if (state.bank[action.chainId] <= 0) return state
      const price = sharePrice(CHAINS_BY_ID[action.chainId].tier, chain.tiles.length)
      const player = currentPlayer(state)
      if (player.cash < price) return state

      const next = structuredClone(state)
      const np = currentPlayer(next)
      np.cash -= price
      np.shares[action.chainId] += 1
      next.bank[action.chainId] -= 1
      next.purchasesThisTurn[action.chainId] += 1
      next.log.push({ type: 'buy', chainId: action.chainId, playerId: player.id, price })
      return next
    }

    case 'UNDO_BUY_SHARE': {
      if (state.phase !== 'buy-stock') return state
      if ((state.purchasesThisTurn[action.chainId] ?? 0) <= 0) return state
      const chain = state.chains[action.chainId]
      const price = sharePrice(CHAINS_BY_ID[action.chainId].tier, chain.tiles.length)
      const player = currentPlayer(state)

      const next = structuredClone(state)
      const np = currentPlayer(next)
      np.cash += price
      np.shares[action.chainId] -= 1
      next.bank[action.chainId] += 1
      next.purchasesThisTurn[action.chainId] -= 1
      next.log.push({ type: 'undo-buy', chainId: action.chainId, playerId: player.id, price })
      return next
    }

    case 'END_TURN': {
      if (state.phase !== 'buy-stock') return state
      const next = structuredClone(state)
      const np = currentPlayer(next)
      while (np.tiles.length < HAND_SIZE && next.tileBag.length > 0) {
        np.tiles.push(next.tileBag.pop())
      }
      next.currentPlayerIndex = (next.currentPlayerIndex + 1) % next.players.length
      next.purchasesThisTurn = Object.fromEntries(CHAINS.map((c) => [c.id, 0]))
      next.phase = 'place-tile'
      return next
    }

    case 'DECLARE_GAME_END': {
      if (state.phase !== 'buy-stock') return state
      if (!endConditionMet(state)) return state
      const next = structuredClone(state)

      for (const chain of Object.values(next.chains)) {
        if (chain.tiles.length === 0) continue
        payChainBonuses(next, chain.id, chain.tiles.length, CHAINS_BY_ID[chain.id].tier)
      }
      for (const player of next.players) {
        for (const chain of Object.values(next.chains)) {
          const held = player.shares[chain.id]
          if (held > 0 && chain.tiles.length > 0) {
            const price = sharePrice(CHAINS_BY_ID[chain.id].tier, chain.tiles.length)
            player.cash += held * price
            player.shares[chain.id] = 0
            next.bank[chain.id] += held
          }
        }
      }

      next.gameEnded = true
      next.phase = 'game-over'
      next.finalStandings = [...next.players].sort((a, b) => b.cash - a.cash)
      next.winnerId = next.finalStandings[0]?.id ?? null
      return next
    }

    default:
      return state
  }
}
