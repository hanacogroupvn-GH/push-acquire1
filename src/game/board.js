import { ROWS, COLS, cellLabel } from '../components/board/constants.js'

export const ALL_TILE_IDS = COLS.flatMap((col) => ROWS.map((row) => cellLabel(col, row)))

const ROW_INDEX = Object.fromEntries(ROWS.map((r, i) => [r, i]))
const COL_INDEX = Object.fromEntries(COLS.map((c, i) => [c, i]))

export function parseTileId(id) {
  const [colStr, row] = id.split('-')
  return { col: Number(colStr), row, colIndex: COL_INDEX[Number(colStr)], rowIndex: ROW_INDEX[row] }
}

// Orthogonal neighbors only (Acquire chains never connect diagonally).
export function neighborsOf(id) {
  const { colIndex, rowIndex } = parseTileId(id)
  const result = []
  if (rowIndex > 0) result.push(cellLabel(COLS[colIndex], ROWS[rowIndex - 1]))
  if (rowIndex < ROWS.length - 1) result.push(cellLabel(COLS[colIndex], ROWS[rowIndex + 1]))
  if (colIndex > 0) result.push(cellLabel(COLS[colIndex - 1], ROWS[rowIndex]))
  if (colIndex < COLS.length - 1) result.push(cellLabel(COLS[colIndex + 1], ROWS[rowIndex]))
  return result
}

export function shuffledTileBag(random = Math.random) {
  const bag = [...ALL_TILE_IDS]
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}
