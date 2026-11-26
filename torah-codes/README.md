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

Defaults: 2 to 32 Hebrew letters per word, skips 1 to 100, both directions, exact final forms.
Allowed skip magnitude is 1 to 10,000. Skip +50 advances 50 letters, leaving 49 in
between. Negative skips move backward. Engine scope is `[from,to)`, with inclusive
pasuk endpoints in the UI. An entire-Torah search may cross sefer boundaries.

Spaces in the main query now separate independent words by default. For example,
`ישראל מאיר` searches for two patterns near one another, each with its own skip and
permitted direction. A visible selector retains the old continuous-sequence behavior.
The pure `queries` helper strips marks and punctuation per token and accepts 1 to 6
unique words of 2 to 32 Hebrew letters each. Whitespace alone separates words;
spaces never enter the searchable Torah or alter a letter index. Duplicate words,
including duplicates after optional final-letter folding, are rejected explicitly.

`searchTogether` scans the first word throughout the selected scope. For each of its
occurrences, it seeks every other word wholly within that first pattern's inclusive
letter span plus `nearby` letters on each side, clipped to the scope. Nearby defaults
to 100 and permits 0 to 1,000. Each word independently uses the entered skip range and
direction. Every returned group contains all input words. One representative match
per other word is retained in each area; all combinations are not enumerated.

The 500-result limit counts successful groups, not raw first-word occurrences. A rare
secondary name can therefore be found after more than 500 primary occurrences. The
worker tracks a combined 50 million actual candidate checks for all words and a single
15-second deadline, with progress, immediate Cancel and explicit partial outcomes.
The first-word preflight still rejects a plan over the work budget before it starts.
Result cards and the selected-area summary show every word's own skip, direction and
pasuk references. Independent color highlights preserve source glyphs exactly.

A fixed Previous result / Results / Next result bar remains available while scrolling.
It steps across list pages and follows the current additional-word filter. Its center
opens the list page containing the selected result. End buttons disable at the edges;
it hides before selection and for no matches, and disables while work is running.
Page padding keeps bottom content above the bar. Print CSS omits the controls.

First-letter postings and end-bound checks reduce work. A preflight rejects over
50 million candidate checks. A worker stops at 15 seconds of scanning or 500 matches.
Progress includes partial batches. Every early stop is explicitly incomplete.
Cancel terminates the worker and ignores stale messages. Starting over clears results.

The search form includes a short getting-started prompt and a Basic instructions
panel. Minimum and maximum skip inputs are always visible on the primary form,
starting at 1 and 100; only final-letter options are collapsed. Each result card states "Every N letters" and its direction, sefer, perek
and pasuk. The selected result gives a large interval count, explains the number
of letters between hits, and explicitly labels the first and last matched pesukim.
The letter list shows every matched letter and its reference in word order,
including backward matches. Tapping a row opens the full selected pasuk and jumps
the grid window if necessary. This can clear extra words when the displayed range
changes, following the same window rule below. Finished searches open the selected
result; Change word and Choose another match provide navigation back to the form
and match list. A cancelled search does not move the page automatically.

The passage view below the grid shows every pasuk containing a selected matching
letter once, with all hits highlighted, including selected additional words. It
uses the full match rather than just the current grid window. Show pesukim in
between includes every pasuk from the earliest to latest matched verse, always
in Torah order, even for a backward word. Text and nekudos are preserved exactly;
highlight spans include combining marks without normalizing the source.

Only 25 pesukim render per page; all remaining pesukim are available with Previous
and Next. The summary states the full count and displayed range. Clicking a letter
opens the right passage page as well as the grid window. A non-matching grid pasuk
can still be inspected in a separate, clearly labeled card, without adding it to
the matching count or coloring it as a match. Changing the passage page or context
checkbox does not change the grid or rerun the search. Source-page controls retain
focus while updating the displayed text.

