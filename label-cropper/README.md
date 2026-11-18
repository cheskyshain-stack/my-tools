# PDF Label Cropper

Static tool at `/label-cropper/`, linked from the portal's Tools tab. PDF bytes
stay in browser memory. There is no upload service, account, stored label, image
export or document-processing API.

Choose a PDF and page, review the suggested crop, and download or share a true
4x6-inch (288x432 point) or 6x4-inch (432x288 point) PDF. Open PDF opens the PDF
viewer for printing. The primary mobile flow is Download PDF, then 4Barcode's
PDF Printing option. Native file sharing appears when the browser supports it.
Printing still depends on matching paper dimensions, actual-size settings, the
printing app, original image resolution and the printer itself.

The output is generated from the original PDF page with pdf-lib's `embedPage`.
The crop becomes a clipped PDF Form XObject, centered and proportionally scaled
on the new sheet. Text and vector paths stay PDF content; image streams retain
their original compressed bytes. The screen canvas is only a preview and is
never used to generate the downloadable PDF. No JPEG conversion, image
downsampling, sharpening or barcode reconstruction is introduced.

This is visual cropping, not redaction: a clipped source-page content stream
and its resources may retain content outside the visible crop. The tool does
not promise to improve a low-resolution original or guarantee scanner/physical
printer performance.

Crop coordinates use PDF.js's displayed viewport. All four corners convert back
to PDF coordinates, which handles existing CropBox offsets and page rotation.
Output rotation combines the source page's rotation with the chosen clockwise
turn. Geometry tests independently check all quarter-turn layouts for containment,
centering and equal horizontal/vertical scale.

Find label is a suggestion: it selects a label-shaped image or an already cropped
label-shaped page. It does not select a long, narrow authorization barcode as the
shipping label. Otherwise the page stays selected and a persistent message asks
for manual cropping. Users can draw, move or resize the selection with a pointer
or touch, nudge it with arrow keys, and enter percentage bounds. Whole page and
Find label reset the crop. Preview and output updates are debounced; stale builds
cannot enable downloading the previous crop. Replacing a file destroys the prior
PDF.js loading task, not the document proxy.

The user's two reference files were tested from private attachment paths. Both
exports are exactly one 4x6 page. An independent PyMuPDF check confirmed the
1800x1200 label image's compressed stream hash is identical before and after.
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

Printable form widgets or notes intersecting the crop are detected before export.
The tool requests a flattened/printed-to-PDF copy rather than silently omit that
visible information. Ordinary PDF page content and shipping-label images are
preserved directly. Link annotations do not block cropping.

Serve the repository on a fresh port and run `npm run test:labels` in `tests/`
with `CJ_BASE_URL` set. The suite generates non-personal fixtures with instructions,
multiple pages, nonzero page boxes and rotation. It checks exact output dimensions,
original image hashes across all rotations, touch and keyboard selection, input
errors/replacement, mobile geometry, portal navigation and no upload requests.
To additionally test private PDFs, set `CJ_LABEL_SAMPLE_CONFIG` to a local JSON file
containing their paths. Never copy personal labels into the public repository.
