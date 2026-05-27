import React, { useEffect, useRef } from 'react';
import { api } from '../bridge/api';

interface VideoCanvasProps {
  siteId: string;
  width?: number;
  height?: number;
}

export const VideoCanvas: React.FC<VideoCanvasProps> = ({ siteId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef  = useRef<WebGLState | null>(null);
  const pendingRef = useRef<{ data: Uint8Array; w: number; h: number } | null>(null);
  const rafRef     = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGL を試みる。失敗したら 2D フォールバック
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: false });
    if (gl) {
      const s = initWebGL(gl);
      if (s) stateRef.current = s;
    }

    // フレーム受信
    const unsub = api.onVideoFrame(siteId, (frame) => {
      let data: Uint8Array;
      if (frame.data instanceof Uint8Array) {
        data = frame.data;
      } else {
        // IPC 経由で ArrayBuffer として届く場合
        data = new Uint8Array(frame.data as unknown as ArrayBuffer);
      }
      if (data.byteLength === 0) return;
      pendingRef.current = { data, w: frame.width, h: frame.height };
    });

    // レンダーループ
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const f = pendingRef.current;
      if (!f) return;
      pendingRef.current = null;

      if (stateRef.current) {
        renderWebGL(stateRef.current, f.data, f.w, f.h);
      } else {
        render2D(canvas!, f.data, f.w, f.h);
      }
    }
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      unsub();
      cancelAnimationFrame(rafRef.current);
    };
  }, [siteId]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  );
};

// ── WebGL ──────────────────────────────────────────────────

interface WebGLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  uTex: WebGLUniformLocation;
}

function initWebGL(gl: WebGLRenderingContext): WebGLState | null {
  try {
    // 頂点シェーダー: フルスクリーン quad
    const vs = compileShader(gl, gl.VERTEX_SHADER, `
      attribute vec2 a_pos;
      attribute vec2 a_uv;
      varying vec2 v_uv;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
        v_uv = a_uv;
      }
    `);
    // フラグメントシェーダー: BGRA → RGBA スワップ
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D u_tex;
      varying vec2 v_uv;
      void main() {
        vec4 c = texture2D(u_tex, v_uv);
        gl_FragColor = vec4(c.b, c.g, c.r, c.a);
      }
    `);
    if (!vs || !fs) return null;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[WebGL] link error:', gl.getProgramInfoLog(program));
      return null;
    }
    gl.useProgram(program);

    // 頂点バッファ (xy, uv)
    const verts = new Float32Array([
      -1, -1,  0, 1,
       1, -1,  1, 1,
      -1,  1,  0, 0,
       1,  1,  1, 0,
    ]);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(program, 'a_pos');
    const aUv  = gl.getAttribLocation(program, 'a_uv');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv,  2, gl.FLOAT, false, 16, 8);

    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uTex = gl.getUniformLocation(program, 'u_tex')!;
    gl.uniform1i(uTex, 0);

    return { gl, program, texture, uTex };
  } catch (e) {
    console.error('[WebGL] init error:', e);
    return null;
  }
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[WebGL] shader error:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

function renderWebGL(s: WebGLState, data: Uint8Array, w: number, h: number): void {
  const { gl, texture } = s;
  const canvas = gl.canvas as HTMLCanvasElement;

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ── 2D フォールバック ───────────────────────────────────────

function render2D(canvas: HTMLCanvasElement, data: Uint8Array, w: number, h: number): void {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // BGRA → RGBA スワップ
  const rgba = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    rgba[i]     = data[i + 2];
    rgba[i + 1] = data[i + 1];
    rgba[i + 2] = data[i];
    rgba[i + 3] = data[i + 3];
  }
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
}
