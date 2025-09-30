declare module 'cornerstone-core' {
  export interface Image {
    imageId: string;
    minPixelValue: number;
    maxPixelValue: number;
    slope: number;
    intercept: number;
    windowCenter: number;
    windowWidth: number;
    render: (enabledElement: EnabledElement, invalidated: boolean) => void;
    getPixelData: () => Uint8Array | Uint16Array | Int16Array | Float32Array;
    rows: number;
    columns: number;
    height: number;
    width: number;
    color: boolean;
    columnPixelSpacing?: number;
    rowPixelSpacing?: number;
    invert: boolean;
    sizeInBytes: number;
  }

  export interface EnabledElement {
    element: HTMLElement;
    image?: Image;
    viewport: {
      scale: number;
      translation: { x: number; y: number };
      voi: { windowWidth: number; windowCenter: number };
      invert: boolean;
      pixelReplication: boolean;
      rotation: number;
      hflip: boolean;
      vflip: boolean;
    };
    canvas: HTMLCanvasElement;
    invalid: boolean;
    needsRedraw: boolean;
  }

  export function enable(element: HTMLElement): void;
  export function disable(element: HTMLElement): void;
  export function displayImage(element: HTMLElement, image: Image): void;
  export function loadImage(imageId: string): Promise<Image>;
  export function getEnabledElement(element: HTMLElement): EnabledElement;
  export function setViewport(element: HTMLElement, viewport: Partial<EnabledElement['viewport']>): void;
  export function resize(element: HTMLElement, forceDraw?: boolean): void;
  export function reset(element: HTMLElement): void;
  export const events: {
    IMAGE_RENDERED: string;
    IMAGE_CACHE_IMAGE_ADDED: string;
    [key: string]: string;
  };
}

declare module 'cornerstone-wado-image-loader' {
  export const external: {
    cornerstone: typeof import('cornerstone-core');
    dicomParser: typeof import('dicom-parser');
  };

  export function configure(options: {
    useWebWorkers?: boolean;
    decodeConfig?: {
      convertFloatPixelDataToInt?: boolean;
      use16BitDataType?: boolean;
    };
  }): void;
}

declare module 'dicom-parser' {
  export interface DataSet {
    string(tag: string): string | undefined;
    uint16(tag: string): number | undefined;
    int16(tag: string): number | undefined;
    uint32(tag: string): number | undefined;
    int32(tag: string): number | undefined;
    float(tag: string): number | undefined;
    double(tag: string): number | undefined;
    numStringValues(tag: string): number;
    intString(tag: string): number | undefined;
    floatString(tag: string): number | undefined;
    attributeTag(tag: string): string | undefined;
    elements: { [key: string]: unknown };
  }

  export function parseDicom(byteArray: Uint8Array, options?: { untilTag?: string; vrCallback?: (vr: string) => boolean }): DataSet;
}