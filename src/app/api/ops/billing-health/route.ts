import { NextResponse } from "next/server"
import { readFileSync, readdirSync } from "fs"
import { resolve } from "path"

export const dynamic = "force-dynamic"
export const revalidate = 300 // 5-minute server cache

/**
 * GET /api/ops/billing-health
 *
 * Lists GCP budgets for the configured billing account and returns a
 * compact shape for the Settings panel. Only budgets whose display
 * name starts with `AGSF_` are included so unrelated org-level budgets
 * do not leak.
 *
 * Env:
 *   GCP_BILLING_ACCOUNT_ID — e.g. 01EDD9-8C3E03-4AB573
 *
 * IAM: the `agrisafe-*.json` SA must hold `Billing Account Viewer`
 * on the billing account (NOT project-level — billing roles live at
 * the billing-account scope).
 *
 * The Cloud Billing Budgets API returns budget **configuration**
 * (amount, thresholds) but NOT live spend. Live spend requires the
 * BigQuery billing export — a separate one-time setup. For v1 we
 * surface the config + a console deep-link; when the BQ export is
 * enabled we can extend this route to join against it.
 */

type BudgetOut = {
  displayName: string
  amount: number | null
  currency: string | null
  thresholdPcts: number[]
  budgetPath: string
  filter: {
    projects?: string[]
    services?: string[]
  }
}

function loadSaCredentials(): { credentials: Record<string, string>; project: string } | null {
  try {
    const root = process.cwd()
    const file = readdirSync(root).find(
      (f) => f.startsWith("agrisafe-") && f.endsWith(".json"),
    )
    if (!file) return null
    const raw = readFileSync(resolve(root, file), "utf-8")
    const creds = JSON.parse(raw)
    if (creds.type !== "service_account") return null
    return { credentials: creds, project: creds.project_id }
  } catch {
    return null
  }
}

export async function GET() {
  const billingAccountId = process.env.GCP_BILLING_ACCOUNT_ID
  if (!billingAccountId) {
    return NextResponse.json(
      { error: "GCP_BILLING_ACCOUNT_ID not set in environment" },
      { status: 500 },
    )
  }

  const sa = loadSaCredentials()
  if (!sa) {
    return NextResponse.json(
      { error: "SA key file (agrisafe-*.json) not found in project root" },
      { status: 500 },
    )
  }

  const { BudgetServiceClient } = await import("@google-cloud/billing-budgets")
  const client = new BudgetServiceClient({
    credentials: sa.credentials as unknown as object,
    projectId: sa.project,
  })

  const parent = `billingAccounts/${billingAccountId}`

  try {
    const [budgets] = await client.listBudgets({ parent })
    const filtered = (budgets || [])
      .filter((b) => (b.displayName || "").startsWith("AGSF_"))
      .map((b): BudgetOut => {
        const amountObj = b.amount?.specifiedAmount
        const nanos = Number(amountObj?.nanos || 0)
        const units = Number(amountObj?.units || 0)
        const amount = units + nanos / 1e9

        const thresholds = (b.thresholdRules || [])
          .map((t) => Number(t.thresholdPercent || 0))
          .filter((n) => n > 0)

        return {
          displayName: b.displayName || "",
          amount: isNaN(amount) ? null : amount,
          currency: amountObj?.currencyCode || null,
          thresholdPcts: thresholds,
          budgetPath: b.name || "",
          filter: {
            projects: b.budgetFilter?.projects as string[] | undefined,
            services: b.budgetFilter?.services as string[] | undefined,
          },
        }
      })

    return NextResponse.json({
      billingAccountId,
      consoleUrl: `https://console.cloud.google.com/billing/${billingAccountId}/budgets`,
      budgets: filtered,
      note: "Live spend is not returned by the Budgets API. See consoleUrl for current burn vs. thresholds.",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `billing-budgets: ${message}` },
      { status: 500 },
    )
  }
}
