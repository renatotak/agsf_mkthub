# Persona: Data Analyst / BI

> Dashboard builder and data visualization specialist. The persona who transforms Market Hub's raw data into visual insights consumed by everyone else.

## Profile

| Attribute | Detail |
|-----------|--------|
| **Decision scope** | Visualization approach, dashboard structure, data presentation |
| **Data appetite** | All modules — consumes and reshapes data for other personas |
| **Frequency** | Daily |
| **Tools** | Power BI, Tableau, Metabase, SQL, Excel/Sheets, CONAB/IBGE portals |

## Primary Modules

| Module | What they look for | How often |
|--------|-------------------|-----------|
| **All modules** | Raw data quality and completeness for BI dashboard creation | Daily |
| **Market Pulse** | Time series data for commodity trend visualizations | Daily |
| **CRM** | Pipeline metrics for sales performance dashboards | 2-3x/week |
| **Retailers Directory** | Geo data (lat/long, UF, municipio) for location-based analytics | Weekly |
| **Agro News** | Volume and category trends for news coverage analysis | Weekly |

## Routine: Daily Data Validation (9:00 AM)

| Step | Task | Automated / Manual |
|------|------|--------------------|
| 1 | Check cron job results: all 4 sub-jobs successful? | **Automated** — cron runs, results available via API |
| 2 | Verify data freshness: Market Pulse last_update is today? | **Automated** — timestamps available |
| 3 | Check news volume: normal article count for today? | **AI-Assisted** — can auto-flag anomalies |
| 4 | Pull latest data into BI tool for dashboard refresh | **Manual** — BI tool configuration |

## Routine: Weekly Dashboard Refresh (Monday)

| Step | Task | Automated / Manual |
|------|------|--------------------|
| 1 | Refresh all Power BI / Tableau dashboards with latest Supabase data | **Manual** — BI tool workflow |
| 2 | Generate weekly trend charts for CEO review | **AI-Assisted** — data auto-available; chart creation is manual |
| 3 | Build ad-hoc analysis requested by consultants | **Manual** — custom analysis |
| 4 | Document any data quality issues found during the week | **Manual** |

## What a Virtual Coworker Can Do

- **Generate automated data quality reports**: Row counts, null percentages, freshness timestamps across all tables
- **Create summary statistics**: Weekly commodity price averages, news volume by category, CRM stage transitions
- **Export Supabase data** in CSV/JSON formats ready for BI tool ingestion
- **Build SQL queries** for custom analysis (e.g., "top 10 municipalities by retailer density")
- **Alert on data anomalies**: unexpected spikes/drops in any metric

## What Requires Human Judgment

- Dashboard design and UX decisions
- Choosing which metrics to highlight for different audiences
- Interpreting patterns and correlating across modules
- Presenting findings to non-technical stakeholders
- Ad-hoc analysis scoping (understanding what the requester actually needs)
