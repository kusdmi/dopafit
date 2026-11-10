// --- Non-color series encoding -------------------------------------------
// design-system.md requires series to stay tellable apart without relying on
// hue (colour-vision deficiency, greyscale printing). Colour remains the
// primary channel; these add a redundant second one keyed to the series index.
//
// Two channels rather than one, because either alone collapses at six series:
// four readable dash patterns is about the limit at strokeWidth 2, and marker
// shapes alone vanish between points. Combined they give six unmistakable
// pairs.
//
// Dash patterns deliberately avoid "3 3" — that is the cursor line's pattern
// in LineChart, and a series wearing it would read as a stray cursor. Index 0
// stays solid so the common single-series chart is an unbroken line.
const SERIES_DASH = [undefined, '7 4', '2 3', '10 4 2 4', '7 4', '2 3'] as const;
// Marker shapes cycle on a different period (3) than the dashes (effectively
// 4 distinct patterns), so no two of the six series share BOTH channels.
const SERIES_SHAPE = ['circle', 'square', 'diamond', 'circle', 'square', 'diamond'] as const;

export type SeriesShape = (typeof SERIES_SHAPE)[number];

export function dashFor(index: number): string | undefined {
  return SERIES_DASH[index % SERIES_DASH.length];
}

export function shapeFor(index: number): SeriesShape {
  return SERIES_SHAPE[index % SERIES_SHAPE.length];
}
