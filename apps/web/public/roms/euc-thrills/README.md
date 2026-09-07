# EUC Thrills — SNES Edition

A homebrew game for the Super Nintendo Entertainment System, by
**Edwin Rodmen**.

<img src="euc-thrills-snes-box-front.png" width="360" alt="EUC Thrills SNES Edition box front">

You ride an electric unicycle down a route that runs from a city plaza out to a
forest trailhead, and the only thing you really control is your speed. Lean
forward to go faster, lean back to slow down, jump the gaps and duck the birds.
One hit ends the run. There is no brake pedal and no second chance on a hazard
— only the momentum you chose to carry into it.

|  |  |
|---|---|
| ![City Plaza](media/1-city-plaza.png) | ![Park & Riverside](media/2-park.png) |
| ![Hillside](media/3-hillside.png) | ![Industrial Edge](media/4-industrial.png) |
| ![Underpass](media/5-underpass.png) | ![Trailhead](media/6-trailhead.png) |

*The six zones of one round, in the order you ride them.*

## Play it

Download `euc-thrills-snes.sfc` and load it as an ordinary headerless NTSC
Super NES ROM. It is a 512 KB LoROM cartridge with battery-backed save RAM and
no enhancement chip, so anything that runs commercial SNES carts will run it.

Every button is in the manual below, but you can work the whole game out from
the title screen, which is the point.

## Playing in Delta on iPhone or iPad

1. Save `euc-thrills-snes.sfc` into the Files app — iCloud Drive, On My iPhone,
   anywhere Delta can reach.
2. In Delta, add a game and pick that file. The exact menu wording moves around
   between Delta and iOS versions; there is nothing to patch, and no companion
   file or external game data to supply.
3. Tap the cover to ride.

**HI** is a battery save, not a save state — the cartridge writes it itself, so
your best run survives closing the app without you having to remember anything.

Delta's on-screen pad works. If you have a Bluetooth controller, pair it and
use that instead: this game wants **Right** held down almost continuously, and
that is easier on a stick than on glass.

## Controls

| Input | Action |
|---|---|
| **D-pad Right** | Lean forward — accelerate |
| **D-pad Left** | Lean back — brake |
| **B** | Jump. Distance scales with your speed. Also stands you up out of a duck |
| **Y** *or* **D-pad Down** | Duck. Held posture; clears overhead birds. Costs you speed for as long as you hold it |
| **Start** | Start, pause, and return to the title from game over or from the ending |
| **A** | At the sign-off after every completed round: ride on into the next round — faster, harder, your score carried |
| **Select** | Credits — from the title screen; press again to go back |

**Ducking costs you speed.** Staying low is not free: every frame you hold the
crouch bleeds off exactly as much speed as a frame of throttle puts on. Duck
for the bird, then stand up and rebuild — because speed is what clears a gap,
and a rider who never stands up cannot jump one.

**Ducking never clears a gap either.** The wheel has one contact patch — only
being airborne gets you over a pit. If **SPEED UP** starts blinking on the HUD,
the gap ahead is wider than your current speed can jump: accelerate before you
reach it. The game guarantees every gap is jumpable from the speed you can
reach on the run-up, and that promise holds in every round.

## A run

One round is six linked zones — **City Plaza**, **Park & Riverside**,
**Hillside**, **Industrial Edge**, **Underpass**, and **Trailhead** — each with
its own scenery, road surface and hazards. Clearing one earns you a wheel back,
up to five, and a short intermission before the next — press **Start** if you
would rather not wait.

Reach the gate at the trailhead and someone is waiting for you. Stay as long
as you like — then the sign-off offers the choice, after every round: **A**
rides on into the next round with your score intact, **Start** ends the run at
the title. A natural spot to pass the controller.

Each round is harder than the last up to round five, after which the route
settles at a fixed difficulty, so two players' scores mean the same thing. The
minimum speed climbs, hazards sit closer together and gaps get wider.

