export default function About() {
  return (
    <div className="space-y-6">
      <h1 className="section-title">About</h1>
      <div className="card p-5 leading-relaxed opacity-90">
        Product Explorer is a book-browsing project using data from World of Books.
        It saves prices, descriptions and cover images when the source page provides them.
        Open a book and select Refresh details to check for an update.
        Saved prices may differ from the source website, and ratings are not always available.
      </div>
    </div>
  );
}
