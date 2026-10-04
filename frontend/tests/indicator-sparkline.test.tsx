import assert from "node:assert/strict"
import { after, test } from "node:test"
import { JSDOM } from "jsdom"
import { act, createElement } from "react"

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
})
let observerCount = 0
class ZeroSizeObserver {
  constructor(private callback: ResizeObserverCallback) {
    observerCount++
  }
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: target.getBoundingClientRect(),
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    )
  }
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  ResizeObserver: ZeroSizeObserver,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
})

const { createRoot } = await import("react-dom/client")
const { Area, AreaChart, ResponsiveContainer } = await import("recharts")
const { default: IndicatorSparkline } =
  await import("../components/marquee/IndicatorSparkline")
const data = [{ desktop: 10 }, { desktop: 20 }, { desktop: 15 }]

after(() => dom.window.close())

test("reproduces the warning when a hidden ticker uses percentage dimensions", async (t) => {
  const warnings: string[] = []
  t.mock.method(console, "warn", (...args: unknown[]) =>
    warnings.push(args.join(" "))
  )
  const host = document.createElement("div")
  host.style.display = "none"
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => {
      root.render(
        <ResponsiveContainer initialDimension={{ width: 320, height: 200 }}>
          <AreaChart data={data}>
            <Area dataKey="desktop" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      )
    })
    assert.ok(
      warnings.some((message) => message.includes("should be greater than 0")),
      "The old hidden-header layout must reproduce the reported warning"
    )
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

test("both header copies keep fixed chart sizes through hide/show and resize without warnings", async (t) => {
  const warnings: string[] = []
  t.mock.method(console, "warn", (...args: unknown[]) =>
    warnings.push(args.join(" "))
  )
  observerCount = 0
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    for (const desktopVisible of [true, false, true]) {
      await act(async () => {
        root.render(
          createElement(
            "div",
            null,
            ...[desktopVisible, !desktopVisible].map((visible, index) =>
              createElement(
                "div",
                { key: index, style: { display: visible ? "block" : "none" } },
                createElement(IndicatorSparkline, {
                  data,
                  color: index ? "#2563eb" : "#ff2a2a",
                })
              )
            )
          )
        )
        window.dispatchEvent(new window.Event("resize"))
      })
      const surfaces = host.querySelectorAll("svg.recharts-surface")
      assert.equal(surfaces.length, 2)
      for (const surface of surfaces) {
        assert.equal(surface.getAttribute("width"), "80")
        assert.equal(surface.getAttribute("height"), "40")
      }
      assert.equal(
        host.querySelectorAll(".recharts-responsive-container").length,
        0
      )
      const gradientIds = [...host.querySelectorAll("linearGradient")].map(
        (element) => element.id
      )
      assert.equal(
        new Set(gradientIds).size,
        2,
        "Repeated ticker copies must have unique gradient IDs"
      )
    }
    assert.equal(
      observerCount,
      0,
      "Fixed-size tickers must not measure hidden parents"
    )
    assert.deepEqual(warnings, [])
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
