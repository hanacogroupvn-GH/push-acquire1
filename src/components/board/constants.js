// Standard Acquire board: 12 columns (1-12) x 9 rows (A-I) = 108 cells
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
export const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

export const CELL_SIZE = 1.6
export const CELL_GAP = 0.12
export const CELL_HEIGHT = 0.12

export const FRAME_MARGIN = 1.1
export const BASE_HEIGHT = 0.5

// How far beyond the wooden frame the player seat markers sit.
export const SEAT_MARGIN = 1.5

export const BOARD_WIDTH = COLS.length * (CELL_SIZE + CELL_GAP) - CELL_GAP
export const BOARD_DEPTH = ROWS.length * (CELL_SIZE + CELL_GAP) - CELL_GAP

export function cellLabel(col, row) {
  return `${col}-${row}`
}
