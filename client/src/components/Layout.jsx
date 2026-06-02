import Nav from './Nav';
import SummaryBar from './SummaryBar';

export default function Layout({ children, page, setPage }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[#0f1117]">
      <Nav page={page} setPage={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <SummaryBar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
