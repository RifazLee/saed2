declare module 'utif' {
  export interface IFD {
    width: number;
    height: number;
    pixels?: Uint8Array | Uint16Array;
    [key: string]: any;
  }
  export function decode(buffer: Uint8Array): IFD[];
  export function decodeImage(buffer: Uint8Array, ifd: IFD): void;
  export function decodePixels(buffer: Uint8Array, ifd: IFD): void;
  export function toRGBA8(ifd: IFD): Uint8Array;
}
