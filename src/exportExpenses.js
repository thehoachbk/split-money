import { getExpenseShares } from './settle.js'

export function buildExpenseWorksheetRows(members, expenses) {
  const memberById = new Map(members.map((member) => [member.id, member.name]))
  return [
    ['Khoản chi', 'Người trả', 'Số tiền', ...members.map((member) => member.name)],
    ...expenses.map((expense) => {
      const shares = getExpenseShares(members, expense)
      return [
        expense.description,
        memberById.get(expense.paid_by) || '(đã xoá)',
        Math.round(Number(expense.amount)),
        ...members.map((member) => shares[member.id]),
      ]
    }),
  ]
}

function filenamePart(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'nhom'
}

export async function createExpenseWorkbook(members, expenses) {
  const XLSX = await import('@e965/xlsx')
  const worksheet = XLSX.utils.aoa_to_sheet(buildExpenseWorksheetRows(members, expenses))
  worksheet['!cols'] = [
    { wch: 30 },
    { wch: 24 },
    { wch: 16 },
    ...members.map((member) => ({ wch: Math.max(14, Math.min(28, member.name.length + 2)) })),
  ]

  for (let row = 1; row <= expenses.length; row++) {
    for (let column = 2; column < 3 + members.length; column++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]
      if (cell) cell.z = '#,##0'
    }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Chi tiêu')
  return workbook
}

export async function downloadExpenseWorkbook(groupName, members, expenses) {
  const [XLSX, workbook] = await Promise.all([
    import('@e965/xlsx'),
    createExpenseWorkbook(members, expenses),
  ])
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
  XLSX.writeFile(workbook, `chi-tieu-${filenamePart(groupName)}-${date}.xlsx`)
}
