import test from 'node:test'
import assert from 'node:assert/strict'
import { computeBalances, settleDebts } from './settle.js'

const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

test('chia đều: A trả 300k cho cả 3 người', () => {
  const bal = computeBalances(members, [
    { amount: 300000, paid_by: 'a', participants: ['a', 'b', 'c'] },
  ])
  assert.deepEqual(bal, { a: 200000, b: -100000, c: -100000 })
})

test('tổng số dư luôn bằng 0, kể cả khi chia không hết', () => {
  const bal = computeBalances(members, [
    { amount: 100000, paid_by: 'a', participants: ['a', 'b', 'c'] },
    { amount: 50001, paid_by: 'b', participants: ['a', 'b', 'c'] },
    { amount: 7, paid_by: 'c', participants: ['b', 'c'] },
  ])
  const sum = Object.values(bal).reduce((s, v) => s + v, 0)
  assert.equal(sum, 0)
})

test('chỉ chia cho người tham gia', () => {
  const bal = computeBalances(members, [
    { amount: 90000, paid_by: 'a', participants: ['b', 'c'] },
  ])
  assert.deepEqual(bal, { a: 90000, b: -45000, c: -45000 })
})

test('settleDebts xoá hết số dư', () => {
  const bal = computeBalances(members, [
    { amount: 300000, paid_by: 'a', participants: ['a', 'b', 'c'] },
    { amount: 60000, paid_by: 'b', participants: ['a', 'b', 'c'] },
  ])
  const transfers = settleDebts(bal)
  const after = { ...bal }
  for (const t of transfers) {
    after[t.from] += t.amount
    after[t.to] -= t.amount
  }
  assert.deepEqual(Object.values(after), [0, 0, 0])
  assert.ok(transfers.length <= 2)
})

test('ghi nhận đã trả sẽ cập nhật số dư', () => {
  const expenses = [{ amount: 200000, paid_by: 'a', participants: ['a', 'b'] }]
  const before = computeBalances(members.slice(0, 2), expenses)
  assert.deepEqual(before, { a: 100000, b: -100000 })
  const after = computeBalances(members.slice(0, 2), expenses, [
    { from_member: 'b', to_member: 'a', amount: 100000 },
  ])
  assert.deepEqual(after, { a: 0, b: 0 })
  assert.deepEqual(settleDebts(after), [])
})

test('bỏ qua thành viên đã bị xoá', () => {
  const bal = computeBalances(members, [
    { amount: 100000, paid_by: 'a', participants: ['a', 'zzz'] },
  ])
  assert.deepEqual(bal, { a: 0, b: 0, c: 0 })
})
