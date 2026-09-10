import { neighborsOf } from './board.js'
import { CHAINS, CHAINS_BY_ID, MAX_STOCK_PURCHASES_PER_TURN, sharePrice } from './constants.js'
import {
  gameReducer,
  actorForPhase,
  isTileDead,
  availableChainIds,
  activeChains,
  totalPurchasesThisTurn,
  computeChainBonusPayouts,
  endConditionMet,
  classifyPlacement,
} from './gameReducer.js'

// Given the current state and the id of the AI player who must act, returns
// the single next action to dispatch. The caller re-invokes this after every
// state change, so multi-step turns (place -> buy x3 -> end) happen as a
// sequence of independent one-step decisions rather than a single plan.
//
// `getBestMove` is an alias for the same entry point, kept for anyone looking
// for a `getBestMove(gameState, botPlayer)`-shaped function: the "evaluate
// every tile, and the up-to-3 stock buys that follow it, as one scored turn"
// logic already happens inside decidePlacement/pickBestTile below (see
// simulateTurnOutcome) -- it just returns its decisions one step at a time,
// like every other phase, instead of as a single bundled plan, since the
// caller (useAIDriver.js) re-invokes this after each dispatched action anyway.
export function decideAIAction(state, playerId) {
  switch (state.phase) {
    case 'place-tile':
      return decidePlacement(state, playerId)
    case 'found-chain':
      return decideFounding(state, playerId)
    case 'choose-merger-survivor':
      return decideMergerSurvivor(state, playerId)
    case 'merger-stock-decision':
      return decideStockDecision(state, playerId)
    case 'buy-stock':
      return decideBuyStockStep(state, playerId)
    default:
      return null
  }
}

export const getBestMove = decideAIAction

function findPlayer(state, playerId) {
  return state.players.find((p) => p.id === playerId)
}

// How many OTHER tiles in a hand are adjacent to a given group of cells --
// used as a proxy for "how likely is this chain to keep growing soon".
function countHandExtensionPotential(player, groupTileIds) {
  const groupSet = new Set(groupTileIds)
  const neighborSet = new Set()
  for (const t of groupTileIds) {
    for (const n of neighborsOf(t)) neighborSet.add(n)
  }
  return player.tiles.filter((t) => !groupSet.has(t) && neighborSet.has(t)).length
}

// How heavily to weigh "the strongest rival's position" against "my own"
// when comparing outcomes. Without this, the AI is happy to hand an
// opponent a huge payout as long as it gets a small one too.
const OPPONENT_DENIAL_WEIGHT = 0.85

// Dollars of anticipated future value credited per share, per still-open
// board cell bordering that chain. Net worth alone only prices a chain at
// what it's worth RIGHT NOW; it can't tell a chain boxed in by neighbors
// (already near its final size) apart from one sitting in open board space
// with room to run up through several more price brackets. A strong player
// pays attention to that difference when deciding where to invest.
const GROWTH_POTENTIAL_WEIGHT = 20

// How many still-empty board cells border a chain -- the room it still has
// to grow. Used both to steer stock purchases and to credit a simulated
// outcome for the upside its holdings are sitting on, not just their price
// today.
function chainFrontierSize(state, chainId) {
  const chain = state.chains[chainId]
  const frontier = new Set()
  for (const t of chain.tiles) {
    for (const n of neighborsOf(t)) {
      if (!state.board[n]) frontier.add(n)
    }
  }
  return frontier.size
}

function growthPotentialValue(state, player) {
  let bonus = 0
  for (const c of CHAINS) {
    const shares = player.shares[c.id] || 0
    if (shares === 0) continue
    const chain = state.chains[c.id]
    if (chain.tiles.length < 2) continue
    bonus += shares * chainFrontierSize(state, c.id) * GROWTH_POTENTIAL_WEIGHT
  }
  return bonus
}

