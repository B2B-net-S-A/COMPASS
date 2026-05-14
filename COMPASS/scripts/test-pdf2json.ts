
// @ts-ignore
import PDFParser from 'pdf2json'

async function run() {
    try {
        // Minimal PDF Buffer (Empty page)
        const pdfBuffer = Buffer.from('%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj 4 0 obj<</Length 21>>stream\nBT/F1 12 Tf 1 0 0 1 1 1 Tm(Hello World)Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n0000000216 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n291\n%%EOF')

        console.log('Testing pdf2json with buffer...')

        // @ts-ignore
        const parser = new PDFParser(null, 1)

        await new Promise((resolve, reject) => {
            parser.on('pdfParser_dataError', (errData: any) => reject(new Error(errData.parserError)))
            parser.on('pdfParser_dataReady', () => {
                console.log('Parser Ready!')
                const text = parser.getRawTextContent()
                console.log('Extracted Text:', text)
                resolve(text)
            })
            parser.parseBuffer(pdfBuffer)
        })

    } catch (error) {
        console.error('Error:', error)
    }
}

run()
