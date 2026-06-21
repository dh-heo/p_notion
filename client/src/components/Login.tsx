import { useState } from 'react'
import type { FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { useStore } from '../store'

export function Login() {
  const needsSetup = useStore((s) => s.needsSetup)
  const login = useStore((s) => s.login)
  const setupPassword = useStore((s) => s.setupPassword)

  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (needsSetup) {
      if (pw.length < 4) {
        setErr('비밀번호는 4자 이상이어야 합니다.')
        return
      }
      if (pw !== pw2) {
        setErr('비밀번호가 일치하지 않습니다.')
        return
      }
    }
    setBusy(true)
    try {
      // 성공 시 authed=true가 되며 이 컴포넌트는 언마운트된다
      if (needsSetup) await setupPassword(pw)
      else await login(pw)
    } catch {
      setErr(needsSetup ? '설정에 실패했습니다.' : '비밀번호가 올바르지 않습니다.')
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-icon">
          <Lock size={22} />
        </div>
        <h1 className="login-title">
          {needsSetup ? '비밀번호 설정' : '로그인'}
        </h1>
        <p className="login-sub">
          {needsSetup
            ? '이 워크스페이스를 보호할 비밀번호를 정해 주세요.'
            : '비밀번호를 입력해 워크스페이스를 엽니다.'}
        </p>
        <input
          className="login-input"
          type="password"
          placeholder="비밀번호"
          value={pw}
          autoFocus
          onChange={(e) => setPw(e.target.value)}
        />
        {needsSetup && (
          <input
            className="login-input"
            type="password"
            placeholder="비밀번호 확인"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
        )}
        {err && <div className="login-error">{err}</div>}
        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? '처리 중…' : needsSetup ? '설정하고 시작' : '로그인'}
        </button>
      </form>
    </div>
  )
}