// ---------------------------------------------------------------------------
// Tile placement -- decided by actually simulating each candidate tile
// through to the end of the turn (founding/merger resolution, then this
// player's own stock purchases), THEN simulating the opponent's best likely
// response next turn too, and comparing the resulting net worth. Looking one
// move past our own is what separates "doesn't hurt itself" from actually
// planning ahead: a placement can look great in isolation and still be a
// mistake once you account for what it hands the opponent to work with next.
// ---------------------------------------------------------------------------

function decidePlacement(state, playerId) {
  const player = findPlayer(state, playerId)
  if (player.tiles.length === 0) return { type: 'PASS_PLACEMENT' }

  const liveTiles = player.tiles.filter((t) => !isTileDead(state, t))
  if (liveTiles.length === 0) {
    return { type: 'DISCARD_DEAD_TILE', tileId: player.tiles[0] }
  }

  const best = pickBestTile(state, playerId, liveTiles, { lookaheadOpponent: true })
  return { type: 'PLACE_TILE', tileId: best }
}

// Evaluates every candidate tile via simulation and returns the best one.
function pickBestTile(state, playerId, liveTiles, { lookaheadOpponent }) {
  let best = liveTiles[0]
  let bestScore = -Infinity
  for (const tileId of liveTiles) {
    const outcome = simulateTurnOutcome(state, playerId, tileId, { lookaheadOpponent })
    const score = scoreOutcome(outcome, playerId)
    if (score > bestScore) {
      bestScore = score
      best = tileId
    }
  }
  return best
}

// Plays out placing `tileId`, auto-resolving any founding/merger prompts it
// triggers (using this same AI logic for whichever player must decide --
// including an interrupted rival's stock decision, modeled as "what would a
// reasonable player do"), then this player's own buy-stock purchases. When
// `lookaheadOpponent` is set, continues one more ply: ends the turn and
// simulates the next player's best full turn too (using only 1-ply lookahead
// for THEM, so this never recurses past 2 turns deep).
function simulateTurnOutcome(state, playerId, tileId, { lookaheadOpponent = false } = {}) {
  let s = gameReducer(state, { type: 'PLACE_TILE', tileId })
  s = resolveInterrupts(s)
  s = simulateOwnBuying(s, playerId)

  if (lookaheadOpponent && s.phase === 'buy-stock' && actorForPhase(s)?.id === playerId) {
    let s2 = gameReducer(s, { type: 'END_TURN' })
    const nextActor = actorForPhase(s2)
    if (nextActor && s2.phase === 'place-tile') {
      const theirLive = nextActor.tiles.filter((t) => !isTileDead(s2, t))
      if (theirLive.length > 0) {
        const theirBest = pickBestTile(s2, nextActor.id, theirLive, { lookaheadOpponent: false })
        s2 = simulateTurnOutcome(s2, nextActor.id, theirBest, { lookaheadOpponent: false })
      } else if (nextActor.tiles.length === 0) {
        s2 = gameReducer(s2, { type: 'PASS_PLACEMENT' })
      }
    }
    s = s2
  }

  return s
}

// Resolves founding/merger sub-phases (found-chain, choose-merger-survivor,
// merger-stock-decision) that a placement can trigger, for whichever player
// is being interrupted. Never touches 'place-tile', so this can't loop back
// into a full turn simulation.
function resolveInterrupts(state) {
  let s = state
  let guard = 0
  while (s.phase !== 'buy-stock' && s.phase !== 'game-over' && guard < 50) {
    guard += 1
    const actor = actorForPhase(s)
    if (!actor) break
    const action = decideAIAction(s, actor.id)
    if (!action) break
    const next = gameReducer(s, action)
    if (next === s) break // safety net: a rejected action would otherwise spin forever
    s = next
  }
  return s
}

function simulateOwnBuying(state, playerId) {
  let s = state
  let guard = 0
  while (s.phase === 'buy-stock' && actorForPhase(s)?.id === playerId && guard < MAX_STOCK_PURCHASES_PER_TURN) {
    guard += 1
    const action = decideBuyStockStep(s, playerId)
    if (action.type !== 'BUY_SHARE') break
    const next = gameReducer(s, action)
    if (next === s) break
    s = next
  }
  return s
}

