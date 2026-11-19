/** Pure geometry for dragging a row in a ranking list. Rows may have different heights. */

/** Where the dragged row would land: one slot past every other row whose middle it has crossed. */
export function rankTarget(d: { from: number; dy: number; tops: number[]; heights: number[] }): number {
  const centre = d.tops[d.from] + d.heights[d.from] / 2 + d.dy;
  return d.tops.reduce((n, top, j) => {
    const middle = top + d.heights[j] / 2;
    // Rows below count on touching their middle, so the last slot is reachable when the drag is held at the list's edge.
    const crossed = j > d.from ? middle <= centre : j < d.from && middle < centre;
    return crossed ? n + 1 : n;
  }, 0);
}

/** The slot row `j` shows while row `from` hovers over slot `to`. */
export function rankSlot(j: number, from: number, to: number): number {
  if (j === from) return to;
  if (from < j && j <= to) return j - 1;
  if (to <= j && j < from) return j + 1;
  return j;
}
