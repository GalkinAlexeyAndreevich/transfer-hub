export abstract class FilesService {
  abstract upload(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void>;
  abstract remove(key: string): Promise<void>;
}
