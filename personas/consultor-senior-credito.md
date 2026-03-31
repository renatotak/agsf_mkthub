# Persona: Consultor Senior de Credito & Reestruturacao

> Credit and restructuring specialist. Uses Market Hub to monitor judicial recovery filings, assess commodity-driven credit risk, and build financial models informed by real-time market data.

## Profile

| Attribute | Detail |
|-----------|--------|
| **Decision scope** | Credit recommendations, restructuring approach, model variable selection |
| **Data appetite** | Precise financial data: commodity prices affect credit exposure; judicial filings signal distress |
| **Frequency** | 2-3x/week, daily during active restructuring cases |
| **Tools** | Excel (advanced), BACEN/Serasa databases, CONAB/CEPEA, CRM |

## Primary Modules

| Module | What they look for | How often |
|--------|-------------------|-----------|
| **Recuperacao Judicial** | New filings by agro entities (produtores rurais, cooperativas, usinas). Who's in distress? | 2-3x/week |
| **Market Pulse** | Commodity price direction → credit exposure calculation. Selic rate for discounting | 2-3x/week |
| **Company Research** | CNPJ lookup for entities in judicial recovery, SWOT, financial indicators | On-demand |
| **Agro News** | Judicial/credit category news: regulatory changes, sector-wide distress signals | Weekly |

## Routine: Judicial Recovery Monitoring (Tuesday/Thursday)

| Step | Task | Automated / Manual |
|------|------|--------------------|
| 1 | Open Recuperacao Judicial — scan new filings since last check | **Automated** — data synced daily from ConJur + Migalhas |
| 2 | Filter by entity type (produtor_rural, cooperativa, usina) and state | **Manual** — filtering based on current case portfolio |
| 3 | Cross-reference entities against CRM to check if they're existing contacts | **Manual** — requires domain knowledge |
| 4 | For relevant cases: pull Company Research data (CNPJ, financial indicators) | **Manual** — research and assessment |
| 5 | Check Market Pulse for the commodities most relevant to the distressed entity | **Automated** — prices available |
| 6 | Update internal case files with new intelligence | **Manual** |

## What a Virtual Coworker Can Do

- **Generate judicial recovery alerts**: Daily summary of new filings filtered by entity type, state, or specific keywords
- **Build credit risk dashboards**: Combine commodity price trends with filing volume to visualize sector distress indicators
- **Cross-reference new filings with CRM contacts**: Flag if any entity in Recuperacao Judicial matches a company in the CRM pipeline
- **Create commodity impact scenarios**: "If soy drops 10%, which type of producers are most exposed?" — combining market data with historical patterns
- **Summarize judicial filings**: Generate concise Portuguese summaries of complex legal articles

## What Requires Human Judgment

- Credit worthiness assessment and recommendation
- Restructuring plan design (debt terms, collateral evaluation)
- Model variable selection for credit scoring
- Client communication about sensitive financial matters
- Legal interpretation of specific judicial recovery proceedings
