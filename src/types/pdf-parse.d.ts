declare module "pdf-parse" {
  interface Result {
    text: string;
    numpages?: number;
  }
  function pdfParse(data: Buffer): Promise<Result>;
  export default pdfParse;
}
