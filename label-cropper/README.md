# PDF Label Cropper

Static tool at `/label-cropper/`, linked from the portal's Tools tab. PDF bytes
stay in browser memory. There is no upload service, account, stored label or
document-processing API. A separate printer-image export is available for apps
that lose detail while converting a PDF for a thermal printer.

Choose a PDF, review the labels suggested across every source page, and download
or share one PDF with each included label on its own true 4x6-inch (288x432 point)
or 6x4-inch (432x288 point) page. Review label and the previous/next buttons move
between labels, including multiple labels on the same page. Include this label
controls which labels are exported. Size applies to the entire output, while
rotation and crop are remembered independently per label. Open PDF opens the PDF
viewer for printing. The primary mobile flow is Download PDF, then 4Barcode's
PDF Printing option. Native file sharing appears when the browser supports it.
Printing still depends on matching paper dimensions, actual-size settings, the
printing app, original image resolution and the printer itself.

The 4Barcode images button opens a printing route using 4Barcode's Pictures
Printing instead of its PDF Printing conversion. Select the printer's actual
203, 300 or 600 dpi resolution (203 is the common default). Each included label
is rendered directly from the finished original-content PDF at that resolution,
never from the lower-resolution screen preview. A 4x6 label at 203 dpi is exactly
812x1218 pixels; at 300 dpi it is 1200x1800. Landscape swaps the dimensions.
PNG pHYs metadata records the selected resolution and physical print size.
There is no JPEG step. Increasing the setting cannot add source detail.

Black & white is intended for thermal labels: pixels are thresholded at 128
using sRGB luminance weights to avoid gray-edge dithering. CompressionStream
produces a lossless, one-bit grayscale PNG; browsers without it use a lossless
eight-bit PNG with the same black/white pixels. Keep original shades preserves
the rendered colors and grays in an eight-bit PNG. This raster export does not
alter or replace the original-content PDF download. Fine detail is ultimately
limited by the selected printer's dots, original document and printing app.

One image downloads as a PNG. Multiple included labels download once as a ZIP
containing ordered PNGs, with UTF-8 names and CRC-32 checks. Extract the ZIP in
My Files, then choose the PNGs in 4Barcode's Pictures Printing and match the
paper size without another crop/stretch. The ZIP stores each already-compressed
PNG unchanged. Image jobs use a copy of the PDF bytes and cancel stale downloads
if the labels, size, DPI or image style change during rendering. Decoded pages
and canvas storage are released between images. There are no additional libraries
or network uploads in this route. Its files and browser flow were verified;
physical output in the owner's printer cannot be measured from this workspace.

The main file picker filters for PDFs. Browse all files opens an unfiltered picker
for Android providers that hide a PDF because of its file metadata. Both paths
use the same PDF parser and original-content export. On-device help also explains
how to find Recent or save a copy into Internal storage / Download if the file
is in a different folder. A web page cannot control which files Android providers
expose in the native picker.

The output is generated from the original PDF pages with pdf-lib's `embedPages`.
The crop becomes a clipped PDF Form XObject, centered and proportionally scaled
on the new sheet. Text and vector paths stay PDF content; image streams retain
their original compressed bytes. The screen canvas is only a preview and is
never used to generate the downloadable PDF. No JPEG conversion, image
downsampling, sharpening or barcode reconstruction is introduced. One embedding
operation shares source images and fonts across the new pages, so splitting one
source sheet does not copy its image resources again for every label.

This is visual cropping, not redaction: a clipped source-page content stream
and its resources may retain content outside the visible crop. The tool does
not promise to improve a low-resolution original or guarantee scanner/physical
printer performance.

Crop coordinates use PDF.js's displayed viewport. All four corners convert back
to PDF coordinates, which handles existing CropBox offsets and page rotation.
Output rotation combines the source page's rotation with the chosen clockwise
turn. Geometry tests independently check all quarter-turn layouts for containment,
centering and equal horizontal/vertical scale.

Detection is a suggestion: it scans all pages for label-shaped images and also
recognizes already cropped label-shaped pages, including vector PDFs. It handles
repeated images and inline-image groups, keeps distinct positions even if the
image is identical, deduplicates overlapping candidates, and orders labels by
source page, top edge and left edge. Candidate bounds are intersected with the
visible source page, so images retained outside an earlier crop do not become
extra labels when a cropper-generated PDF is opened again. Candidates have a long/short ratio within
0.16 of 1.5, a short edge over 24 points and area over 0.5% of the source page.
A label-shaped page is kept whole unless it has multiple image candidates.
Long, narrow authorization barcodes are not treated as complete shipping labels.

