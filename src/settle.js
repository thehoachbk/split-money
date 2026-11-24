// Tiền tính bằng số nguyên (VND). Số dư dương = được nợ, âm = đang nợ.

export function getExpenseShares(members, expense) {
  const ids = members.map((member) => member.id)
  const idSet = new Set(ids)
  const amount = Math.round(Number(expense.amount))
  const shares = Object.fromEntries(ids.map((id) => [id, 0]))
  if (!(amount > 0) || !idSet.has(expense.paid_by)) return shares

  let parts = (expense.participants || []).filter((id) => idSet.has(id))
  if (parts.length === 0) parts = ids
  parts = [...parts].sort()

  const base = Math.floor(amount / parts.length)
  let rem = amount - base * parts.length
  for (const id of parts) {
    shares[id] += base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
  }
  return shares
}

export function computeBalances(members, expenses, payments = []) {
  const ids = members.map((m) => m.id)
  const idSet = new Set(ids)
  const bal = Object.fromEntries(ids.map((id) => [id, 0]))

  for (const e of expenses) {
    const amount = Math.round(Number(e.amount))
    if (!(amount > 0) || !idSet.has(e.paid_by)) continue
    const shares = getExpenseShares(members, e)
    bal[e.paid_by] += amount
    for (const id of ids) bal[id] -= shares[id]
  }

  for (const p of payments) {
    const amount = Math.round(Number(p.amount))
    if (!(amount > 0) || !idSet.has(p.from_member) || !idSet.has(p.to_member)) continue
    bal[p.from_member] += amount
    bal[p.to_member] -= amount
  }

  return bal
}

// Ghép người nợ với người được nợ để ra ít giao dịch nhất có thể (greedy)
export function settleDebts(bal) {
  const creditors = []
  const debtors = []
  for (const [id, v] of Object.entries(bal)) {
    if (v > 0) creditors.push({ id, v })
    else if (v < 0) debtors.push({ id, v: -v })
  }
  creditors.sort((a, b) => b.v - a.v)
  debtors.sort((a, b) => b.v - a.v)

  const out = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].v, creditors[j].v)
    out.push({ from: debtors[i].id, to: creditors[j].id, amount: x })
    debtors[i].v -= x
    creditors[j].v -= x
    if (debtors[i].v === 0) i++
    if (creditors[j].v === 0) j++
  }
  return out
}
