// 로그인 세션 쿠키가 필요한 요청(auth 도메인) 전용 axios 인스턴스.
// withCredentials가 있어야 브라우저가 백엔드 쿠키를 실어 보내고 받아온다 - 다른 lib/api/*.ts의
// 공개 조회 API는 쿠키가 필요 없어서 그대로 axios를 직접 쓴다.

import axios from "axios"

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000"

export const apiClient = axios.create({
  baseURL: API_BASE_URL.replace(/\/$/, ""),
  withCredentials: true,
})