This is a geometric heuristic. Multiple vector labels on a larger sheet, labels
inside a single scan of an entire sheet, unusual proportions or very small
images may need manual selections. Pages with no saved labels have visible
Review page buttons; no page is silently treated as successfully recognized.
The page note distinguishes a scan failure from an ordinary missing match.
Add label starts a manual crop on the selected source page. Done saves it as
another label; Cancel discards the draft and restores the previous selection.
A file with no detected labels stays reviewable, with export disabled until a
label is explicitly added. No arbitrary page-count or label-count cap is applied;
the existing 50 MiB file limit and the device's memory still apply. Page scans
run sequentially with visible progress and release decoded page images afterward.

Every automatic selection starts locked, with no resize
handles. Taps, drags and arrow keys cannot change it, and normal touch scrolling
is allowed. Adjust crop explicitly enables drawing, moving, resizing, arrow-key
nudges and percentage bounds. Done keeps the edits and locks the selection;
Cancel restores the crop and status from before that editing session. Whole page
is available while editing. Find label restores that label's initial selection and
locks it. Changing a label or source page keeps saved crops and exits editing;
an unfinished Add label draft is discarded. Preview and output updates are debounced; stale builds
cannot enable downloading the previous crop. Replacing a file destroys the prior
PDF.js loading task, not the document proxy.

The user's two reference files were tested from private attachment paths. Both
exports are exactly one 4x6 page. An independent PyMuPDF check confirmed the
1800x1200 label image's compressed stream hash is identical before and after.
An independent ZXing Code 128 check also decoded identical barcode contents from
the original-content PDF and both 203 dpi and 300 dpi printer PNG samples.
The references and their output labels are not committed to the public site.

Dependencies in `vendor/`:

- Mozilla PDF.js 6.5.438 legacy modules, standard fonts and WASM resources, copied
  from the owner's existing zmanim-tool vendor package. Apache 2.0 plus the
  included font and WASM component licenses are retained.
- pdf-lib 1.17.1 UMD bundle, MIT license retained.
- Predefined CJK character maps, if required by a document, are fetched from the
  pinned PDF.js package on jsDelivr. These requests contain character-map names,
  not document bytes. Core code, workers, standard fonts and WASM are local.

PDF.js scripting is not enabled, and `isEvalSupported` is false. PDF document
links and annotations are not rendered as active browser controls. Inputs larger
than 50 MiB and encrypted PDFs receive a visible error. No PDF bytes or file names
are persisted in local storage.

Printable form widgets or notes intersecting any included label are detected before export,
including labels on a source page other than the one currently shown.
The tool requests a flattened/printed-to-PDF copy rather than silently omit that
visible information. Ordinary PDF page content and shipping-label images are
preserved directly. Link annotations do not block cropping.

Serve the repository on a fresh port and run `npm run test:labels` in `tests/`
with `CJ_BASE_URL` set. The suite generates non-personal fixtures with instructions,
multiple pages, nonzero page boxes and rotation. It checks exact output dimensions,
original image hashes across all rotations, locked accidental touches and native
scrolling, explicit touch/keyboard editing, Done/Cancel/Find label restoration,
the unfiltered native chooser with an uppercase PDF and generic MIME type, input
errors/replacement, mobile geometry, portal navigation and no upload requests.
The batch suite checks two labels on one sheet, mixed raster and vector labels
across pages, rotated crop boxes, a grid of nine small repeated labels, exact
output page counts, rendered color separation and page order, original image
streams, shared resources, per-label crop/rotation persistence, exclusions,
zero included labels, manual additions/cancellation, scan misses, printable fields
on a later label, rapid rendering cancellation and four viewport sizes.
The printer suite checks that a native-resolution fixture's alternating one-dot
barcode bars survive in the exported PNG, independently of the screen preview.
It validates PNG signatures, chunk CRCs, exact dimensions and DPI metadata,
one-bit pixels, preserved gray values, the browser fallback, 203/300/600 dpi,
ordered UTF-8 ZIP entries, inclusion, landscape output, all four viewports and
an actual PNG download from the portal iframe. These are file/pixel checks, not
a claim that a specific physical printer has been tested.
To additionally test private PDFs, set `CJ_LABEL_SAMPLE_CONFIG` to a local JSON file
containing their paths. Never copy personal labels into the public repository.
