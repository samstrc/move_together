// Title area used at the top of every logged-in page.
// `children` is whatever you put between <PageHeader> and </PageHeader>,
// e.g. a button on the right-hand side.
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export default PageHeader
