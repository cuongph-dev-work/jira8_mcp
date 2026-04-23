declare module "mammoth" {
  interface ExtractResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }

  interface Options {
    buffer?: Buffer;
    path?: string;
  }

  function extractRawText(options: Options): Promise<ExtractResult>;
  function convertToHtml(options: Options): Promise<ExtractResult>;

  export { extractRawText, convertToHtml };
}
