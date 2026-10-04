"use client"

import { GraduationCap } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { AuthCard } from "@/components/auth/AuthCard"
import { GradeQuizStepper } from "@/components/auth/GradeQuizStepper"
import { useAuth } from "@/components/common"

export default function OnboardingGradeQuizPage() {
  const router = useRouter()
  const { status } = useAuth()

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login")
  }, [status, router])

  if (status !== "authenticated") return null

  return (
    <AuthCard
      title="등급 진단 퀴즈"
      description="몇 가지만 답해주시면 지금 수준에 맞는 등급을 정해드려요."
      icon={GraduationCap}
    >
      <GradeQuizStepper completeLabel="메인으로 가기" onComplete={() => router.push("/")} />
    </AuthCard>
  )
}
