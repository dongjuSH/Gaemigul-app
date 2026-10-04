"use client"

import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { getCurrentUser, login as loginRequest, logout as logoutRequest, withdraw as withdrawRequest } from "@/lib/api/auth"
import type { CurrentUser, LoginPayload } from "@/lib/types/AuthType"

type AuthStatus = "loading" | "authenticated" | "unauthenticated"

interface AuthContextValue {
  user: CurrentUser | null
  status: AuthStatus
  /** 로그인 성공 시 user를 채운다. 실패하면 그대로 던지므로 폼에서 catch해서 에러 메시지를 보여줄 것 */
  login: (payload: LoginPayload) => Promise<CurrentUser>
  logout: () => Promise<void>
  /** 회원 탈퇴 - 계정·연관 데이터를 서버에서 지우고 로컬 상태도 로그아웃과 동일하게 비운다 */
  withdraw: () => Promise<void>
  /** 회원가입 성공 응답 등 서버가 이미 준 user 값으로 상태를 직접 반영할 때 (재조회 없이) */
  setUser: (user: CurrentUser) => void
  /** /auth/me를 다시 불러 상태를 최신화한다(등급 재검사 후 등) */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// must_change_password인 상태에서도 접근을 막지 않는 경로 (여기 없으면 강제로 이동시킨다)
const CHANGE_PASSWORD_PATH = "/change-password"
const MUST_CHANGE_PASSWORD_ALLOWED_PATHS = [CHANGE_PASSWORD_PATH, "/logout"]

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const pathname = usePathname()
  const router = useRouter()

  const refresh = useCallback(async () => {
    const current = await getCurrentUser()
    setUserState(current)
    setStatus(current ? "authenticated" : "unauthenticated")
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 임시 비밀번호로 로그인한 상태(3-5) - 비밀번호를 바꾸기 전까지 다른 페이지 접근을 막는다
  useEffect(() => {
    if (!user?.must_change_password) return
    if (MUST_CHANGE_PASSWORD_ALLOWED_PATHS.includes(pathname)) return
    router.replace(CHANGE_PASSWORD_PATH)
  }, [user, pathname, router])

  const login = useCallback(async (payload: LoginPayload) => {
    const current = await loginRequest(payload)
    setUserState(current)
    setStatus("authenticated")
    return current
  }, [])

  const logout = useCallback(async () => {
    await logoutRequest()
    setUserState(null)
    setStatus("unauthenticated")
  }, [])

  const withdraw = useCallback(async () => {
    await withdrawRequest()
    setUserState(null)
    setStatus("unauthenticated")
  }, [])

  const setUser = useCallback((current: CurrentUser) => {
    setUserState(current)
    setStatus("authenticated")
  }, [])

  const value = useMemo(
    () => ({ user, status, login, logout, withdraw, setUser, refresh }),
    [user, status, login, logout, withdraw, setUser, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
