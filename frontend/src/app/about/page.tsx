export default function About() {
  return (
    <div className="space-y-6">
      <h1 className="section-title">About</h1>
      <div className="card p-5 leading-relaxed opacity-90">
        Product Explorer scrapes live data from <span className="font-medium">World of Books</span> on demand
        and caches it for a short period to be polite to the source. Built with <span className="badge">Next.js</span>,{' '}
        <span className="badge">NestJS</span>, and <span className="badge">PostgreSQL</span>.
      </div>
    </div>
  );
}
