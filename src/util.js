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

export function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
