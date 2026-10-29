export default function NotFound() {
  return (
    <main>
      <h1>Game not found</h1>
      <p>This game is not on the shelf.</p>
      {/* A full document navigation also resets any active game engine. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/">Back to the game shelf</a>
    </main>
  );
}
