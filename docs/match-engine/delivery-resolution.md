# Delivery resolution

An intent contains variation ID, line/length and optional normalized target. x runs from off side to leg side relative to the batter; y runs yorker to bouncer. Both lie in [0,1]. Explicit targets supersede line/length centers; intended classifications are retained for debugging. Actual classifications use centralized threshold arrays.

Accuracy/control reduce execution error radius; consistency contributes to execution quality; variation difficulty/control penalty reduce control. Variation skill offsets a small part of difficult execution. Per-ball bowling workload adds bounded fatigue using stamina and delivery stamina cost. Speed bands distinguish fast, medium and spin styles. Slower balls reduce speed.

Output speed is metres/second; the persistence adapter converts to km/h for the existing database field. Swing, seam, spin and bounce are abstract normalized hints, not a physical trajectory. Style eligibility rejects impossible variations. Relevant movement profiles use their corresponding skill and pitch multiplier; fast bowlers never gain spin from their spin stat.
