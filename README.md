# Box Grid Capacity Calculator · 箱內排列容量試算

A small bilingual calculator for identical rectangular items in a box. Enter usable inner box dimensions, one item's dimensions and the gap between adjacent items. Compare one original orientation or six axis-aligned uniform grids.

This estimates one uniform orientation at a time. It does not mix orientations, optimize remaining space, check weight or shape, or guarantee a physical fit. The gap applies only between adjacent items, without wall or floor clearance. Inputs stay in the current page's memory; the first visit still needs to load the site files. There is no account, history, copy, download, analytics, remote font or runtime dependency.

## Run and check

Use Node.js 24 or newer. No package installation is needed.

```sh
npm test
npm run check
npm run build
npm run dev
```

The noindex preview binds to loopback port 4213. Chinese is `/index.html`; English is `/en/index.html`. Initial dimensions are blank, the gap is 0, and rotation is enabled. Editing immediately removes the previous result. Clear and language changes confirm before discarding work.

```sh
npm run build:production
npm run check:production
npm run release:check
npm run preview:production
```

Production output is isolated in `dist-production/`; its deterministic manifest is the sibling `dist-production.manifest.json`, outside the deployable asset directory. The production HTTP model binds only to loopback port 5213. It checks the generated assets, security headers, exact JSON-LD CSP hashes, robots rules, reciprocal language metadata, canonical redirects and real 404 responses. The model deliberately uses exact paths; CDN query handling and live headers require separate hosting acceptance.

The configured production origin is `https://boxfit.glossquote.com`. This source release does not establish that hosting has been deployed or verified. Hosting is a separate release stage. The static-assets-only configuration has no Worker script, binding, secret, observability or paid service.

## Exact calculation

The only calculation entry is `calculateBoxFit(request)` in `public/js/core/calculate-box-fit.js`:

```js
calculateBoxFit({
  boxLengthRaw: '10', boxWidthRaw: '8', boxHeightRaw: '6',
  itemLengthRaw: '3', itemWidthRaw: '2', itemHeightRaw: '2',
  gapRaw: '0', allowRotation: false
});
```

The dimensions are ASCII strings, at most 12 characters, with up to two decimal places. Box and item dimensions range from 0.01 to 100000.00 mm; the gap ranges from 0 to 10000.00 mm. Validation rejects unknown fields, accessors, symbols and malformed input without echoing the raw value. Each axis count is `floor((box + gap) / (item + gap))`, calculated with BigInt in hundredth-millimetre units. Totals remain exact decimal strings up to 10²¹. Rotation compares LWH, LHW, WLH, WHL, HLW and HWL in that order, preserving tied rows and selecting the earliest positive maximum. No-fit results have no winner or occupied dimensions.

The offline test suite includes independent handwritten core oracles, hostile schema cases, input preservation, safe integer bounds, actual loopback HTTP checks, robots longest-match rules, header merging/removal and artifact integrity. The frozen M1 runtime hashes in `release/m1-public-hashes.json` prevent production packaging from changing the calculator's behavior.

## Verification limits

Previously recorded bilingual UI checks cover the main calculation, six orientations, ties, no fit, errors, edit invalidation, clear/language confirmation and 320 CSS px reflow. Local interactive browser automation is paused after a user focus/IME incident. Subsequent UI checks remain `NOT_RUN_USER_FOCUS_INCIDENT`; hidden tabs are not proof of input isolation. Native zoom, real mobile keyboards, assistive technology, full browser Network/Storage, real BFCache, offline cold starts and physical packing are not asserted as passed. Synthetic lifecycle-handler checks are not real BFCache evidence.

繁中：這是單一朝向均勻格估算。並非混合排列或實物裝箱保證；來源公開與正式網站上線分開驗收。
