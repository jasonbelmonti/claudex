declare module "picomatch" {
  export type PicomatchMatcher = (value: string) => boolean;

  export type PicomatchOptions = {
    dot?: boolean;
  };

  export default function picomatch(
    pattern: string,
    options?: PicomatchOptions,
  ): PicomatchMatcher;
}
