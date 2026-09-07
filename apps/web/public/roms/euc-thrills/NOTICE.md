# Notices, Licensing, and Provenance

## Origin

*EUC Thrills — SNES Edition* is an original homebrew game for the Super
Nintendo Entertainment System by **Edwin Rodmen** (VibezZzCoder).

| | |
|---|---|
| Repository | <https://github.com/VibezZzCoder/EUC-Thrills-SNES-Edition> |
| Author | <https://instagram.com/edwin_rodmen> |
| Copyright | © 2026 Edwin Rodmen |

The same three addresses are drawn on the game's own credits screen, so a copy
of this ROM still says where it came from even with every other file stripped
away.

## Licence

Everything in this package that is this project's to license is released under
**Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International
(CC BY-NC-ND 4.0)**. The complete licence text is in `LICENSE`; the plain-
language summary is at <https://creativecommons.org/licenses/by-nc-nd/4.0/>.

In short: keep it, play it, and share the whole package with anyone, for free,
with credit. Do not sell it and do not publish a modified version of it.

`PERMISSIONS.md` grants some additional permissions on top of that licence —
notably that patching or repackaging the ROM to get it onto your own console
or emulator is explicitly fine. Read it before assuming something is forbidden.

**This is not the same licence as the browser game.** *EUC Thrills* for the
web, at <https://github.com/VibezZzCoder/EUC-thrills>, is MIT-licensed with
CC BY 4.0 assets. This native edition shares that game's name and its subject
and nothing else: it is a separate codebase written in C for the 65C816, with
its own art, its own music and its own sound. The licences are different
on purpose and neither one governs the other.

The licence covers copyright. It does not license the *EUC Thrills* name or
the wordmark.

## What is this project's own work

- All game code — the C sources, the cartridge header and data declarations,
  the gameplay, and the build.
- All sprite pixel art. Every sprite is authored pixel-by-pixel inside a
  generator script; no image was traced or converted into them.
- **All audio, with no exceptions.** Every sound effect and every one of the
  fourteen musical instruments is synthesised from arithmetic against a fixed
  seed. Nothing is recorded, sampled, downloaded or derived from any existing
  recording, and the whole soundtrack regenerates from source.
- The `EUC THRILLS` wordmark, the title-screen text plate, every on-screen
  string, and the box front's composition and typography.

## What is not, and is named here rather than assumed

**The HUD letterforms.** The typeface the game draws its text with came from
PVSnesLib's own example font, which is distributed under a permissive
zlib-style licence. See `THIRD_PARTY_NOTICES.txt`. Five glyphs — `S`, `l`,
`1`, `5` and `z` — were redrawn for this game because the originals could not
be told apart well enough to read a repository address off a television; those
five are this project's work. The other ninety-one are not, and no part of the
CC BY-NC-ND grant above extends to them beyond redistributing them inside this
ROM as the zlib licence already allows.

**The title screen and the box key art.** The title-screen background and the
rider figure standing on it, and the painted figure on the box front, were
produced with an AI image generator (Google Gemini 2.5 Flash Image), from
written briefs, and then converted deterministically to the SNES's palette and
tile budget by this project's own tools. The exact prompts are kept in the
project's development tree.

Purely machine-generated images have uncertain copyright standing, and this
project does not claim more than it holds: the licence above conveys this
project's own rights and no others. What is unambiguously this project's own
in both pictures is every letter and number on them — the wordmark, the
subtitles, the credit line and the box callouts are all deterministic
project-owned tiles or type, never generated, by a standing rule of this
workspace.

No generated image in this game contains a letter, a number, a logo, a
signature or a brand mark.

## Non-affiliation

This is an independent, unofficial homebrew project. It is **not** affiliated
with, endorsed by, sponsored by, approved by, or otherwise associated with
Nintendo, or with any manufacturer of electric unicycles or riding equipment.

"Super Nintendo Entertainment System", "Super NES", "SNES" and related marks
are the property of Nintendo. They are used here only to identify the hardware
this game runs on. The box front deliberately carries no Nintendo mark, seal,
or trade dress of any kind.

This package contains no commercial ROM, no console BIOS, no manufacturer SDK
code, and no asset copied from any retail game.

## Warranty

None. See sections 5 and 6 of `LICENSE`. This is a homebrew ROM; run it at
your own risk on hardware you are willing to risk.