// Relative value of a resulting position: my net worth minus the strongest
// rival's, so a move that hands an opponent a fortune scores as bad for me
// even if I also gained a little.
function scoreOutcome(state, playerId) {
  const player = findPlayer(state, playerId)
  const valueOf = (p) => netWorth(state, p) + growthPotentialValue(state, p)
  const mine = valueOf(player)
  const bestRival = Math.max(0, ...state.players.filter((p) => p.id !== playerId).map(valueOf))
  return mine - bestRival * OPPONENT_DENIAL_WEIGHT
}

// ---------------------------------------------------------------------------
// Founding a new chain
// ---------------------------------------------------------------------------

function decideFounding(state, playerId) {
  const player = findPlayer(state, playerId)
  const options = availableChainIds(state)
  const potential = countHandExtensionPotential(player, state.pendingFounding.tileIds)
  const preferHighTier = potential >= 1

  // Reclaim a name I already hold shares in first: those shares were parked
  // (kept instead of sold) after an earlier merger specifically betting on a
  // refound, and this is the payoff -- founding gives a free share plus
  // first buy-in priority, instantly restoring liquidity to a stake that was
  // otherwise dead money. See decideStockDecision's hold logic below.
  const sorted = [...options].sort((a, b) => {
    const loyaltyA = player.shares[a] || 0
    const loyaltyB = player.shares[b] || 0
    if (loyaltyA !== loyaltyB) return loyaltyB - loyaltyA
    return preferHighTier ? CHAINS_BY_ID[b].tier - CHAINS_BY_ID[a].tier : CHAINS_BY_ID[a].tier - CHAINS_BY_ID[b].tier
  })
  return { type: 'CHOOSE_CHAIN_NAME', chainId: sorted[0] }
}

// A tile that would found a brand-new chain if played right now (empty cell,
// no chain or loose-single neighbor). Used to judge whether holding onto
// defunct shares after a merger is a reasonable bet on refounding that name.
function isIsolatedTile(state, tileId) {
  if (state.board[tileId]) return false
  const { neighborChainIds, looseSingles } = classifyPlacement(state, tileId)
  return neighborChainIds.length === 0 && looseSingles.length === 0
}

// ---------------------------------------------------------------------------
// Merger survivor tie-break
// ---------------------------------------------------------------------------

function decideMergerSurvivor(state, playerId) {
  const player = findPlayer(state, playerId)
  const pm = state.pendingMerger

  let best = pm.candidates[0]
  let bestValue = -Infinity
  for (const survivorId of pm.candidates) {
    const value = estimateMergerValue(state, player, pm.involvedChainIds, pm.chainSizesAtMerger, survivorId)
    if (value > bestValue) {
      bestValue = value
      best = survivorId
    }
  }
  return { type: 'CHOOSE_MERGER_SURVIVOR', chainId: best }
}

// Dollar value each player would walk away with from this merger outcome:
// their bonus payout from every chain that becomes defunct, plus the real
// liquidation value of shares they hold in each defunct chain -- whichever is
// actually better between selling at the defunct price and trading 2-for-1
// into the survivor (not a guessed multiplier), plus a smaller credit for
// existing shares in the surviving, still-growing chain.
function mergerValuePerPlayer(state, chainIds, sizes, survivorId) {
  const totals = Object.fromEntries(state.players.map((p) => [p.id, 0]))
  const survivorTier = CHAINS_BY_ID[survivorId].tier
  const survivorPrice = sharePrice(survivorTier, sizes[survivorId])

  for (const chainId of chainIds) {
    if (chainId === survivorId) continue
    const tier = CHAINS_BY_ID[chainId].tier
    const size = sizes[chainId]
    const price = sharePrice(tier, size)
    const payouts = computeChainBonusPayouts(state.players, chainId, size, tier)
    // A pair of defunct shares is worth max(sell them both for cash, trade
    // them for one survivor share) -- per share, that's max(price, survivorPrice / 2).
    const perShareValue = Math.max(price, survivorPrice / 2)
    for (const p of state.players) {
      totals[p.id] += (payouts[p.id] ?? 0) + (p.shares[chainId] || 0) * perShareValue
    }
  }
  for (const p of state.players) {
    totals[p.id] += (p.shares[survivorId] || 0) * survivorPrice * 0.2
  }
  return totals
}

