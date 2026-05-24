import React, { useEffect, useRef } from 'react';
import { api } from '../bridge/api';

interface VideoCanvasProps {
  siteId: string;
  width?: number;
  height?: number;
}

export const VideoCanvas: React.FC<VideoCanvasProps> = ({ siteId, width = 1280, height = 720 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const pendingFrameRef = useRef<{ data: Uint8Array; w: number; h: number } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Try WebGL first, fallback to 2D
    const gl = canvas.getContext('webgl');
    if (gl) {
      glRef.current = gl;
      initWebGL(gl);
    }

    const cleanup = api.onVideoFrame(siteId, (frame) => {
      pendingFrameRef.current = {
        data: new Uint8Array(frame.data as unknown as ArrayBuffer),
        w: frame.width,
        h: frame.height,
      };
    });

    function renderLoop() {
      rafRef.current = requestAnimationFrame(renderLoop);
      const frame = pendingFrameRef.current;
      if (!frame) return;
      pendingFrameRef.current = null;

      if (glRef.current && textureRef.current) {
        renderWebGL(glRef.current, frame.data, frame.w, frame.h);
      } else {
        render2D(canvas!, frame.data, frame.w, frame.h);
      }
    }

    rafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cleanup();
      cancelAnimationFrame(rafRef.current);
    };
  }, [siteId]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
};

function initWebGL(gl: WebGLRenderingContext): { program: WebGLProgram; texture: WebGLTexture } | null {
  const vsSource = `
    attribute vec2 a_pos;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      gl_Position = vec4(a_pos, 0, 1);
      v_uv = a_uv;
    }
  `;
  const fsSource = `
    precision mediump float;
    uniform sampler2D u_tex;
    varying vec2 v_uv;
    void main() {
      vec4 c = texture2D(u_tex, v_uv);
      // NDI receiver outputs BGRA; WebGL uploads as RGBA → swap R and B
      gl_FragColor = vec4(c.b, c.g, c.r, c.a);
    }
  `;

  function compile(type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  const verts = new Float32Array([
    -1, -1, 0, 1,
     1, -1, 1, 1,
    -1,  1, 0, 0,
     1,  1, 1, 0,
  ]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'a_pos');
  const aUv = gl.getAttribLocation(program, 'a_uv');
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return { program, texture };
}

function renderWebGL(gl: WebGLRenderingContext, data: Uint8Array, w: number, h: number): void {
  gl.bindTexture(gl.TEXTURE_2D, gl.getParameter(gl.TEXTURE_BINDING_2D));
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function render2D(canvas: HTMLCanvasElement, data: Uint8Array, w: number, h: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // NDI receiver outputs BGRA; swap R and B for canvas (RGBA)
  const rgba = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    rgba[i]     = data[i + 2]; // R ← B
    rgba[i + 1] = data[i + 1]; // G
    rgba[i + 2] = data[i];     // B ← R
    rgba[i + 3] = data[i + 3]; // A
  }
  const imageData = new ImageData(rgba, w, h);
  canvas.width = w;
  canvas.height = h;
  ctx.putImageData(imageData, 0, 0);
}
