/**
 * Canonical ORDOBOOK category order — the single source of truth for how
 * financial line items are ordered anywhere they're listed as data.
 *
 * Order follows the financial statements and the flow of data:
 *   Balance Sheet: Assets (most → least current) → Liabilities → Equity
 *   then non-accounting data (job / invoice counts — not a mapping category,
 *   so it has no entry here, but it sits between Equity and Income on screens
 *   that show it)
 *   Profit & Loss: Income → Cost of Sales → Expenses / Overhead → Other Income / Expense
 *
 * This is the DEFAULT. Screens with a deliberately different presentation
 * (Scoreboard, Report Card) keep their own order. Everything else — mapping
 * dropdowns, category totals, actuals grids — should import from here rather
 * than re-deciding the order locally, so it can't drift between screens.
 *
 * `value` strings must match the backend category keys exactly.
 */
export const CATEGORY_GROUPS = [
  {
    label: 'Current Assets',
    items: [
      { value: 'cash',                 label: 'Cash' },
      { value: 'accounts_receivable',  label: 'Accounts Receivable' },
      { value: 'inventory',            label: 'Inventory' },
      { value: 'other_current_assets', label: 'Other Current Assets' },
    ],
  },
  {
    label: 'Long-Term Assets',
    items: [
      { value: 'total_fixed_assets',           label: 'Fixed Assets' },
      { value: 'total_other_long_term_assets', label: 'Other Long-Term Assets' },
    ],
  },
  {
    label: 'Liabilities',
    items: [
      { value: 'accounts_payable',            label: 'Accounts Payable' },
      { value: 'other_current_liabilities',   label: 'Other Current Liabilities' },
      { value: 'total_long_term_liabilities', label: 'Long-Term Liabilities' },
    ],
  },
  {
    label: 'Equity',
    items: [
      { value: 'equity_before_net_profit', label: 'Equity (excl. Net Profit)' },
      // Signed YTD balance as QB shows it: draws negative, investments positive.
      { value: 'owner_distributions',      label: 'Owner Investments / (Distributions)' },
      { value: 'net_profit_for_year',      label: 'Net Profit for Year (BS)' },
    ],
  },
  {
    label: 'Income',
    items: [
      { value: 'revenue', label: 'Revenue' },
    ],
  },
  {
    label: 'Cost of Sales',
    items: [
      { value: 'cost_of_sales', label: 'Cost of Sales' },
    ],
  },
  {
    label: 'Expenses / Overhead',
    items: [
      { value: 'payroll_expenses',          label: 'Payroll Expenses' },
      { value: 'marketing_expenses',        label: 'Marketing Expenses' },
      { value: 'depreciation_amortization', label: 'Depreciation & Amortization' },
      { value: 'overhead_expenses',         label: 'Overhead Expenses' },
      // Computed roll-up: shown in totals, never a mapping choice.
      { value: 'total_expenses',            label: 'Total Expenses', selectable: false },
    ],
  },
  {
    label: 'Other Income / Expense',
    items: [
      { value: 'other_income_expense', label: 'Other Income / Expense' },
    ],
  },
]

/** The "leave this account out" choice. Always offered last, outside any group. */
export const EXCLUDED_CATEGORY = { value: 'excluded', label: '— Exclude this account —' }

/** Every category in canonical order, including display-only roll-ups. */
export const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap(g => g.items)

/** Categories an account can be mapped to, in canonical order (excluded last). */
export const CATEGORIES = [
  ...ALL_CATEGORIES.filter(c => c.selectable !== false),
  EXCLUDED_CATEGORY,
]

/** value → human label, covering selectable, display-only and excluded. */
export const CAT_LABEL = Object.fromEntries(
  [...ALL_CATEGORIES, EXCLUDED_CATEGORY].map(c => [c.value, c.label])
)

/** value → position in the canonical order. Unknown values sort last. */
const CAT_ORDER = Object.fromEntries(ALL_CATEGORIES.map((c, i) => [c.value, i]))
export const categoryRank = (value) => CAT_ORDER[value] ?? Number.MAX_SAFE_INTEGER

/** Sort [value, ...] entries (e.g. Object.entries of a totals map) canonically. */
export const sortEntriesByCategory = (entries) =>
  [...entries].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]))
