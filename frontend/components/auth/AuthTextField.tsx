import { type InputHTMLAttributes } from "react"

interface AuthTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

/** 인증 관련 폼(로그인/회원가입 등) 공용 입력 필드 - 라벨 + input + 에러 메시지 */
export function AuthTextField({ label, error, id, ...inputProps }: AuthTextFieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={id}>
      <span className="font-medium text-neutral-700">{label}</span>
      <input
        id={id}
        {...inputProps}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-offset-2 placeholder:text-muted-foreground focus-visible:outline-point max-md:h-11 max-md:text-sm"
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </label>
  )
}