// Relative value: what I gain MINUS what the best-positioned rival gains.
function estimateMergerValue(state, player, chainIds, sizes, survivorId) {
  const totals = mergerValuePerPlayer(state, chainIds, sizes, survivorId)
  const myValue = totals[player.id] ?? 0
  const bestRival = Math.max(0, ...state.players.filter((p) => p.id !== player.id).map((p) => totals[p.id] ?? 0))
  return myValue - bestRival * OPPONENT_DENIAL_WEIGHT
}

// ---------------------------------------------------------------------------
// Merger stock decision: trade only when it's actually worth more than
// cashing out, then either sell the remainder or hold a small stake back as
// a bet on refounding the same name.
// ---------------------------------------------------------------------------

function decideStockDecision(state, playerId) {
  const pm = state.pendingMerger
  const player = findPlayer(state, playerId)
  const chainId = pm.currentDefunctChainId
  const held = player.shares[chainId]
  if (held === 0) return { type: 'RESOLVE_STOCK_DECISION', playerId, tradeUnits: 0, sellCount: 0 }

  const defunctPrice = sharePrice(CHAINS_BY_ID[chainId].tier, pm.chainSizesAtMerger[chainId])
  const survivorId = pm.survivorId
  const survivorTier = CHAINS_BY_ID[survivorId].tier
  const survivorSize = pm.chainSizesAtMerger[survivorId]
  const survivorPrice = sharePrice(survivorTier, survivorSize)
  const maxTradeUnits = Math.min(Math.floor(held / 2), state.bank[survivorId])

  // Real per-pair comparison: 2 defunct shares sold for cash vs. traded for 1
  // survivor share, crediting whatever majority/minority swing that share
  // would actually cause in the survivor chain (not a guessed multiplier).
  let tradeUnits = 0
  if (maxTradeUnits > 0) {
    const survivorHeld = player.shares[survivorId] || 0
    const payoutAt = (extraShares) => {
      const hyp = state.players.map((p) =>
        p.id === playerId ? { ...p, shares: { ...p.shares, [survivorId]: survivorHeld + extraShares } } : p,
      )
      return computeChainBonusPayouts(hyp, survivorId, survivorSize, survivorTier)[playerId] ?? 0
    }
    const tradeAllValue = maxTradeUnits * survivorPrice + (payoutAt(maxTradeUnits) - payoutAt(0))
    const sellInsteadValue = maxTradeUnits * 2 * defunctPrice
    tradeUnits = tradeAllValue >= sellInsteadValue ? maxTradeUnits : 0
  }

  const remainingAfterTrade = held - tradeUnits * 2
  // Hold a few shares back, instead of selling everything, only when I have
  // a tile in hand that could found a fresh chain right now -- a real,
  // concrete shot at reclaiming this exact name (and its founder's share)
  // rather than a vague hope the name comes back someday.
  const canRefound = player.tiles.some((t) => isIsolatedTile(state, t))
  const holdCount = canRefound ? Math.min(remainingAfterTrade, 3) : 0
  const sellCount = remainingAfterTrade - holdCount

  return { type: 'RESOLVE_STOCK_DECISION', playerId, tradeUnits, sellCount }
}

// ---------------------------------------------------------------------------
// Buying stock (one share per call) and ending the turn
// ---------------------------------------------------------------------------

// Below this, every affordable chain is genuinely dead money (majority
// mathematically locked either way, and no room left to grow) -- better to
// hold cash than force a purchase, since cash is itself a weapon (see
// scoreShareBuy's deadMoney case below).
const MIN_WORTHWHILE_BUY_SCORE = -1000

