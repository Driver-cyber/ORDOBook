/**
 * Derived figures for one month of actuals — the ONE place the monthly P&L and
 * balance-sheet subtotals are computed in the browser.
 *
 * This lived in three separate pages (ActualsDetail, ActualsHistory,
 * ReportsActuals), each with its own copy of the same dozen lines. A `calcs()`
 * had already been extracted into ActualsHistory and the other two never adopted
 * it. Two copies of a formula guarantee drift; three is just a longer wait.
 *
 * All values are int cents; the day ratios are ints. Pass a stored
 * MonthlyActuals record.
 */

/** The operating-expense roll-up: payroll + marketing + depreciation + overhead. */
function totalExpensesOf(d) {
  // Presence, not truthiness: a real zero is an answer. Only records that predate
  // migration 005 have no stored value at all, and only those fall back.
  if (d.total_expenses !== null && d.total_expenses !== undefined) return d.total_expenses
  return (d.payroll_expenses || 0) + (d.marketing_expenses || 0)
       + (d.depreciation_amortization || 0) + (d.overhead_expenses || 0)
}

/** Days outstanding against one month's flow. Zero when the denominator is. */
function days(balance, flow) {
  return flow > 0 ? Math.round((balance / flow) * 30) : 0
}

/**
 * @param {object|null|undefined} d a MonthlyActuals record
 * @returns {object|null} derived figures, or null when there is no record
 */
export function calcs(d) {
  if (!d) return null

  const grossProfit = d.revenue - d.cost_of_sales
  const totalExpenses = totalExpensesOf(d)
  const netOperatingProfit = grossProfit - totalExpenses
  const netProfit = netOperatingProfit + d.other_income_expense

  const totalCurrentAssets =
    d.cash + d.accounts_receivable + d.inventory + d.other_current_assets
  const totalAssets =
    totalCurrentAssets + d.total_fixed_assets + d.total_other_long_term_assets
  const totalCurrentLiabilities = d.accounts_payable + d.other_current_liabilities
  const totalLiabilities = totalCurrentLiabilities + d.total_long_term_liabilities

  // owner_distributions is QB's signed YTD equity line (draws negative).
  const totalEquity =
    d.equity_before_net_profit + (d.owner_distributions ?? 0) + d.net_profit_for_year
  const totalLiabilitiesEquity = totalLiabilities + totalEquity

  return {
    grossProfit,
    totalExpenses,
    netOperatingProfit,
    netProfit,
    totalCurrentAssets,
    totalAssets,
    totalCurrentLiabilities,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesEquity,
    dso: days(d.accounts_receivable, d.revenue),
    dio: days(d.inventory, d.cost_of_sales),
    dpo: days(d.accounts_payable, d.cost_of_sales),
  }
}
