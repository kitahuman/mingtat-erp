'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * Wrapper around react-signature-canvas that properly forwards ref methods.
 *
 * next/dynamic with { ssr: false } uses useImperativeHandle internally and
 * overrides the ref with { retry }, so direct ref access to the underlying
 * SignatureCanvas class instance is lost.
 *
 * This wrapper solves the problem by:
 * 1. Being a normal client component (no dynamic import needed for this file)
 * 2. Using useImperativeHandle to explicitly expose clear/isEmpty/etc.
 * 3. Only rendering the canvas on the client side (checking typeof window)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ReactSignatureCanvas: any = null;

interface SignatureCanvasWrapperProps {
  canvasProps?: React.CanvasHTMLAttributes<HTMLCanvasElement> & { style?: React.CSSProperties };
  penColor?: string;
  backgroundColor?: string;
  clearOnResize?: boolean;
  onEnd?: () => void;
  onBegin?: () => void;
}

export interface SignatureCanvasRef {
  clear: () => void;
  isEmpty: () => boolean;
  getTrimmedCanvas: () => HTMLCanvasElement;
  toDataURL: (type?: string, encoderOptions?: number) => string;
  fromDataURL: (dataURL: string, options?: object) => Promise<void>;
  getCanvas: () => HTMLCanvasElement;
  toData: () => any[];
  fromData: (pointGroups: any[]) => void;
}

const SignatureCanvasWrapper = forwardRef<SignatureCanvasRef, SignatureCanvasWrapperProps>(
  (props, ref) => {
    const internalRef = useRef<any>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
      // Dynamically import on client side only
      import('react-signature-canvas').then((mod) => {
        ReactSignatureCanvas = mod.default || mod;
        setMounted(true);
      });
    }, []);

    useImperativeHandle(ref, () => ({
      clear: () => {
        internalRef.current?.clear();
      },
      isEmpty: () => {
        return internalRef.current?.isEmpty() ?? true;
      },
      getTrimmedCanvas: () => {
        return internalRef.current?.getTrimmedCanvas();
      },
      toDataURL: (type?: string, encoderOptions?: number) => {
        return internalRef.current?.toDataURL(type, encoderOptions);
      },
      fromDataURL: (dataURL: string, options?: object) => {
        return internalRef.current?.fromDataURL(dataURL, options);
      },
      getCanvas: () => {
        return internalRef.current?.getCanvas();
      },
      toData: () => {
        return internalRef.current?.toData() ?? [];
      },
      fromData: (pointGroups: any[]) => {
        internalRef.current?.fromData(pointGroups);
      },
    }));

    if (!mounted || !ReactSignatureCanvas) {
      // Render a placeholder with the same dimensions
      const style = props.canvasProps?.style || {};
      return (
        <div
          style={{ width: '100%', height: '120px', ...style }}
          className={props.canvasProps?.className}
        />
      );
    }

    const Component = ReactSignatureCanvas;
    return <Component ref={internalRef} {...props} />;
  }
);

SignatureCanvasWrapper.displayName = 'SignatureCanvasWrapper';

export default SignatureCanvasWrapper;
