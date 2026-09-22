# Certificate font

`GeistVF.woff` is the same Geist font already used by the application in
`app/fonts/GeistVF.woff`. This copy is embedded (as a subset) in Academy PDFs to
preserve Polish characters. It is kept in `public/` because that directory is
explicitly copied into the standalone production image.

Do not replace this asset with a font lacking Polish glyphs. If the app font is
updated, update this copy together with it and re-run the PDF rendering checks.