Grid source order is right to left, then down. Width is 4 to 100; zoom 16 to 36 px;
context 0 to 1,000 letters on each side. Each rendered window contains at most 2,000
letters. Arrows and Next highlighted letter navigate long spans; visible-hit counts
state when only part of a match is displayed. Touch and keyboard inspection work.
Only the grid scrolls horizontally.

The additional-word scope is explicit. This displayed grid searches the current
window, supporting up to 5 extra words with independent skips, direction and color.
Changing that window clears these grid-only words; zoom does not.

All search results checks one additional word against every result received from
the current primary search, including results on other list pages. Each region
covers the primary word's complete first-to-last-letter span plus the current
context on each side, clipped to the initial search scope. It is not restricted to
the first rendered 2,000-letter window. The check runs in a worker, with a combined
50 million candidate budget, 15-second time budget, progress and immediate Cancel.
Up to 100 secondary matches are kept per region. Hitting that cap confirms a positive
region and does not prevent checking later regions. Unfinished regions are labeled
not fully checked rather than missing. The final-letter comparison follows the
primary search snapshot, and displayed source letters remain unmodified.

A completed check filters to positive results by default; Show only results with
the additional word can be unchecked to see the original list and individual result
badges. Choosing a result attaches its secondary matches, with a separate interval
and color. Show word in grid opens a distant secondary match. Full-area words survive
grid-page changes. Changing context invalidates the collection check. A new primary
search clears it. This collection is the current search, not a saved search history.
Ordinary grid-only words, full-area words and nearby-group words are distinguished
in saved results by an optional `scope` field. Nearby groups add optional `together`
metadata containing input words and the search distance, while keeping version 1
compatible with older files. Every group member must match its declared word, color,
source letters and the original first-word search region before any UI state changes.
The grid bounds encompass every group member even with zero visual context. Changing
grid context or pages preserves the original group. Group words cannot be removed
from an existing result; the main query changes the searched names.

Restoring a full-area word verifies its exact letters
against the full result area rather than just the displayed window. A saved link
still represents one selected result or pair, not an entire result collection.

One selected match per word is highlighted; overlaps use two colors and an outline.

Save exports JSON; Copy result link encodes the same state in a base64url fragment.
Opening either verifies version, text hash, scope, every matched letter, and grid
limits before replacing the display. Links open directly without rerunning a search.
The optional `passages` object saves the between-pesukim setting and passage page.
Its types and bounds are validated before restoring; older files without it open
with matching pesukim only. They make no claim that the original search was exhaustive. Fragments are not sent
in HTTP requests. No browser storage is needed to open a saved file on another device.

Print defaults to the word, skip/direction, start/end references, displayed page of
full pesukim with marked letters, and each main letter's reference. The surrounding
letter grid, its range caption and legend are omitted so a small-skip result does
not fill the paper with a tall column of context letters. The screen grid and its
context settings are preserved.

Include letter grid when printing is an explicit opt-in checkbox above the print
button. It adds the current grid window and legend, fitting wide grids to paper;
that optional full context can span pages. The app button and the browser's own
print command use the same setting through print CSS and `beforeprint`. The checkbox
defaults off on page load and is not stored as part of a saved pattern.

Print all results builds one separate print document from every result in the
current list, including paginated results. If the additional-word filter is on,
its count and positive subset are used. Each entry has its own signed skip,
direction, start/end references and all matching pesukim; paired results include
the selected secondary match too. There is no surrounding grid in this bulk report.
The original search's incomplete/capped status and any incomplete secondary check
remain explicit. Negative and unchecked secondary regions are distinguished.
Preparation yields between small chunks and can be cancelled before opening the
single native print dialog. It does not alter the selected result, grid or input
fields. Print this result and browser-menu printing use the selected-result layout;
bulk mode is reset after printing or on a new result selection/search. A saved
result containing just one match can only print that received match.

Printing uses white paper and black text. The passage summary identifies the page
and full verse count so a long passage is never presented as complete in print.
The reported שפרא match at skip +3, Bereishis 12:11 letters 51 through 60, fits one
Letter or A4 page without the optional grid, even with 100 screen-context letters
on each side. The print suite verifies the actual generated PDF page count.

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
