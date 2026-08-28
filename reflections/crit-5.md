# Reflections

## What was the breakthrough that moved the work forward?

The breakthrough was realising that correct game rules were not enough—the hazards and choices also had to be understandable without instructions. My automated tests could confirm that landing on an enemy defeated it, while touching it from the side caused a loss. However, these tests could not tell me whether the game felt fair or whether the danger was visually obvious.

When I played the completed game loop in the browser, I noticed that the original dark pit looked more like missing scenery than a dangerous area. I replaced it with animated lava using bright colours, bubbles and edge lighting. This made the risk immediately understandable without adding explanatory text. I also improved the size of the game area and the contrast between background structures and solid platforms. The breakthrough was treating play as a different form of evidence from testing: tests established the rules, while playing revealed whether those rules were communicated clearly.

## What did this work change about who I want to be as a software developer?

This work made me want to become a developer who directs coding agents through small, verifiable stages rather than requesting an entire product at once. I separated movement, physics, level design, enemy rules and visual refinement into focused steps, then checked each step before continuing.

I also learned that my responsibility does not end when generated code passes its tests. I need to judge the experience, identify where the agent’s technically correct output is unclear, and provide specific corrections grounded in observation. In future projects, I want to combine automated verification with deliberate human evaluation, using each for the questions it can actually answer.
