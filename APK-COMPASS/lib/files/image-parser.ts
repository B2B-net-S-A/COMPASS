
// Image Parser Utility
import mammoth from 'mammoth'

export async function extractImagesFromDocx(buffer: Buffer): Promise<Buffer | null> {
    let bestImage: Buffer | null = null;
    let maxSize = 0;

    const options = {
        convertImage: mammoth.images.imgElement(function (image) {
            return image.read().then(function (imageBuffer) {
                // Heuristic: Candidate photos are usually significant in size but not huge background images
                // We'll look for the largest image that is likely a photo (> 5KB)
                if (imageBuffer.length > 5 * 1024 && imageBuffer.length > maxSize) {
                    maxSize = imageBuffer.length;
                    bestImage = imageBuffer;
                }
                return { src: "data:image/png;base64," }; // Placeholder, we don't need the HTML
            });
        })
    };

    await mammoth.convertToHtml({ buffer: buffer }, options);

    return bestImage;
}

import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

export async function extractImagesFromPdf(buffer: Buffer): Promise<Buffer | null> {
    try {
        const pdfDoc = await PDFDocument.load(buffer);
        let bestImage: Buffer | null = null;
        let maxSize = 0;

        // Iterate through all indirect objects to find Images
        const objects = pdfDoc.context.enumerateIndirectObjects();

        for (const [, obj] of objects) {
            // We are looking for PDFStream/PDFRawStream that are XObjects of subtype Image
            if (obj instanceof PDFRawStream) {
                const dict = obj.dict;

                // Check if it's an Image XObject
                if (dict.get(PDFName.of('Type')) === PDFName.of('XObject') &&
                    dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {

                    const filter = dict.get(PDFName.of('Filter'));

                    // Support JPEG (DCTDecode)
                    // Filter can be a name or an array of names
                    const isJpeg = filter === PDFName.of('DCTDecode') ||
                        (Array.isArray(filter) && filter.includes(PDFName.of('DCTDecode')));

                    if (isJpeg) {
                        try {
                            const imageBuffer = obj.contents;
                            if (imageBuffer && imageBuffer.length > 5 * 1024) { // Filter small icons (> 5KB)
                                if (imageBuffer.length > maxSize) {
                                    maxSize = imageBuffer.length;
                                    bestImage = Buffer.from(imageBuffer);
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to extract JPEG buffer:', e)
                        }
                    }
                }
            }
        }

        return bestImage;

    } catch (error) {
        console.error("Error extracting from PDF", error);
        return null;
    }
}
