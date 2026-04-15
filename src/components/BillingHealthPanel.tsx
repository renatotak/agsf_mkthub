"use client";

import { useEffect, useState } from "react";
import { Loader2, DollarSign, ExternalLink, AlertTriangle } from "lucide-react";
import { Lang } from "@/lib/i18n";

type Budget = {
  displayName: string;
  amount: number | null;
  currency: string | null;
  thresholdPcts: number[];
  budgetPath: string;
};

type Response = {
  billingAccountId: string;
  consoleUrl: string;
  budgets: Budget[];
  note?: string;
  error?: string;
};

/**
 * Lists the `AGSF_`-prefixed GCP budgets configured for the billing
 * account. Live spend is not shown (Budgets API returns only
 * configuration); the console deep-link is provided for real-time
 * burn. Extend this panel once a BigQuery billing export is set up.
 */
export function BillingHealthPanel({ lang }: { lang: Lang }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ops/billing-health")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const title = lang === "pt" ? "Saúde Orçamentária GCP" : "GCP Billing Health";
  const subtitle =
    lang === "pt"
      ? "Orçamentos configurados no Cloud Billing (prefixo AGSF_). Gasto em tempo real está no console."
      : "Configured Cloud Billing budgets (AGSF_-prefixed). Live spend is in the console.";

  return (
    <div className="bg-white rounded-lg border border-neutral-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={16} className="text-brand-primary" />
            <h3 className="text-[15px] font-semibold text-neutral-800">
              {title}
            </h3>
          </div>
          <p className="text-[12px] text-neutral-500">{subtitle}</p>
        </div>
        {data?.consoleUrl && (
          <a
            href={data.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-primary hover:underline"
          >
            {lang === "pt" ? "Abrir no Console" : "Open in Console"}
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[13px] text-neutral-500">
          <Loader2 size={14} className="animate-spin" />
          {lang === "pt" ? "Consultando Cloud Billing…" : "Querying Cloud Billing…"}
        </div>
      )}

      {!loading && data?.error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-[12px] text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold mb-1">
              {lang === "pt" ? "Erro ao carregar orçamentos" : "Failed to load budgets"}
            </p>
            <p className="font-mono text-[11px]">{data.error}</p>
            <p className="mt-2 text-[11px] text-red-600">
              {lang === "pt"
                ? "Verifique: GCP_BILLING_ACCOUNT_ID em .env.local, permissão Billing Account Viewer na SA, API Cloud Billing Budgets habilitada."
                : "Check: GCP_BILLING_ACCOUNT_ID in .env.local, Billing Account Viewer role on SA, Cloud Billing Budgets API enabled."}
            </p>
          </div>
        </div>
      )}

      {!loading && data && !data.error && (
        <>
          {data.budgets.length === 0 && (
            <p className="text-[13px] text-neutral-500 italic">
              {lang === "pt"
                ? "Nenhum orçamento com prefixo AGSF_ encontrado. Crie no console do Cloud Billing."
                : "No AGSF_-prefixed budgets found. Create them in the Cloud Billing console."}
            </p>
          )}

          {data.budgets.length > 0 && (
            <div className="space-y-3">
              {data.budgets.map((b) => (
                <div
                  key={b.budgetPath}
                  className="rounded-md border border-neutral-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-semibold text-neutral-800 font-mono">
                      {b.displayName}
                    </p>
                    <p className="text-[13px] tabular-nums text-neutral-700">
                      {b.amount != null
                        ? `${b.currency || ""} ${b.amount.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "—"}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-neutral-400 uppercase">
                      {lang === "pt" ? "Alertas em" : "Alerts at"}:
                    </span>
                    {b.thresholdPcts
                      .sort((a, b) => a - b)
                      .map((p) => (
                        <span
                          key={p}
                          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600"
                        >
                          {Math.round(p * 100)}%
                        </span>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.note && (
            <p className="mt-3 text-[11px] text-neutral-400 italic">{data.note}</p>
          )}
        </>
      )}
    </div>
  );
}
