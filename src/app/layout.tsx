import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'The Game Shelf — Pick up & play',
  description:
    '20 free browser games. Arcade, puzzles, racing and a round with friends. Pick a game and play.',
  icons: { icon: '/assets/shelf/mark.svg' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
