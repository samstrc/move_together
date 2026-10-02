import PageHeader from '../components/PageHeader.jsx'
import { budget, expenses, group } from '../data/sampleData.js'
import { formatDate, formatMoney } from '../utils/format.js'

// Group budget: how much is set aside, spent, and who paid for what.
// TODO: Add forms to set the budget and log a new expense.
function Budget() {
  const spent = expenses.reduce((total, expense) => total + expense.amount, 0)
  const remaining = budget.total - spent
  const percentSpent = Math.min(100, Math.round((spent / budget.total) * 100))

  // Total paid by each member, so the group can settle up later.
  const paidByMember = group.members.map((member) => ({
    name: member.name,
    paid: expenses
      .filter((expense) => expense.paidBy === member.name)
      .reduce((total, expense) => total + expense.amount, 0),
  }))

  return (
    <>
      <PageHeader title="Budget" subtitle="Keep spending on track as a group.">
        <button className="btn btn-primary">Log expense</button>
      </PageHeader>

      <section className="card">
        <div className="budget-numbers">
          <div>
            <p className="stat-label">Total budget</p>
            <p className="stat-value">{formatMoney(budget.total)}</p>
          </div>
          <div>
            <p className="stat-label">Spent</p>
            <p className="stat-value">{formatMoney(spent)}</p>
          </div>
          <div>
            <p className="stat-label">Remaining</p>
            <p className="stat-value">{formatMoney(remaining)}</p>
          </div>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={percentSpent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${percentSpent}%` }} />
        </div>
        <p className="muted">{percentSpent}% of the budget used</p>
      </section>

      <div className="two-column">
        <section className="card table-card">
          <h2>Expenses</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Paid by</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{formatDate(expense.date)}</td>
                  <td>{expense.description}</td>
                  <td>{expense.paidBy}</td>
                  <td>{formatMoney(expense.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Paid by member</h2>
          <ul className="simple-list">
            {paidByMember.map((member) => (
              <li key={member.name}>
                <span>{member.name}</span>
                <span>{formatMoney(member.paid)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

export default Budget
