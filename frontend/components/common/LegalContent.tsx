import type { ReactNode } from "react"

// 개인정보처리방침·이용약관·데이터 출처·방법론 페이지가 같이 쓰는 본문 조각.
// StaticPage 안에서 쓴다. 약관 문서처럼 읽히도록 번호·제목·본문 순서를 지키고, 표와 카드로 나눠 읽기 쉽게만 한다

/** 조항 하나. label은 "제1조"·"1"·메뉴 이름처럼 제목 위 작은 머리말 */
export function LegalSection({
  id,
  label,
  title,
  description,
  children,
}: {
  id?: string
  label?: string
  title: string
  description?: ReactNode
  children?: ReactNode
}) {
  return (
    <section id={id} className="flex scroll-mt-28 flex-col gap-3">
      <div className="flex flex-col gap-1">
        {label && (
          <span className="text-[11px] font-bold tracking-wide text-point">
            {label}
          </span>
        )}
        <h2 className="text-base font-bold text-foreground sm:text-lg">
          {title}
        </h2>
        {description && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

export function LegalText({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  )
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-muted-foreground">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

export type LegalCardItem = { title: string; body: ReactNode }

/** 제목 + 설명 카드 목록. columns=2면 넓은 화면에서 두 줄로 나란히 */
export function LegalCards({
  items,
  columns = 1,
}: {
  items: LegalCardItem[]
  columns?: 1 | 2
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-2 ${columns === 2 ? "md:grid-cols-2" : ""}`}
    >
      {items.map((item) => (
        <div
          key={item.title}
          className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3"
        >
          <strong className="text-sm font-bold text-card-foreground">
            {item.title}
          </strong>
          <span className="text-[13px] leading-relaxed text-muted-foreground">
            {item.body}
          </span>
        </div>
      ))}
    </div>
  )
}

/** 표. 첫 칸은 행 제목이다. 넓은 화면은 표, 좁은 화면은 행마다 카드로 쌓는다
 * widths: 열 너비(예: ["24%", "20%", "20%"]) - 비우면 균등, 마지막 열은 나머지 */
export function LegalTable({
  columns,
  rows,
  widths,
}: {
  columns: string[]
  rows: ReactNode[][]
  widths?: string[]
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border md:block">
        <table className="w-full table-fixed border-collapse text-left text-[13px]">
          {widths && (
            <colgroup>
              {columns.map((column, index) => (
                <col key={column} style={{ width: widths[index] }} />
              ))}
            </colgroup>
          )}
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="px-3 py-2.5 font-semibold"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y bg-card">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="align-top">
                {row.map((cell, cellIndex) =>
                  cellIndex === 0 ? (
                    <th
                      key={cellIndex}
                      scope="row"
                      className="px-3 py-3 font-semibold text-card-foreground"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td
                      key={cellIndex}
                      className="px-3 py-3 leading-relaxed text-muted-foreground"
                    >
                      {cell}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3"
          >
            <strong className="text-sm font-bold text-card-foreground">
              {row[0]}
            </strong>
            <dl className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1.5 text-[13px]">
              {row.slice(1).map((cell, index) => (
                <div key={index} className="contents">
                  <dt className="text-muted-foreground/70">
                    {columns[index + 1]}
                  </dt>
                  <dd className="leading-relaxed text-muted-foreground">
                    {cell}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </>
  )
}

/** 페이지 끝 안내 상자 */
export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  )
}

/** 문의 메일 주소 링크 */
export const CONTACT_EMAIL = "gaemigul.contact@gmail.com"

export function ContactEmail() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="font-medium text-point underline underline-offset-2"
    >
      {CONTACT_EMAIL}
    </a>
  )
}
