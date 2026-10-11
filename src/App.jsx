import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clientFor, isConfigured, supabase } from './supabase.js'
import { computeBalances, settleDebts } from './settle.js'
import { forgetRecent, formatTime, formatVND, getRecent, parseAmount, saveRecent } from './util.js'

function hasSystemAdminAccess(user) {
  return user.email?.toLowerCase() === 'thehoach92@gmail.com' && user.app_metadata?.provider === 'google'
}

function useRoute() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const on = () => setHash(window.location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const m = hash.match(/^#\/g\/([0-9a-f-]{36})/i)
  return m ? { name: 'group', id: m[1].toLowerCase() } : { name: 'home' }
}

export default function App() {
  const route = useRoute()
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setAuthReady(true)
    }).catch((error) => {
      if (!alive) return
      setAuthError(error.message)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
      setAuthError('')
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  if (!isConfigured) {
    return (
      <Shell>
        <div className="card warn">
          <h2>Chưa cấu hình Supabase</h2>
          <p>
            Tạo file <code>.env</code> từ <code>.env.example</code> và điền{' '}
            <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>, rồi chạy lại. Xem README để biết chi
            tiết.
          </p>
        </div>
      </Shell>
    )
  }

  if (!authReady) return <Shell><p className="muted center">Đang kiểm tra đăng nhập…</p></Shell>
  if (!session) {
    return (
      <Shell>
        <Login error={authError} onError={setAuthError} />
      </Shell>
    )
  }

  async function signOut() {
    setSigningOut(true)
    setAuthError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) setAuthError(error.message)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <Shell user={session.user} onSignOut={signOut} signingOut={signingOut} authError={authError}>
      {route.name === 'group'
        ? <Group key={route.id} id={route.id} user={session.user} />
        : <Home user={session.user} />}
    </Shell>
  )
}

