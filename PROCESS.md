# Process overview

## What I built

I built **Pixel Ruins**, a one-level browser platform game rendered with Canvas. The player explores a scrolling block world using variable-height jumps, activates a mystery block to reveal a safer route, crosses animated lava, breaks blocks, encounters a patrol enemy, and reaches a portal to win. Falling into lava or touching the enemy from the side ends the round. The level teaches these rules through its layout and visual feedback rather than written instructions.

The finished game is deployed at the [public GitHub Pages site](https://comp4020-agentic-coding-studio.github.io/comp4020-crit5-wanghanbo73-create/).

## The moments that mattered

1. **Building a controllable foundation before designing the level.** I directed the work in small stages instead of asking the coding agent to generate the complete game at once:

   > First create the Canvas, player movement, gravity and variable-height jumping. Do not add enemies, hazards or a complete level yet.

   The first playable loop established responsive movement and separated game rules from rendering. I then added world coordinates, solid-platform collision and a following camera before introducing more mechanics. This gave later work a stable physical foundation rather than requiring repeated fixes to an already complicated level. Evidence: [`4053074...48a274d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-wanghanbo73-create/compare/4053074...48a274d).

2. **Using the environment to teach without instructions.** The early dark pit technically caused a loss, but it did not clearly communicate danger. I replaced it with animated lava and added stronger colour contrast, bubbles and edge lighting. The mystery block reveals a hidden platform, creating a safer upper route, while a direct jump remains faster but riskier. This made the level itself communicate danger and choice instead of adding explanatory text. Evidence: [`068aca8`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-wanghanbo73-create/commit/068aca8).

3. **Giving automated tests one precise job.** I added the patrol enemy, victory and loss states, and focused the rule checks on the difference between two contacts: descending onto the enemy defeats it and bounces the player, while touching it from the side produces a loss. Encoding this distinction in the testable game logic protected the central rule while I continued changing animation and presentation. Tests could establish the state transition, but not whether the collision looked or felt fair in play. Evidence: [`2e4a061`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-wanghanbo73-create/commit/2e4a061).

4. **Correcting the finished presentation through browser play.** After the complete loop was playable, viewing and playing it in the browser revealed that the Canvas occupied too little of the page, the character was difficult to read, and background structures looked too similar to solid platforms. Instead of adding more mechanics, I enlarged the game presentation, removed distracting default page styling, unified the title, strengthened the player silhouette, and increased the visual separation between scenery and playable surfaces. This correction came from experiencing the finished game rather than reading its code. Evidence: [`5a8b546...12f0162`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-wanghanbo73-create/compare/5a8b546...12f0162).

## Before shipping

I checked the focused automated tests, production build and evidence requirements, and played the game at the required marking viewports. The deployed build preserves keyboard input, responsive Canvas scaling, clear win and loss endings, and the absence of gameplay instructions.

The final version is available at:

* [Pixel Ruins — GitHub Pages](https://comp4020-agentic-coding-studio.github.io/comp4020-crit5-wanghanbo73-create/)
* [Source repository](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-wanghanbo73-create)

The accompanying reflection is in `reflections/crit-5.md`.
