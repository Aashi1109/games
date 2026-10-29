# Kitchen Rush — reference research

Checked 6 October 2026, before implementation. These are primary developer/distributor descriptions of real games; no claims of personally completing their embedded games or of current growth are made.

## Observed reference patterns

- [Papa's Burgeria, Flipline Studios](https://www.flipline.com/games/papasburgeria/index.html): developer page specifies mouse controls and a sequence of taking orders, grilling patties, adding requested toppings, and serving individual customers. Its mobile editions deliberately adapt the controls. The useful pattern is readable order-to-assembly correspondence, not a large shop economy.
- [Cooking Fast, Poki / Increase Media](https://poki.com/en/g/cooking-fast): orders must be prepared before customers leave; burgers, hotdogs and drinks introduce task variety. Mouse preparation is supported on desktop and touch devices. The listed last update is June 2022, so this is an established behavior reference, not a new trend.
- [Papa's Freezeria, CrazyGames / Flipline Studios](https://www.crazygames.com/game/papas-freezeria): separate order, build, mix and topping stations make recipe accuracy and timing legible. The original release is August 2011. Its full multi-station progression would be too much for a two-minute mini-game.

## Original design decisions

Kitchen Rush is an original two-minute diner shift with three visible ticket positions, explicit bottom-to-top burger recipes, one active assembly plate, six ingredient choices, undo/discard, customer patience, escalating arrivals, and combo tips. Incorrect service costs patience rather than secretly accepting the wrong recipe. Four walkouts close the shift; surviving the timer ends it successfully. Recipe details remain visible, avoiding a pure memory test.

The visual direction is a red-and-mustard roadside diner: giant condensed-style lettering, checkered floor edge, clipped paper tickets, custom SVG ingredients, illustrated customer portraits, stainless counter and tactile buttons. It intentionally differs from both the existing arcade and the fishing journal. Controls: ingredient keys 1–6, ticket cycling with arrows, Enter to serve, Backspace to undo; every action also has a labeled button. No copied assets, brand characters, external fonts, or runtime network calls.

## Success checks

Exact recipe matching; deadlines remove the correct ticket; score/combo only on valid service; pause freezes shift and patience; restart returns a fresh shift; terminal states reject actions; finite safe persistence; keyboard and touch work; mobile layout keeps active ticket, plate and ingredients reachable. Tests cover these rules and the complete shift lifecycle.

The project-wide [research record](../RESEARCH.md#alexandria-check) documents the requested Alexandria discovery attempts and their lack of matching providers. This game relies on the primary pages above, not unavailable structured provider data.


## Visual refinement — 2026-10-06

The parent reviewer inspected Wonder Shelf as a quality reference and reported viewport-filling gameplay, detailed interactive pieces, integrated themed HUDs, tactile controls and meaningful feedback. Those are attributed reviewer observations, not a claim that this implementation author played those reference games. No reference assets, compositions or game code were copied.

**An original diner counter.** The actual ticket rail, ceramic serving plate, layered food pieces and metal ingredient bins fill the screen. The oversized cover and welcome illustration were removed. Stack drops respond to added ingredients, and serving feedback reports the actual earned tip. The original recipes, timing and scoring are preserved.

Typography is bundled locally with the game, including the applicable OFL license files. Reduced-motion preferences suppress optional feedback motion; movement required to read gameplay remains. No runtime font or asset network requests are required.

## Full game-interface redesign — 6 October 2026

Concrete online interface reference: [Papa’s Burgeria](https://i.flipline.com/gamefiles/papasburgeria/images/screenshot_03.jpg).

**Observed:** Official Flipline screenshot inspected in Chrome. The burger occupies the center, ingredient shelves sit beside it, a recipe is always visible, and controls dock along the bottom. Official product page https://www.flipline.com/games/papasburgeria/ confirms order, grill, build and serve workflow. Only assembly is implemented here.

**Original implementation decisions:** A compact red-and-stainless diner station: readable tickets across the top, a large central burger assembly area, physical ingredient bins beside it, and a service dock below. Keep the two-minute shift, exact ingredient sequence and existing keyboard input.

This research preceded this redesign. Screens were inspected visually, not claimed as full reference playthroughs. No reference assets or layouts are reproduced; all existing game artwork is local code. This supersedes the earlier website/editorial composition.

### Viewport constraint refinement — 2026-10-06

The kitchen uses a viewport-sized workstation. Phone tickets keep the selected recipe visible with compact choices; short landscape puts the order rail beside the pass. Burger artwork scales with its actual layer count to stay on the plate. This is a local usability refinement using the previously documented visual references, not a new reference observation. No game rules or physics changed.
