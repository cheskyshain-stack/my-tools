# Torah Codes

Browser-local ELS search at `/torah-codes/`, linked under Tools. The self-contained
`index.html` contains the UI, pure `TorahELS` engine, and Blob-backed Web Worker.
There is no server search, API key, framework, or runtime dependency.

## Text edition and spelling

The user chose **standard Ashkenazi/Sephardi Torah scroll spelling, 304,805 letters**.
This is a declared ketiv-only projection of the documented scroll readings in
**Miqra according to the Masorah (MAM)**, from Hebrew Wikisource, distributed in
`bdenckla/MAM-basics` commit `f948233b08cb4809f92bd9c3be748ef55381cd97`.
It is not the WLC, a modernized spelling, or a combination of Bible editions.

The 9 explicit standard scroll alternatives come from MAM's own `scrdfftar` notes.
They are listed in the UI and `scrollReadings` in the data. MAM's base spelling
follows Yemenite scroll letters at those places. Selecting the documented standard
branch is an explicit adaptation, never a silent correction. No other consonant
spelling changes are made. The count alone does not certify spelling accuracy.

We use MAM-simple BHS JSON for Exodus, Numbers, Deuteronomy, and MAM JSON for
Genesis and Leviticus, which already have compatible verse numbering. All come
from the same pinned commit. References use **BHS Hebrew chapter/verse numbering**,
including its division of the Aseres Hadibros: 187 chapters, 5,853 numbered verse
segments. Do not silently substitute another edition's verse divisions.

Attribution: [Hebrew Wikisource](https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah#beginning).
Prepared by Seth (Avi) Kadish, Erel Segal-Halevi and Benjamin Denckla.
The source and derived text dataset are **CC BY-SA 4.0**. `source/LICENSE.md`
preserves the full source notice. `source/mam-torah-snapshot.zip` preserves the
original five JSON files and license byte for byte.

## Reproduction and mapping

Run `python3 scripts/build-torah-codes.py` from the repository root. It reads the
bundled archive and checks each input hash against `data/provenance.json`. If the
archive is absent, the fallback downloads only the pinned commit and still checks
its expected hashes. Unknown Scripture roles fail the build.

Extraction selects written ketiv, not qere; combined cantillation once, not all
alternatives; special-letter words once, not their duplicate descriptions. It
excludes editorial notes, parashah letters, and inverted-nun symbols. The selected
source strings retain their marks without NFC or NFKC normalization. Layout roles
become spaces or are omitted. Only U+05D0 through U+05EA enter the search stream.

A string in a compiled verse is shared by all branches; where the source documents
different letter spellings, its three array entries represent standard, Chabad,
and MAM-base/Yemenite readings. Only standard is exposed by the UI and accepted in
saved results. These retained branches make the choice auditable, not automatic.

Each letter has a verse index and character offset into its selected source string.
References also include a 1-based letter position within the pasuk. All source
characters are in the BMP; offsets are UTF-16. `TorahELS.reference` exposes the map.
Final-letter folding changes comparison only, never the source or mapping.

Both JSON and normalized-letter SHA-256 fingerprints are checked before search is
enabled. A deliberate text update needs review of every changed letter, regenerated
provenance, and new pinned hashes in the HTML. Old links must not silently load
against a different text stream.

## Search, display and saved results

Defaults: 2 to 32 query letters, skips 1 to 100, both directions, exact final forms.
Allowed skip magnitude is 1 to 10,000. Skip +50 advances 50 letters, leaving 49 in
between. Negative skips move backward. Engine scope is `[from,to)`, with inclusive
pasuk endpoints in the UI. An entire-Torah search may cross sefer boundaries.

First-letter postings and end-bound checks reduce work. A preflight rejects over
50 million candidate checks. A worker stops at 15 seconds of scanning or 500 matches.
Progress includes partial batches. Every early stop is explicitly incomplete.
Cancel terminates the worker and ignores stale messages. Starting over clears results.

The search form includes a short getting-started prompt and a Basic instructions
panel. Each result card states "Every N letters" and its direction, sefer, perek
and pasuk. The selected result gives a large interval count, explains the number
of letters between hits, and explicitly labels the first and last matched pesukim.
The letter list shows every matched letter and its reference in word order,
including backward matches. Tapping a row opens the full selected pasuk and jumps
the grid window if necessary. This can clear extra words when the displayed range
changes, following the same window rule below. Finished searches open the selected
result; Change word and Choose another match provide navigation back to the form
and match list. A cancelled search does not move the page automatically.

Grid source order is right to left, then down. Width is 4 to 100; zoom 16 to 36 px;
context 0 to 1,000 letters on each side. Each rendered window contains at most 2,000
letters. Arrows and Next highlighted letter navigate long spans; visible-hit counts
state when only part of a match is displayed. Touch and keyboard inspection work.
Only the grid scrolls horizontally.

Up to 5 extra words search the currently displayed window, each with its own skips,
direction, color, and up to 100 matches. One selected match per word is highlighted.
Overlaps use two colors plus an outline. Changing the range/window clears extras;
zoom does not. Extras use the main result's final-letter setting.

Save exports JSON; Copy result link encodes the same state in a base64url fragment.
Opening either verifies version, text hash, scope, every matched letter, and grid
limits before replacing the display. Links open directly without rerunning a search.
They make no claim that the original search was exhaustive. Fragments are not sent
in HTTP requests. No browser storage is needed to open a saved file on another device.

Print shows the current window on white paper, fits wide grids to A4 width, and
lists all main-letter references, selected extra patterns, and the text fingerprint.
Reduce width/context for larger printed letters. Large windows can span pages.

## Verification

From `tests/`, with a root HTTP server on a fresh unused port:

```
CJ_BASE_URL=http://127.0.0.1:<fresh-port> npm run test:torah-codes
```

The engine suite checks every letter's source mapping and verse boundaries, hashes,
all 9 spelling choices, written ketiv, final forms, cross-pasuk matches, limits,
and randomized comparisons against an independent exhaustive algorithm.
Manually transcribed Bereishis 1:1 through 1:5 supply fixed fixtures:

| Torah letter | Letter | Pasuk | Position in pasuk |
| --- | --- | --- | --- |
| 6 | ת | Bereishis 1:1 | 6 |
| 56 | ו | Bereishis 1:2 | 28 |
| 106 | ר | Bereishis 1:4 | 3 |
| 156 | ה | Bereishis 1:5 | 8 |

תורה reads forward at +50 from letter 6. הרות reads backward at -50 from letter 156.
These verify the algorithm and references, with no claim of predictive significance.
Chromium checks 375x667, 393x852, 412x839 and 1280x900; expanded controls; RTL and
highlights; extra skips; source-corruption refusal; saved files/links and tampering;
print; long grids; cancellation; responsiveness; and portal iframe Back/Forward.
No console errors or horizontal document overflow are accepted.
