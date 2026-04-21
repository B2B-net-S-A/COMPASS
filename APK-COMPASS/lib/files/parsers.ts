import PDFParser from 'pdf2json'
import mammoth from 'mammoth'

export async function parseBuffer(buffer: Buffer, type: string, fileName: string = ''): Promise<string> {
    if (type === 'application/pdf') {
        // @ts-expect-error PDFParser constructor
        const parser = new PDFParser(null, 1) // 1 = text only

        return new Promise((resolve, reject) => {
            parser.on('pdfParser_dataError', (errData: unknown) => {
                console.error('PDF Parser Error:', errData)
                reject(new Error((errData as { parserError?: string })?.parserError ?? 'PDF parse error'))
            })
            parser.on('pdfParser_dataReady', () => {
                const text = parser.getRawTextContent()
                console.log('PDF Extracted Text Length:', text.length)
                if (text.length < 100) console.warn('PDF Text Warning: Extracted text is very short:', text)
                resolve(text)
            })

            try {
                parser.parseBuffer(buffer)
            } catch (e) {
                console.error('PDF ParseBuffer Exception:', e)
                reject(e)
            }
        })
    }

    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer })
        return result.value
    }

    if (type === 'application/msword' || fileName.endsWith('.doc')) {
        throw new Error('Format .doc (Word 97-2003) nie jest obsługiwany. Proszę zapisać plik jako .docx lub PDF.')
    }

    throw new Error(`Nieobsługiwany format pliku: ${type} (Wymagane: .docx lub .pdf)`)
}

export async function parseFile(file: File): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer())
    return parseBuffer(buffer, file.type, file.name)
}