function Login({ error, onError }) {
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    onError('')
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (signInError) {
        onError(signInError.message)
      }
    } catch (signInError) {
      onError(signInError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card center">
      <h1>Đăng nhập để tiếp tục</h1>
      <p className="muted">Dùng tài khoản Google để tạo nhóm và quản lý chi tiêu.</p>
      <button onClick={signIn} disabled={busy}>{busy ? 'Đang chuyển tới Google…' : 'Tiếp tục với Google'}</button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function Shell({ children, user, onSignOut, signingOut, authError }) {
  return (
    <div className="app">
      <header className="top">
        <div className="row spread">
          <a href="#/" className="brand">💸 Chia tiền</a>
          {user && (
            <div className="row gap">
              <span className="muted small-text">{user.user_metadata?.full_name || user.email}</span>
              <button className="ghost small" onClick={onSignOut} disabled={signingOut}>
                {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
              </button>
            </div>
          )}
        </div>
      </header>
      {user && authError && <p className="error" role="alert">{authError}</p>}
      <main>{children}</main>
    </div>
  )
}

function Home({ user }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState(getRecent())

  async function create(e) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    setBusy(true)
    setError('')
    const id = crypto.randomUUID()
    const { error: err } = await clientFor(id).from('groups').insert({
      id,
      name: n,
      description: description.trim() || null,
      created_by: user.id,
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    saveRecent({ id, name: n })
    window.location.hash = `#/g/${id}`
  }

  return (
    <>
      <form className="card" onSubmit={create}>
        <h2>Tạo nhóm mới</h2>
        <p className="muted">Ví dụ: “Đi Đà Lạt”, “Tiền nhà tháng 10”. Sau khi tạo, gửi link cho mọi người là dùng được ngay.</p>
        <div className="row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên nhóm"
            maxLength={80}
            autoFocus
          />
          <button disabled={busy || !name.trim()}>{busy ? 'Đang tạo…' : 'Tạo nhóm'}</button>
        </div>
        <label className="description-label">
          Mô tả nhóm (không bắt buộc)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ví dụ: Chuyến đi Đà Lạt 3 ngày, cùng ghi chi phí ăn uống và đi lại."
            maxLength={500}
            rows={3}
          />
        </label>
        {error && <p className="error">{error}</p>}
      </form>

      {recent.length > 0 && (
        <div className="card">
          <h2>Nhóm gần đây</h2>
          <ul className="list">
            {recent.map((g) => (
              <li key={g.id}>
                <a href={`#/g/${g.id}`}>{g.name}</a>
                <button
                  className="ghost small"
                  onClick={() => {
                    forgetRecent(g.id)
                    setRecent(getRecent())
                  }}
                  title="Xoá khỏi danh sách này (không xoá nhóm)"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasSystemAdminAccess(user) && <AdminGroups />}
    </>
  )
}

function AdminGroups() {
  const [groups, setGroups] = useState([])
  const [error, setError] = useState('')
  const [limit, setLimit] = useState(100)

  useEffect(() => {
    async function load() {
      const { data, error: loadError } = await clientFor(null)
        .from('groups')
        .select('id,name,created_by,created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (loadError) setError(loadError.message)
      else setGroups(data)
    }
    load()
  }, [limit])

  return (
    <section className="card">
      <h2>Quản trị hệ thống · Tất cả nhóm</h2>
      {error && <p className="error">{error}</p>}
      {groups.length === 0 && !error ? <p className="muted">Chưa có nhóm nào.</p> : (
        <ul className="list">
          {groups.map((group) => (
            <li key={group.id}>
              <a href={`#/g/${group.id}`}>{group.name}</a>
              <span className="muted small-text">{formatTime(group.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      {groups.length === limit && <button className="secondary small" onClick={() => setLimit((value) => value + 100)}>Tải thêm nhóm</button>}
    </section>
  )
}

function Group({ id, user }) {
  const db = useMemo(() => clientFor(id), [id])
  const [activeTab, setActiveTab] = useState('overview')
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [groupParticipants, setGroupParticipants] = useState([])
  const [expenses, setExpenses] = useState([])
  const [payments, setPayments] = useState([])
  const [auditLog, setAuditLog] = useState([])
  const [auditLimit, setAuditLimit] = useState(100)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)

  const load = useCallback(async () => {
    const [g, m, r, e, p, a] = await Promise.all([
      db.from('groups').select('id,name,description,created_by').eq('id', id).maybeSingle(),
      db.from('members').select('id,name,account_id').eq('group_id', id).order('created_at'),
      db.from('group_participants').select('id,user_id,display_name,email,joined_at').eq('group_id', id).order('joined_at'),
      db.from('expenses').select('*').eq('group_id', id).order('created_at', { ascending: false }),
      db.from('payments').select('*').eq('group_id', id).order('created_at', { ascending: false }),
      db.from('group_audit_log').select('*').eq('group_id', id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(auditLimit),
    ])
    const err = g.error || m.error || r.error || e.error || p.error || a.error
    if (err) {
      setError(err.message)
    } else if (!g.data) {
      setNotFound(true)
      setAuditLog(a.data)
    } else {
      setNotFound(false)
      let groupData = g.data
      if (!groupData.created_by) {
        const { error: claimError } = await db.rpc('claim_group_ownership', { p_group_id: id })
        if (claimError) {
          setError(claimError.message)
        } else {
          const { data: updatedGroup, error: reloadError } = await db
            .from('groups')
            .select('id,name,description,created_by')
            .eq('id', id)
            .maybeSingle()
          if (reloadError) setError(reloadError.message)
          else if (updatedGroup) groupData = updatedGroup
        }
      }
      if (groupData.created_by) setError('')
      setGroup(groupData)
      setDescriptionDraft(groupData.description || '')
      setMembers(m.data)
      setGroupParticipants(r.data)
      setExpenses(e.data)
      setPayments(p.data)
      setAuditLog(a.data)
      saveRecent(groupData)
    }
    setLoading(false)
  }, [auditLimit, db, id])

  useEffect(() => {
    load()
    // Làm mới định kỳ để thấy thay đổi của người khác
    const t = setInterval(() => {
      if (!document.hidden) load()
    }, 15000)
    return () => clearInterval(t)
  }, [load])

  async function run(promise) {
    const { error: err } = await promise
    if (err) {
      setError(err.message)
      return false
    }
    await load()
    return true
  }

  const nameOf = useCallback((mid) => members.find((m) => m.id === mid)?.name ?? '(đã xoá)', [members])

  const balances = useMemo(() => computeBalances(members, expenses, payments), [members, expenses, payments])
  const transfers = useMemo(() => settleDebts(balances), [balances])
  const total = useMemo(() => expenses.reduce((s, e) => s + Number(e.amount), 0), [expenses])
  const isSystemAdmin = hasSystemAdminAccess(user)
  const canDeleteGroup = group?.created_by === user.id || isSystemAdmin
  const canManageParticipants = group?.created_by === user.id || isSystemAdmin

  if (loading) return <p className="muted center">Đang tải…</p>
  if (error && !group)
    return (
      <div className="card warn">
        <h2>Không tải được nhóm</h2>
        <p className="error">{error}</p>
        <button className="secondary" onClick={load}>Thử lại</button>
      </div>
    )
  if (notFound)
    return (
      <>
        <div className="card warn">
          <h2>Nhóm đã bị xoá hoặc không tồn tại</h2>
          <p>Nếu nhóm đã bị xoá, nhật ký thay đổi vẫn được giữ lại bên dưới.</p>
          <a href="#/">Về trang chủ</a>
        </div>
        <AuditHistory entries={auditLog} nameOf={nameOf} groupParticipants={groupParticipants} onLoadMore={() => setAuditLimit((limit) => limit + 100)} canLoadMore={auditLog.length === auditLimit} />
      </>
    )

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  async function deleteGroup() {
    if (!window.confirm(`Xoá nhóm “${group.name}” cùng toàn bộ dữ liệu? Không thể hoàn tác.`)) return
    const { error: err } = await db.rpc('delete_group', { p_group_id: id })
    if (err) {
      setError(err.message)
      return
    }

    forgetRecent(id)
    window.location.hash = '#/'
  }

  return (
    <>
      <div className="card">
        <div className="row spread">
          <div>
            <h1>{group.name}</h1>
            <p className="muted">
              {members.length} người · {expenses.length} khoản chi · tổng {formatVND(total)}
            </p>
          </div>
          {group.description && <p className="group-description">{group.description}</p>}
          <button className="secondary" onClick={copyLink}>
            {copied ? 'Đã copy ✓' : 'Copy link nhóm'}
          </button>
        </div>
        <p className="muted small-text">Người đăng nhập Google có link này đều xem và chỉnh sửa được nhóm. Chỉ người tạo nhóm và system admin mới xoá được nhóm.</p>
        {error && (
          <p className="error">
            {error} <button className="ghost small" onClick={() => setError('')}>Ẩn</button>
          </p>
        )}
      </div>

      <nav className="group-tabs" role="tablist" aria-label="Các mục trong nhóm">
        {[
          ['overview', 'Tổng quan'],
          ['members', 'Thành viên'],
          ['history', 'Lịch sử'],
          ['chat', 'Chat'],
        ].map(([tab, label]) => (
          <button
            key={tab}
            id={`group-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`group-panel-${tab}`}
            className={`group-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'members' && (
        <section id="group-panel-members" role="tabpanel" aria-labelledby="group-tab-members">
          {canManageParticipants && (
            <form
              className="card"
              onSubmit={async (event) => {
                event.preventDefault()
                setSavingDescription(true)
                const saved = await run(db.rpc('update_group_description', {
                  p_group_id: id,
                  p_description: descriptionDraft.trim() || null,
                }))
                setSavingDescription(false)
                if (saved) setGroup((current) => ({ ...current, description: descriptionDraft.trim() || null }))
              }}
            >
              <h2>Mô tả nhóm</h2>
              <p className="muted small-text">Người mở link có thể đọc mô tả trước khi tham gia.</p>
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Giới thiệu mục đích hoặc thông tin cần biết về nhóm…"
                aria-label="Mô tả nhóm"
              />
              <div className="row spread">
                <span className="muted small-text">{descriptionDraft.length}/500</span>
                <button disabled={savingDescription}>
                  {savingDescription ? 'Đang lưu…' : 'Lưu mô tả'}
                </button>
              </div>
            </form>
          )}
          <GroupParticipation
            user={user}
            participants={groupParticipants}
            members={members}
            canManage={canManageParticipants}
            onJoin={async () => run(db.rpc('join_group', { p_group_id: id }))}
            onRename={async (name) => run(db.rpc('set_group_member_nickname', { p_group_id: id, p_name: name }))}
            onMerge={async (tempMemberId, userId) => run(db.rpc('merge_group_temp_member', {
              p_group_id: id,
              p_temp_member_id: tempMemberId,
              p_user_id: userId,
            }))}
          />
          <Members
            members={members}
            expenses={expenses}
            payments={payments}
            onAdd={(names) => run(db.from('members').insert(names.map((name) => ({ group_id: id, name }))))}
            onDelete={(mid) => run(db.from('members').delete().eq('id', mid))}
            onBlocked={(msg) => setError(msg)}
          />
        </section>
      )}

      {activeTab === 'overview' && (
        <section id="group-panel-overview" role="tabpanel" aria-labelledby="group-tab-overview">
      {members.length >= 2 && (
        <AddExpense
          members={members}
          onAdd={(row) => run(db.from('expenses').insert({ group_id: id, ...row }))}
          onError={setError}
        />
      )}

      {members.length >= 2 && (
        <div className="card">
          <h2>Ai trả ai</h2>
          {transfers.length === 0 ? (
            <p className="muted">{expenses.length === 0 ? 'Chưa có khoản chi nào.' : 'Đã cân bằng, không ai nợ ai 🎉'}</p>
          ) : (
            <ul className="list">
              {transfers.map((t) => (
                <li key={`${t.from}-${t.to}`}>
                  <span>
                    <b>{nameOf(t.from)}</b> → <b>{nameOf(t.to)}</b>
                  </span>
                  <span className="row gap">
                    <b className="money">{formatVND(t.amount)}</b>
                    <button
                      className="small"
                      onClick={() => {
                        if (window.confirm(`Ghi nhận ${nameOf(t.from)} đã chuyển ${formatVND(t.amount)} cho ${nameOf(t.to)}?`))
                          run(
                            db.from('payments').insert({
                              group_id: id,
                              from_member: t.from,
                              to_member: t.to,
                              amount: t.amount,
                            }),
                          )
                      }}
                    >
                      Đã trả
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3>Số dư từng người</h3>
          <ul className="list">
            {members.map((m) => {
              const v = balances[m.id] ?? 0
              return (
                <li key={m.id}>
                  <span>{m.name}</span>
                  <b className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>
                    {v > 0 ? '+' : ''}
                    {formatVND(v)}
                  </b>
                </li>
              )
            })}
          </ul>
          <p className="muted small-text">Số dương: được nhận lại. Số âm: còn nợ.</p>
        </div>
      )}

      <div className="card">
        <h2>Các khoản chi</h2>
        {expenses.length === 0 ? (
          <p className="muted">Chưa có khoản chi nào.</p>
        ) : (
          <ul className="list">
            {expenses.map((e) => {
                return <ExpenseRow key={e.id} expense={e} members={members} nameOf={nameOf} onSave={(values) => run(db.from('expenses').update(values).eq('id', e.id))} onDelete={() => run(db.from('expenses').delete().eq('id', e.id))} />
            })}
          </ul>
        )}
      </div>

      {payments.length > 0 && (
        <div className="card">
          <h2>Đã thanh toán</h2>
          <ul className="list">
            {payments.map((p) => (
              <PaymentRow key={p.id} payment={p} members={members} nameOf={nameOf} onSave={(values) => run(db.from('payments').update(values).eq('id', p.id))} onDelete={() => run(db.from('payments').delete().eq('id', p.id))} />
            ))}
          </ul>
        </div>
      )}
        </section>
      )}

      {activeTab === 'history' && (
        <section id="group-panel-history" role="tabpanel" aria-labelledby="group-tab-history">
          <AuditHistory entries={auditLog} nameOf={nameOf} groupParticipants={groupParticipants} onLoadMore={() => setAuditLimit((limit) => limit + 100)} canLoadMore={auditLog.length === auditLimit} />
        </section>
      )}

      {activeTab === 'chat' && (
        <section id="group-panel-chat" role="tabpanel" aria-labelledby="group-tab-chat">
          {groupParticipants.some((participant) => participant.user_id === user.id)
            ? <GroupChat db={db} groupId={id} user={user} />
            : <div className="card"><h2>Tham gia để chat</h2><p className="muted">Hãy tham gia nhóm trong tab Thành viên để đọc và gửi tin nhắn.</p></div>}
        </section>
      )}

      {canDeleteGroup && (
        <p className="center">
          <button className="ghost danger" onClick={deleteGroup}>
            Xoá nhóm này
          </button>
        </p>
      )}
    </>
  )
}

const auditEntityNames = {
  groups: 'nhóm',
  members: 'thành viên',
  group_participants: 'người tham gia',
  expenses: 'khoản chi',
  payments: 'thanh toán',
}

function GroupChat({ db, groupId, user }) {
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  const loadMessages = useCallback(async (isActive = () => true) => {
    const { data, error: loadError } = await db
      .from('group_chat_messages')
      .select('id,user_id,sender_name,message,created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200)
    if (!isActive()) return
    if (loadError) setError(loadError.message)
    else {
      setError('')
      setMessages(data.reverse())
    }
    setLoading(false)
  }, [db, groupId])

  useEffect(() => {
    let active = true
    const isActive = () => active
    const refresh = () => loadMessages(isActive)
    refresh()
    const channel = supabase
      .channel(`group-chat-${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'group_chat_messages',
        filter: `group_id=eq.${groupId}`,
      }, refresh)
      .subscribe()
    const fallback = setInterval(() => {
      if (!document.hidden) refresh()
    }, 15000)
    return () => {
      active = false
      clearInterval(fallback)
      supabase.removeChannel(channel)
    }
  }, [groupId, loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  async function send(event) {
    event.preventDefault()
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    setError('')
    const { error: sendError } = await db.from('group_chat_messages').insert({
      group_id: groupId,
      user_id: user.id,
      message: text,
    })
    if (sendError) setError(sendError.message)
    else {
      setMessage('')
      await loadMessages()
    }
    setSending(false)
  }

  return (
    <div className="card group-chat">
      <div className="row spread">
        <div>
          <h2>Chat nhóm</h2>
          <p className="muted small-text">Tin nhắn được lưu trong nhóm; tối đa 200 tin gần nhất được hiển thị.</p>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <ol className="chat-messages" aria-live="polite" aria-busy={loading}>
        {loading ? <li className="muted">Đang tải tin nhắn…</li>
          : messages.length === 0 ? <li className="muted">Chưa có tin nhắn. Bắt đầu trò chuyện nhé.</li>
            : messages.map((entry) => (
              <li key={entry.id} className={`chat-message ${entry.user_id === user.id ? 'own' : ''}`}>
                <div className="chat-message-heading">
                  <b>{entry.sender_name}</b>
                  <time className="muted small-text" dateTime={entry.created_at}>{formatTime(entry.created_at)}</time>
                </div>
                <p>{entry.message}</p>
              </li>
            ))}
        <li className="chat-bottom" ref={bottomRef} aria-hidden="true" />
      </ol>
      <form className="chat-compose" onSubmit={send}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Nhập tin nhắn…"
          maxLength={1000}
          rows={3}
          aria-label="Tin nhắn"
        />
        <div className="row spread">
          <span className="muted small-text">{message.length}/1000</span>
          <button disabled={sending || !message.trim()}>{sending ? 'Đang gửi…' : 'Gửi'}</button>
        </div>
      </form>
    </div>
  )
}

const auditFieldNames = {
  name: 'Tên',
  description: 'Nội dung',
  amount: 'Số tiền',
  paid_by: 'Người trả',
  participants: 'Người tham gia',
  account_id: 'Tài khoản được gán',
  display_name: 'Tên tài khoản',
  email: 'Email',
  joined_at: 'Thời điểm tham gia',
  from_member: 'Người chuyển',
  to_member: 'Người nhận',
}

function auditValue(field, value, nameOf, groupParticipants = []) {
  if (value === null || value === undefined) return '—'
  if (field === 'amount') return formatVND(Number(value))
  if (field === 'participants') return value.map(nameOf).join(', ') || 'Không có'
  if (['paid_by', 'from_member', 'to_member'].includes(field)) {
    const name = nameOf(value)
    return name === '(đã xoá)' ? `${value.slice(0, 8)}…` : name
  }
  if (field === 'account_id') {
    const participant = groupParticipants.find((entry) => entry.user_id === value)
    return participant?.display_name || participant?.email || `Tài khoản ${value.slice(0, 8)}…`
  }
  if (field === 'user_id') {
    const participant = groupParticipants.find((entry) => entry.user_id === value)
    return participant?.display_name || participant?.email || `Tài khoản ${value.slice(0, 8)}…`
  }
  return String(value)
}

function AuditHistory({ entries, nameOf, onLoadMore, canLoadMore, groupParticipants = [] }) {
  if (entries.length === 0) return null

  return (
    <section className="card">
      <h2>Lịch sử thay đổi</h2>
      <ul className="list audit-list">
        {entries.map((entry) => {
          const entity = auditEntityNames[entry.table_name] || entry.table_name
          const snapshot = entry.operation === 'DELETE' ? entry.old_data : entry.new_data
          const fields = entry.operation === 'UPDATE'
            ? Object.keys(entry.new_data || {}).filter(
                (key) => !['id', 'group_id', 'created_at', 'created_by', 'user_id'].includes(key)
                  && JSON.stringify(entry.old_data?.[key]) !== JSON.stringify(entry.new_data?.[key]),
              )
            : Object.keys(snapshot || {}).filter(
                (key) => !['id', 'group_id', 'created_at', 'created_by', 'user_id'].includes(key),
              )
          const verb = entry.operation === 'INSERT' ? 'Thêm' : entry.operation === 'UPDATE' ? 'Sửa' : 'Xoá'

          return (
            <li key={entry.id} className="audit-entry">
              <div className="audit-heading">
                <b>{entry.actor_name || entry.actor_email || 'Người dùng'} {verb} {entity}</b>
                <time className="muted small-text" dateTime={entry.created_at}>{formatTime(entry.created_at)}</time>
              </div>
              {fields.length > 0 && (
                <ul className="audit-changes">
                  {fields.map((field) => (
                    <li key={field}>
                      <span className="muted">{auditFieldNames[field] || field}:</span>{' '}
                      {entry.operation === 'UPDATE' && (
                        <><del>{auditValue(field, entry.old_data?.[field], nameOf, groupParticipants)}</del> → </>
                      )}
                      {auditValue(field, snapshot?.[field], nameOf, groupParticipants)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {canLoadMore && <button className="secondary small" onClick={onLoadMore}>Tải thay đổi cũ hơn</button>}
    </section>
  )
}

function GroupParticipation({ user, participants, members, canManage, onJoin, onRename, onMerge }) {
  const [busy, setBusy] = useState(false)
  const [savingKey, setSavingKey] = useState('')
  const [nickname, setNickname] = useState('')
  const [selectedTemps, setSelectedTemps] = useState({})
  const joined = participants.some((participant) => participant.user_id === user.id)
  const myMember = members.find((member) => member.account_id === user.id)

  useEffect(() => {
    setNickname(myMember?.name || '')
  }, [myMember?.id, myMember?.name])

  async function join() {
    setBusy(true)
    await onJoin()
    setBusy(false)
  }

  async function saveNickname(event) {
    event.preventDefault()
    setSavingKey('nickname')
    const saved = await onRename(nickname)
    setSavingKey('')
    if (saved) setNickname(nickname.trim())
  }

  async function mergeTemp(participant, tempMember) {
    if (!window.confirm(`Gộp “${tempMember.name}” vào tài khoản ${participant.display_name || participant.email || 'này'}? Các khoản chi và thanh toán sẽ được chuyển sang tên “${tempMember.name}”, sau đó nickname tạm bị xoá.`)) return
    setSavingKey(participant.user_id)
    await onMerge(tempMember.id, participant.user_id)
    setSavingKey('')
  }

  if (!joined || !myMember) {
    return (
      <section className="card">
        <h2>Tham gia nhóm</h2>
        <p className="muted">Tham gia để tạo thành viên chính trong nhóm bằng tên Google của bạn. Sau đó bạn có thể tự đổi nickname riêng trong nhóm.</p>
        <button onClick={join} disabled={busy}>{busy ? 'Đang tham gia…' : 'Tham gia nhóm'}</button>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Nickname trong nhóm</h2>
      <form className="row" onSubmit={saveNickname}>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="Nickname của bạn trong nhóm"
          maxLength={40}
          required
        />
        <button disabled={savingKey === 'nickname' || !nickname.trim() || nickname.trim() === myMember.name}>
          {savingKey === 'nickname' ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>
      <p className="muted small-text">Nickname chỉ hiển thị trong nhóm này. Bạn có thể tự thay đổi bất cứ lúc nào.</p>
      {canManage && (
        <>
          <h3>Gộp nickname tạm</h3>
          <p className="muted small-text">Chọn nickname tạm để chuyển toàn bộ khoản chi và thanh toán vào tài khoản chính. Nickname tạm sẽ bị xoá.</p>
        </>
      )}
      {canManage && participants.length > 0 && (
        <ul className="list">
          {participants.map((participant) => {
            const linkedMember = members.find((member) => member.account_id === participant.user_id)
            const label = participant.display_name || participant.email || 'Tài khoản Google'
            const tempMembers = members.filter((member) => member.account_id === null)

            return (
              <li key={participant.id}>
                <span>
                  <b>{label}</b>{linkedMember && ` · ${linkedMember.name}`}
                  {participant.email && participant.display_name && (
                    <><br /><span className="muted small-text">{participant.email}</span></>
                  )}
                </span>
                {linkedMember && tempMembers.length > 0 && (
                  <span className="row gap">
                    <select
                      className="participant-member-select"
                      aria-label={`Nickname tạm cần gộp vào ${label}`}
                      value={selectedTemps[participant.user_id] || ''}
                      disabled={savingKey !== ''}
                      onChange={(event) => setSelectedTemps((current) => ({
                        ...current,
                        [participant.user_id]: event.target.value,
                      }))}
                    >
                      <option value="">Chọn nickname tạm</option>
                      {tempMembers.map((member) => (
                        <option key={member.id} value={member.id}>{member.name}</option>
                      ))}
                    </select>
                    <button
                      className="secondary small"
                      disabled={!selectedTemps[participant.user_id] || savingKey !== ''}
                      onClick={() => {
                        const selected = tempMembers.find((member) => member.id === selectedTemps[participant.user_id])
                        if (selected) mergeTemp(participant, selected)
                      }}
                    >
                      {savingKey === participant.user_id ? 'Đang gộp…' : 'Gộp'}
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ExpenseRow({ expense, members, nameOf, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [description, setDescription] = useState(expense.description)
  const [amount, setAmount] = useState(String(expense.amount))
  const [paidBy, setPaidBy] = useState(expense.paid_by)
  const [participants, setParticipants] = useState(
    new Set(expense.participants?.length ? expense.participants : members.map((member) => member.id)),
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (editing) return
    setDescription(expense.description)
    setAmount(String(expense.amount))
    setPaidBy(expense.paid_by)
    setParticipants(new Set(expense.participants?.length ? expense.participants : members.map((member) => member.id)))
  }, [editing, expense, members])

  async function save(event) {
    event.preventDefault()
    const parsed = parseAmount(amount)
    if (!description.trim() || !(parsed > 0) || participants.size === 0) return
    setBusy(true)
    const success = await onSave({
      description: description.trim(),
      amount: parsed,
      paid_by: paidBy,
      participants: [...participants],
    })
    setBusy(false)
    if (success) setEditing(false)
  }

  if (editing) {
    return (
      <li>
        <form className="edit-form" onSubmit={save}>
          <label>Nội dung<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} /></label>
          <label>Số tiền<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
          <label>Ai trả
            <select value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <fieldset>
            <legend>Chia cho</legend>
            <div className="chips">
              {members.map((member) => (
                <label className={`chip check ${participants.has(member.id) ? 'on' : ''}`} key={member.id}>
                  <input
                    type="checkbox"
                    checked={participants.has(member.id)}
                    onChange={() => setParticipants((current) => {
                      const next = new Set(current)
                      if (next.has(member.id)) next.delete(member.id)
                      else next.add(member.id)
                      return next
                    })}
                  />
                  {member.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <button disabled={busy || !description.trim() || !(parseAmount(amount) > 0) || participants.size === 0}>
              {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Huỷ</button>
          </div>
        </form>
      </li>
    )
  }

  const selected = (expense.participants || []).filter((id) => members.some((member) => member.id === id))
  const sharesWithEveryone = selected.length === 0 || selected.length === members.length

  return (
    <li>
      <span>
        <b>{expense.description}</b><br />
        <span className="muted small-text">
          {nameOf(expense.paid_by)} trả · chia {sharesWithEveryone ? 'cho tất cả' : selected.map(nameOf).join(', ')} · {formatTime(expense.created_at)}
        </span>
      </span>
      <span className="row gap">
        <b className="money">{formatVND(expense.amount)}</b>
        <button className="ghost small" onClick={() => setEditing(true)}>Sửa</button>
        <button className="ghost small danger" title="Xoá khoản chi" onClick={() => window.confirm(`Xoá “${expense.description}”?`) && onDelete()}>✕</button>
      </span>
    </li>
  )
}

function PaymentRow({ payment, members, nameOf, onSave, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [fromMember, setFromMember] = useState(payment.from_member)
  const [toMember, setToMember] = useState(payment.to_member)
  const [amount, setAmount] = useState(String(payment.amount))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (editing) return
    setFromMember(payment.from_member)
    setToMember(payment.to_member)
    setAmount(String(payment.amount))
  }, [editing, payment])

  async function save(event) {
    event.preventDefault()
    const parsed = parseAmount(amount)
    if (!(parsed > 0) || fromMember === toMember) return
    setBusy(true)
    const success = await onSave({ from_member: fromMember, to_member: toMember, amount: parsed })
    setBusy(false)
    if (success) setEditing(false)
  }

  if (editing) {
    return (
      <li>
        <form className="edit-form" onSubmit={save}>
          <div className="grid2">
            <label>Người chuyển
              <select value={fromMember} onChange={(event) => setFromMember(event.target.value)}>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
            <label>Người nhận
              <select value={toMember} onChange={(event) => setToMember(event.target.value)}>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </select>
            </label>
          </div>
          <label>Số tiền<input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" /></label>
          <div className="row">
            <button disabled={busy || !(parseAmount(amount) > 0) || fromMember === toMember}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Huỷ</button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li>
      <span>
        {nameOf(payment.from_member)} → {nameOf(payment.to_member)}<br />
        <span className="muted small-text">{formatTime(payment.created_at)}</span>
      </span>
      <span className="row gap">
        <b className="money">{formatVND(payment.amount)}</b>
        <button className="ghost small" onClick={() => setEditing(true)}>Sửa</button>
        <button className="ghost small danger" title="Huỷ ghi nhận" onClick={() => window.confirm('Huỷ ghi nhận thanh toán này?') && onDelete()}>✕</button>
      </span>
    </li>
  )
}

function Members({ members, expenses, payments, onAdd, onDelete, onBlocked }) {
  const [text, setText] = useState('')

  async function submit(e) {
    e.preventDefault()
    const names = text
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (names.length === 0) return
    if (await onAdd(names)) setText('')
  }

  function remove(m) {
    const used =
      expenses.some((x) => x.paid_by === m.id || (x.participants || []).includes(m.id)) ||
      payments.some((p) => p.from_member === m.id || p.to_member === m.id)
    if (used) {
      onBlocked(`${m.name} đã có trong các khoản chi hoặc thanh toán nên không xoá được. Hãy xoá các khoản đó trước.`)
      return
    }
    if (window.confirm(`Xoá ${m.name} khỏi nhóm?`)) onDelete(m.id)
  }

  return (
    <div className="card">
      <h2>Thành viên</h2>
      {members.length > 0 && (
        <div className="chips">
          {members.map((m) => (
            <span className="chip" key={m.id}>
              {m.name}
              {m.account_id
                ? <span className="muted small-text" title="Tài khoản đã tham gia">· tài khoản</span>
                : <button className="ghost small" onClick={() => remove(m)} title="Xoá">✕</button>}
            </span>
          ))}
        </div>
      )}
      <form className="row" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={members.length ? 'Thêm người (có thể nhập nhiều tên, cách nhau bằng dấu phẩy)' : 'Nhập tên các thành viên, cách nhau bằng dấu phẩy'}
          maxLength={200}
        />
        <button disabled={!text.trim()}>Thêm</button>
      </form>
      {members.length < 2 && <p className="muted small-text">Cần ít nhất 2 người để bắt đầu thêm khoản chi.</p>}
    </div>
  )
}

function AddExpense({ members, onAdd, onError }) {
  const [desc, setDesc] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [sel, setSel] = useState(null) // null = tất cả mọi người
  const [busy, setBusy] = useState(false)

  const effective = useMemo(() => new Set(sel ?? members.map((m) => m.id)), [sel, members])
  const payer = members.some((m) => m.id === paidBy) ? paidBy : members[0]?.id
  const parsed = parseAmount(amount)

  function toggle(mid) {
    const next = new Set(effective)
    next.has(mid) ? next.delete(mid) : next.add(mid)
    setSel(next)
  }

  async function submit(e) {
    e.preventDefault()
    if (!(parsed > 0)) return onError('Số tiền không hợp lệ. Ví dụ: 150000, 150.000, 150k, 1.5tr')
    if (effective.size === 0) return onError('Hãy chọn ít nhất một người để chia.')
    setBusy(true)
    const ok = await onAdd({
      description: desc.trim(),
      amount: parsed,
      paid_by: payer,
      participants: [...effective],
    })
    setBusy(false)
    if (ok) {
      setDesc('')
      setAmount('')
      setSel(null)
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Thêm khoản chi</h2>
      <label>
        Nội dung
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ăn tối, xăng xe, tiền phòng…" maxLength={120} />
      </label>
      <div className="grid2">
        <label>
          Số tiền
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="150000 hoặc 150k"
            inputMode="decimal"
          />
          {amount && <span className="muted small-text">{parsed > 0 ? formatVND(parsed) : 'Không hợp lệ'}</span>}
        </label>
        <label>
          Ai trả
          <select value={payer} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset>
        <legend>
          Chia cho ({effective.size}/{members.length})
          <button type="button" className="ghost small" onClick={() => setSel(null)}>
            Chọn tất cả
          </button>
        </legend>
        <div className="chips">
          {members.map((m) => (
            <label key={m.id} className={`chip check ${effective.has(m.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={effective.has(m.id)} onChange={() => toggle(m.id)} />
              {m.name}
            </label>
          ))}
        </div>
      </fieldset>
      <button disabled={busy || !desc.trim() || !amount.trim()}>{busy ? 'Đang lưu…' : 'Thêm khoản chi'}</button>
    </form>
  )
}
