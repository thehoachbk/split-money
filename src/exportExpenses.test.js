import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from '@e965/xlsx'
import { buildExpenseWorksheetRows, createExpenseWorkbook } from './exportExpenses.js'

test('xuất cột người trả, tổng tiền và phần của từng thành viên', () => {
  const rows = buildExpenseWorksheetRows(
    [{ id: 'b', name: 'Bình' }, { id: 'a', name: 'An' }],
    [
      { description: 'Ăn trưa', paid_by: 'a', amount: 101, participants: ['a', 'b'] },
      { description: 'Gửi xe', paid_by: 'b', amount: 50, participants: ['b'] },
    ],
  )

  assert.deepEqual(rows, [
    ['Khoản chi', 'Người trả', 'Số tiền', 'Bình', 'An'],
    ['Ăn trưa', 'An', 101, 50, 51],
    ['Gửi xe', 'Bình', 50, 50, 0],
  ])
})

test('workbook Excel giữ đúng tiêu đề, dữ liệu và ô tiền dạng số', async () => {
  const workbook = await createExpenseWorkbook(
    [{ id: 'a', name: 'An' }],
    [{ description: 'Ăn sáng', paid_by: 'a', amount: 12500, participants: ['a'] }],
  )
  assert.equal(workbook.Sheets['Chi tiêu'].D2.v, 12500)
  assert.equal(workbook.Sheets['Chi tiêu'].D2.t, 'n')
  assert.equal(workbook.Sheets['Chi tiêu'].D2.z, '#,##0')
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const result = XLSX.read(buffer, { type: 'buffer' })
  const worksheet = result.Sheets['Chi tiêu']

  assert.deepEqual(XLSX.utils.sheet_to_json(worksheet, { header: 1 }), [
    ['Khoản chi', 'Người trả', 'Số tiền', 'An'],
    ['Ăn sáng', 'An', 12500, 12500],
  ])
})
