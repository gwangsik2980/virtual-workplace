/**
 * 가벼운 모드.
 * 크롬의 그래픽 가속이 꺼져 있으면(chrome://gpu "Software only") 화면을 CPU로 그려서,
 * 카드 등장 효과·부드러운 스크롤·헤더 흐림이 한꺼번에 돌 때 버벅인다.
 * 그런 브라우저를 알아채서 무거운 효과를 끈다. 가속이 켜진 브라우저는 지금과 똑같이 보인다.
 *
 * 알아채는 방법: WebGL이 알려 주는 그래픽 장치 이름이 소프트웨어 렌더러이거나, WebGL을 아예 못 쓰면 가벼운 모드.
 * 강제로 바꾸기: localStorage 'virtual-workplace/lite'에 'on' 또는 'off' (화면 확인·테스트용).
 */

const KEY = 'virtual-workplace/lite';
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i;

function forced(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null;
  }
}

function softwareRendering(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return SOFTWARE.test(name);
  } catch {
    return false;
  }
}

function detect(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  return forced() ?? softwareRendering();
}

/** 이 브라우저가 가벼운 모드인지 (페이지를 열 때 한 번 정한다) */
export const LITE = detect();

/** <html>에 lite 클래스를 붙인다. CSS가 이 클래스로 효과를 끈다 */
export function applyLite(): void {
  document.documentElement.classList.toggle('lite', LITE);
}
