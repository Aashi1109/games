import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import './shelf.css';

export const viewport: Viewport = { themeColor: '#181a24' };

export default function ShelfLayout({ children }: { children: ReactNode }) {
  return children;
}
