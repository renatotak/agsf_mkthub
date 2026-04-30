declare module '*.css' {}

// pdf-parse ships without type declarations; minimal ambient shim.
declare module 'pdf-parse' {
  interface PdfData {
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: Record<string, unknown> | null
    text: string
    version: string
  }
  type PdfOptions = {
    max?: number
    version?: string
    pagerender?: (pageData: unknown) => Promise<string>
  }
  function pdfParse(dataBuffer: Buffer, options?: PdfOptions): Promise<PdfData>
  export = pdfParse
}
