
// @ts-nocheck
import pdf from 'pdf-parse'
import fs from 'fs'
import path from 'path'

async function run() {
    try {
        // Create a dummy PDF buffer or load one if exists. 
        // Since I don't have a PDF, I will try to use a minimal valid PDF header
        const pdfBuffer = Buffer.from('%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj 4 0 obj<</Length 21>>stream\nBT/F1 12 Tf 1 0 0 1 1 1 Tm(Hello World)Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n0000000216 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n291\n%%EOF')

        console.log('Testing pdf-parse with buffer...')
        const data = await pdf(pdfBuffer)
        console.log('Success:', data.text)

    } catch (error) {
        console.error('Error:', error)
    }
}

run()