function decideBuyStockStep(state, playerId) {
  const player = findPlayer(state, playerId)
  const remaining = MAX_STOCK_PURCHASES_PER_TURN - totalPurchasesThisTurn(state)

  if (remaining > 0) {
    const best = bestShareToBuy(state, player)
    if (best && best.score > MIN_WORTHWHILE_BUY_SCORE) return { type: 'BUY_SHARE', chainId: best.chainId }
  }

  if (endConditionMet(state) && isNetWorthLeader(state, player)) {
    return { type: 'DECLARE_GAME_END' }
  }
  return { type: 'END_TURN' }
}

function bestShareToBuy(state, player) {
  let best = null
  let bestScore = -Infinity
  for (const chain of activeChains(state)) {
    const meta = CHAINS_BY_ID[chain.id]
    const price = sharePrice(meta.tier, chain.tiles.length)
    if (state.bank[chain.id] <= 0 || player.cash < price) continue

    const score = scoreShareBuy(state, player, chain, price)
    if (score > bestScore) {
      bestScore = score
      best = { chainId: chain.id, score }
    }
  }
  return best
}

// Values buying ONE more share of `chain` in real dollars, not arbitrary
// points, so every term is directly comparable:
//   - `deltaBonusEV`: the exact swing in MY OWN eventual majority/minority
//     payout this specific share causes, computed with the same payout math
//     the reducer actually pays out with (computeChainBonusPayouts) --
//     capturing "catching up", "seizing outright majority", and "engineering
//     a deliberate tie to split both bonuses" all as one number, since all
//     three are just different-sized jumps in this same delta.
//   - `growthAppreciation`: room the chain still has to climb through more
//     price brackets (frontier size), which the payout delta above can't see
//     since it only prices the chain at its CURRENT size.
//   - `deadMoney`: once a lead is mathematically unbeatable (no rival could
//     catch up even buying out the entire bank) AND there's no board space
//     left for the chain to grow into, another share buys nothing -- no
//     payout delta, no appreciation, pure idle cash. Penalized hard so
//     other chains (or holding cash) win the comparison instead.
function scoreShareBuy(state, player, chain, price) {
  const meta = CHAINS_BY_ID[chain.id]
  const chainId = chain.id
  const size = chain.tiles.length
  const myCount = player.shares[chainId] || 0

  const before = computeChainBonusPayouts(state.players, chainId, size, meta.tier)[player.id] ?? 0
  const hypothetical = state.players.map((p) =>
    p.id === player.id ? { ...p, shares: { ...p.shares, [chainId]: myCount + 1 } } : p,
  )
  const after = computeChainBonusPayouts(hypothetical, chainId, size, meta.tier)[player.id] ?? 0
  const deltaBonusEV = after - before

  const frontier = chainFrontierSize(state, chainId)
  const growthAppreciation = frontier * GROWTH_POTENTIAL_WEIGHT

  const othersMax = Math.max(0, ...state.players.filter((p) => p.id !== player.id).map((p) => p.shares[chainId] || 0))
  const locked = myCount > othersMax + state.bank[chainId]
  const deadMoney = locked && frontier === 0

  let score = deltaBonusEV + growthAppreciation
  if (deadMoney) score -= 5000
  score -= price / 250 // tiny affordability tie-break
  score -= myCount * 0.15 // tiny tie-break only, nudges toward spreading between truly equal options
  return score
}

function netWorth(state, player) {
  return CHAINS.reduce((sum, c) => {
    const chain = state.chains[c.id]
    if (chain.tiles.length < 2) return sum
    return sum + (player.shares[c.id] || 0) * sharePrice(c.tier, chain.tiles.length)
  }, player.cash)
}

function isNetWorthLeader(state, player) {
  const mine = netWorth(state, player)
  return state.players.every((p) => p.id === player.id || netWorth(state, p) <= mine)
}
