# Word Weave — research before implementation

Research completed 6 October 2026. Sources were read live before any game code was written. This is an original game, not a reproduction of these products. No source artwork, puzzle boards, branding, or word-list data is copied.

## Primary sources and observed behavior

1. **Hasbro, official Boggle instructions** (2011 rules, accessed 2026-10-06): https://www.hasbro.com/common/documents/dad2884b1c4311ddbd0b0800200c9a66/1AE2AD1550569047F59DFC4FFAFFC174.pdf
   - Words follow horizontal, vertical, or diagonal adjacency; one tile cannot repeat within a word. Three letters is the minimum. Duplicate spellings count once. The published scoring rewards length. The physical product uses a three-minute round.
   - The rules explicitly distinguish a repeated tile from distinct tiles bearing the same letter. This must be enforced in the input path and tested.
2. **Squaredle, official playable site** (accessed 2026-10-06 via Firecrawl): https://squaredle.app/
   - The retrieved live interface presents a swipe-through-PLAY tutorial, a daily puzzle, a found/missing word list, word-length groupings, progressive hints, and yesterday's missed words.
   - Its interface makes progress inspectable and provides an after-play learning opportunity. The retrieved page also distinguishes required words from obscure bonus words.
   - Observation limitation: these are published rules and rendered interface text, not a claim to have manually completed a reference puzzle or audited its private dictionary.

## Original design decisions

- A literary botanical paper: dark green letterpress type, warm newsprint, fine rules, hand-drawn plants, and an asymmetric pressed-flower collection. This deliberately differs from the site's illustrated arcade and from the tactical garden game.
- Four-by-four letter boards; 8-direction adjacency; no reused tile within a word; minimum 3 letters. Taps, keyboard, and optional drag receive the same validation.
- A seeded UTC daily board and fresh practice boards. Daily is a three-minute harvest; practice is untimed. Pause hides the letters and freezes time. All rounds can be ended early to reveal missed words.
- An original, explicitly limited curated common-English wordbook is bundled. Its full contents are available in-game. A rejected valid English word is described as outside this edition's wordbook, not as nonexistent. Board generation is checked against the actual wordbook to guarantee enough discoverable words.
- Word-length scoring is disclosed. A unique board with enough words found contributes a pressed flower to the local garden. Replaying the same board cannot repeatedly farm its flower.
- No account, ad, external dictionary lookup, remote asset, or runtime dependency. Local records are optional and malformed/unavailable storage must not block play.

## Verification priorities

Adjacency including diagonals, prevention of tile reuse, backtracking, duplicate words, rejected short/off-list words, seeded board reproducibility and minimum solution count, scoring, timer pause/end, missed-word reveal, safe saved data, keyboard/touch parity, and 360px layout.

## UI refinement, 6 October 2026

The parent agent inspected Wonder Shelf gameplay and recorded its observations in the root reference note. We used only the general quality principles: prioritize actual play, finish interactive materials, integrate controls with the game world, and show meaningful feedback. No reference assets, designs, characters or code were copied. The original letterpress tray, selected-word feedback and compact literary layout retain this game's established identity and rules. Local Newsreader fonts are distributed with the included SIL Open Font Licenses.

Font source: [Google Fonts / Newsreader](https://github.com/google/fonts/tree/main/ofl/newsreader), roman and italic variable files, retrieved 6 October 2026.

## Full game-interface redesign — 6 October 2026

Concrete online interface reference: [Squaredle](https://squaredle.app/).

**Observed:** Live tutorial interface inspected in Chrome: large immediately visible letter squares, found/total above the board, found and missing word lists beside it, and one contextual instruction. No reference puzzle, dictionary or artwork is copied.

**Original implementation decisions:** Remove the newspaper layout. Build a focused violet-and-peach word table with a large square letter tray, top score/time strip, adjacent compact discoveries and the collection below. Preserve daily UTC 180-second rounds, untimed practice and disclosed curated dictionary.

This research preceded this redesign. Screens were inspected visually, not claimed as full reference playthroughs. No reference assets or layouts are reproduced; all existing game artwork is local code. This supersedes the earlier website/editorial composition.

### Viewport constraint refinement — 2026-10-06

The square letter board uses the remaining viewport height. Short landscape puts timer, selected word and Gather alongside it; smaller screens use bounded word/garden, guide and dictionary panels. Long dictionary and found/missed-word lists may scroll inside their reference panels; the playable board and controls do not. This is a local usability refinement using the previously documented visual references, not a new reference observation. No game rules or physics changed.
