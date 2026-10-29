import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { GamePage } from '../../../components/game-page';
import { GAME_PAGES, GAME_SLUGS } from '../../../lib/game-pages.ts';

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return GAME_SLUGS.map((slug) => ({ slug }));
}

async function resolveGame(params: Props['params']) {
  const { slug } = await params;
  if (!Object.hasOwn(GAME_PAGES, slug)) notFound();
  return { slug, game: GAME_PAGES[slug] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { game } = await resolveGame(params);
  return {
    title: game.title,
    description: game.description,
    icons: { icon: game.icon ?? '/assets/shelf/mark.svg' },
  };
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { game } = await resolveGame(params);
  return { themeColor: game.themeColor, viewportFit: game.viewportFit };
}

export default async function Page({ params }: Props) {
  const { slug } = await resolveGame(params);
  return <GamePage key={slug} slug={slug} />;
}
