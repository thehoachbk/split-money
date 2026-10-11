const nf = new Intl.NumberFormat('vi-VN')

export function formatVND(n) {
  return `${nf.format(Math.round(n))} ₫`
}

// Nhận "50000", "50.000", "50k", "1.5tr", "2tr" -> số nguyên VND. Không hợp lệ -> NaN
export function parseAmount(input) {
  const s = String(input).trim().toLowerCase().replace(/\s/g, '')
  const m = s.match(/^([\d.,]+)(k|tr|m)?$/)
  if (!m) return NaN
  if (m[2]) {
    const mult = m[2] === 'k' ? 1e3 : 1e6
    const num = parseFloat(m[1].replace(',', '.'))
    return Number.isFinite(num) ? Math.round(num * mult) : NaN
  }
  return Number(m[1].replace(/[.,]/g, ''))
}

const KEY = 'chia-tien:recent'

export function getRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveRecent(group) {
  try {
    const list = getRecent().filter((g) => g.id !== group.id)
    list.unshift({ id: group.id, name: group.name })
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)))
  } catch {
    /* localStorage có thể bị chặn, bỏ qua */
  }
}

export function forgetRecent(id) {
  try {
    const list = getRecent().filter((g) => g.id !== id)
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* ignore */
  }
}

export function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
