/**
 * 这个文件用于帮助 TypeScript 类型声明生成
 * 它提供了一些必要的类型引用和导入，确保生成的声明文件能够正确解析依赖
 */

// 导入通用的 Three.js 类型
import {
  Object3D,
  Color,
  Vector2,
  Vector3,
  Matrix4,
  Texture,
  Scene,
  Camera,
  PerspectiveCamera,
  OrthographicCamera,
  WebGLRenderer,
  WebGLRenderTarget,
  Uniform,
  Material,
  ShaderMaterial,
} from "three";

// 导入内部类型
import { Effect } from "./effects/Effect";
import { Selection } from "./core/Selection";
import { Resolution } from "./core/Resolution";
import { BlendFunction } from "./enums/BlendFunction";
import { KernelSize } from "./enums/KernelSize";

// GLSL 着色器文件类型引用
// 这些类型已经在 src/glsl.d.ts 中定义，这里只是引用一下

// 导出类型辅助接口
export interface TypesHelper {
  // Three.js 类型
  Object3D: Object3D;
  Color: Color;
  Vector2: Vector2;
  Vector3: Vector3;
  Matrix4: Matrix4;
  Texture: Texture;
  Scene: Scene;
  Camera: Camera;
  PerspectiveCamera: PerspectiveCamera;
  OrthographicCamera: OrthographicCamera;
  WebGLRenderer: WebGLRenderer;
  WebGLRenderTarget: WebGLRenderTarget;
  Uniform: Uniform;
  Material: Material;
  ShaderMaterial: ShaderMaterial;

  // 内部类型
  Effect: Effect;
  Selection: Selection;
  Resolution: Resolution;
  BlendFunction: typeof BlendFunction;
  KernelSize: typeof KernelSize;
}

// 这个导出不会被实际使用，只是为了让 TypeScript 自动包含所有上述类型
export const typesHelper: TypesHelper = {} as any;
