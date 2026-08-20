import NavBar from '../components/NavBar';

export default function StocksPage() {
  return (
    <>
      <NavBar title="Stocks" />
      <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="coming-soon" style={{ flex: 1 }}>
          <div className="coming-soon-emoji">📈</div>
          <h2>Stocks — Coming Soon</h2>
          <p>
            ML-powered portfolio recommendations, risk profiling,<br />
            and market awareness will live here in Phase 3.
          </p>
          <p className="text-muted" style={{ marginTop: 8, fontSize: '0.78rem' }}>
            Track: Hack-4-Crown · Phase 3
          </p>
        </div>
      </div>
    </>
  );
}