**SCORE** counts distance, hazards cleared, zones and rounds, all multiplied by
how fast you were travelling. Extra wheels come from two places: one for every
zone you clear, and one at 10,000 points and every 50,000 after that. Either
way the stack stops at five. **HI** is the best run this cartridge has seen —
it lives in battery-backed SRAM, so it survives being switched off, exactly as
it would have in 1994.

## Sound

Nine sound effects, silence between them, and a theme for every zone.

There is deliberately no engine noise and no road hum. A real electric unicycle
is a nearly silent machine, so what carries the sense of speed here is a driving
arpeggio in the music rather than a noise floor underneath it. One rider theme
runs through all six zones — stated in the City Plaza, brightened in the Park,
tilted downhill at the Hillside, fractured at the Industrial Edge, stripped to
bass and echo in the Underpass, and resolved in major at the Trailhead.

On your last wheel the machine starts beeping at you, the way a real one does
when it is near its limit.

None of it is sampled from anything. Every instrument and every effect is
synthesised from arithmetic.

## Verify your download

```sh
shasum -a 256 -c SHA256SUMS.txt
```

Run it from inside this folder. Every file should report `OK`.

## What is in this package

| File | |
|---|---|
| `euc-thrills-snes.sfc` | The game. 512 KB, NTSC, LoROM |
| `euc-thrills-snes-box-front.png` | Box front artwork, 1400×2000 |
| `media/` | Screenshots, captured from this exact ROM |
| `SHA256SUMS.txt` | Checksums for everything above |
| `LICENSE` | CC BY-NC-ND 4.0, in full |
| `PERMISSIONS.md` | Extra permissions the author grants on top of it |
| `NOTICE.md` | Authorship, provenance, and non-affiliation |
| `THIRD_PARTY_NOTICES.txt` | PVSnesLib and SNESMod attribution |

There are no other builds. Anything you find elsewhere with `debug`, `test` or
`autotest` in its name is a development diagnostic and is not this game.

## Verification status

This ROM passes the project's automated gates: header and checksum, logic
tests, on-screen text decoded from video memory, palette integrity read back
out of CGRAM in nine game states, sprite-table integrity read back out of OAM,
all six zones, score and battery-save behaviour, sound-bank structure, and a
frame-pacing budget under load. The exact file in this package — not a rebuild
of it — boots and plays a full run, title through game over, in both
**Mesen 2.1.1** and **ares v148**.

It has also been played from the title screen through to the ending on
**SNES Classic (Mini)** hardware, on a television, with a real controller, and
it has been run in **Delta** on iOS. Original Super NES hardware and flash
cartridges are still untested.

One known defect, listed because a homebrew ROM should say so rather than let
you find out: pausing on certain bars can leave a note sustaining instead of
falling silent — the sequencer stops advancing rows but does not release a
voice that is already sounding. Reports of any of it are welcome in the
repository's issues.

## Licence

Released under
**[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)** —
keep it, play it, share the whole package for free with credit. Do not sell it,
and do not publish a modified version.

**Free does not mean unowned.** Selling this game — as a download, on a
cartridge, on a preloaded console or SD card, or inside a paid bundle — is not
permitted, and neither is putting it behind a paywall.

**Read `PERMISSIONS.md` before assuming something is banned.** Getting the ROM
onto your own console or emulator by whatever patching or repacking that takes,
sharing the package for free, and streaming or monetising *video* of the game
are all explicitly allowed.

Full terms in `LICENSE`. Authorship and provenance in `NOTICE.md` — including
which parts of this game are and are not the author's own work, stated plainly.

## Notices

An independent, unofficial homebrew project. Not affiliated with, endorsed by,
or associated with Nintendo, or with any manufacturer of electric unicycles.
"Super Nintendo Entertainment System", "Super NES" and "SNES" are Nintendo's
marks and are used only to identify the hardware this game runs on.

Written in C, with the art, music and sound generated by the project's own
Python tools. Built with [PVSnesLib](https://github.com/alekmaul/pvsneslib);
see `THIRD_PARTY_NOTICES.txt`.

---

**Edwin Rodmen** — [instagram.com/edwin_rodmen](https://instagram.com/edwin_rodmen)
