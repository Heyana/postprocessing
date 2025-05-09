uniform samplerCube roomCube;
uniform sampler2D roomMap;
uniform bool useSingleTexture;
uniform float roomScale;
uniform float roomVariety;
uniform bool fillFace;
uniform float roomDepth;
uniform float visualDepth;
uniform float roomAspect;
uniform bool flipTextureY;

varying vec2 vUv;
varying vec3 vViewDir;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vPosition; // 接收顶点位置

#ifdef USE_OBJECTSPACE
varying vec3 vObjectPosition;
#endif

// 伪随机函数 - 根据输入坐标生成随机数
vec3 rand3(float n) {
    return fract(sin(n * vec3(12.9898, 78.233, 43.2316)) * 43758.5453);
}

// 伪随机函数 - 根据2维向量生成随机数
vec3 rand3(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233)) + vec3(0.0, 23.45, 78.67)) * 43758.5453);
}

// 从单张图片立方体贴图中采样
// 参数dir为方向向量，必须是已归一化的向量
vec4 sampleSingleTextureCube(sampler2D tex, vec3 dir) {
    // 找出哪个分量的绝对值最大，确定我们采样的是哪个面
    vec3 absDir = abs(dir);
    float maxVal = max(max(absDir.x, absDir.y), absDir.z);
    
    // 计算2D纹理坐标
    vec2 uv;
    
    // 根据传入的贴图图片布局调整采样坐标
    // 布局与原图匹配：
    // +-----+-----+-----+-----+
    // |     |  +Y |     |     |
    // |     |     |     |     |
    // +-----+-----+-----+-----+
    // | -X  |  +Z |  +X | -Z  |
    // |     |     |     |     |
    // +-----+-----+-----+-----+
    // |     |  -Y |     |     |
    // |     |     |     |     |
    // +-----+-----+-----+-----+
    
    float faceWidth = 0.25;  // 每个面宽度占整个贴图的1/4
    float faceHeight = 0.33333333; // 每个面高度占整个贴图的1/3
    
    if (maxVal == absDir.x) {
        // X轴面
        if (dir.x > 0.0) {
            // +X 面（右）
            uv = vec2(-dir.z, -dir.y) / abs(dir.x);
            // 将规范化的坐标映射到+X面位置
            uv = vec2(
                (uv.x * 0.5 + 0.5) * faceWidth + 2.0 * faceWidth,
                (uv.y * 0.5 + 0.5) * faceHeight + 1.0 * faceHeight
            );
        } else {
            // -X 面（左）
            uv = vec2(dir.z, -dir.y) / abs(dir.x);
            // 将规范化的坐标映射到-X面位置
            uv = vec2(
                (uv.x * 0.5 + 0.5) * faceWidth + 0.0 * faceWidth,
                (uv.y * 0.5 + 0.5) * faceHeight + 1.0 * faceHeight
            );
        }
    } else if (maxVal == absDir.y) {
        // Y轴面
        if (dir.y > 0.0) {
            // +Y 面（上）
            uv = vec2(dir.x, dir.z) / abs(dir.y);
            // 将规范化的坐标映射到+Y面位置
            uv = vec2(
                (uv.x * 0.5 + 0.5) * faceWidth + 1.0 * faceWidth,
                (uv.y * 0.5 + 0.5) * faceHeight + 0.0 * faceHeight
            );
        } else {
            // -Y 面（下）
            uv = vec2(dir.x, -dir.z) / abs(dir.y);
            // 将规范化的坐标映射到-Y面位置
            uv = vec2(
                (uv.x * 0.5 + 0.5) * faceWidth + 1.0 * faceWidth,
                (uv.y * 0.5 + 0.5) * faceHeight + 2.0 * faceHeight
            );
        }
    } else {
        // Z轴面
        if (dir.z > 0.0) {
            // +Z 面（前）
            uv = vec2(dir.x, -dir.y) / abs(dir.z);
            // 将规范化的坐标映射到+Z面位置
            uv = vec2(
                (uv.x * 0.5 + 0.5) * faceWidth + 1.0 * faceWidth,
                (uv.y * 0.5 + 0.5) * faceHeight + 1.0 * faceHeight
            );
        } else {
            // -Z 面（后）
            uv = vec2(-dir.x, -dir.y) / abs(dir.z);
            // 将规范化的坐标映射到-Z面位置
            uv = vec2(
                (uv.x * 0.5 + 0.5) * faceWidth + 3.0 * faceWidth,
                (uv.y * 0.5 + 0.5) * faceHeight + 1.0 * faceHeight
            );
        }
    }
    
    // 处理贴图Y轴翻转问题
    // 默认情况下，Three.js的贴图是上下翻转的，这里我们在着色器中处理
    if (flipTextureY) {
        // Y坐标翻转：将它从顶部到底部的坐标转成从底部到顶部
        uv.y = 1.0 - uv.y;
    }
    
    // 返回采样结果
    return texture2D(tex, uv);
}

void main() {
    vec3 viewDir = normalize(vViewDir);
    vec3 pos;
    
    #ifdef FILL_FACE
        // ===== 完全重写填满面模式的实现，解决侧面观察问题 =====
        // 确定当前所在的面
        vec3 absNormal = abs(vNormal);
        float maxComp = max(max(absNormal.x, absNormal.y), absNormal.z);
        
        // 初始化立方体表面点 - 这个点将在立方体表面
        vec3 cubePos;
        vec3 normal = normalize(vNormal);
        
        // 创建一个正交坐标系来处理任何角度的平面
        // 我们需要一个与法线垂直的两个向量，用于构建UV空间
        vec3 upVector = abs(normal.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 rightVector = normalize(cross(upVector, normal));
        vec3 upVectorOrtho = normalize(cross(normal, rightVector));
        
        // 现在使用这个坐标系和UV坐标来定位点在立方体表面
        // 我们直接使用UV坐标生成一个基于法线的平面上的点
        float u = vUv.x * 2.0 - 1.0; // 将UV从[0,1]映射到[-1,1]
        float v = vUv.y * 2.0 - 1.0;
        
        // 在法线方向上应用房间纵横比
        // 对水平方向应用roomAspect
        u *= roomAspect;
        
        // 计算立方体表面上的点，这个点是沿着法线的
        // 我们首先创建一个在法线平面上的点
        vec3 planePos = rightVector * u + upVectorOrtho * v;
        
        // 然后沿着法线方向突出到立方体表面
        // 这里我们选取一个标准深度来创建初始立方体表面
        float cubeSurfaceOffset = 1.0;
        cubePos = normal * cubeSurfaceOffset + planePos;
        
        // 标准化到单位立方体大小
        cubePos = normalize(cubePos);
        
        // 计算光线方向 - 从相机到表面点的方向
        vec3 rayDir = normalize(viewDir);
        
        // 使用改进的光线和立方体相交算法
        // 计算从立方体表面到内部的光线相交
        vec3 invRayDir = 1.0 / rayDir;  
        
        // 计算与房间对面墙的相交
        // 我们首先计算光线与各个轴对齐的平面的相交
        vec3 tMax = (sign(rayDir) - cubePos) * invRayDir;
        
        // 找到最近的相交点
        float t = min(min(tMax.x, tMax.y), tMax.z);
        
        // 保持较小的roomDepth值以避免异常球形，但使用visualDepth来影响视觉效果
        // 首先限制深度值，避免从极端角度观察时穿透过深
        t = min(t, roomDepth);
        
        // 使用视觉深度参数来创建深度感
        float visualScale = visualDepth / max(roomDepth, 0.001);
        
        // 计算最终的采样位置 - 在保持低roomDepth的同时增强深度效果
        pos = cubePos + rayDir * t;
        
        // 应用视觉深度缩放，但只缩放与表面法线垂直的分量
        // 这样可以保持低roomDepth的数学正确性，同时视觉上有深度感
        vec3 normalComponent = normal * dot(pos - cubePos, normal);
        vec3 tangentComponent = (pos - cubePos) - normalComponent;
        pos = cubePos + normalComponent + tangentComponent * visualScale;
    #else
        // ===== 标准模式：多个房间 =====
        vec3 roomUV;
        
        #ifdef USE_OBJECTSPACE
            // 对象空间模式的房间坐标
            roomUV = vObjectPosition;
        #else
            // 切线空间模式 - 使用UV坐标
            roomUV = vec3(vUv * roomScale, 0.0);
        #endif
        
        // 获取房间单元坐标
        vec3 roomCell = floor(roomUV);
        roomUV = fract(roomUV);
        
        // 将房间UV从[0,1]映射到[-1,1]范围
        pos = roomUV * 2.0 - 1.0;
        
        // 光线追踪参数
        vec3 id = 1.0 / viewDir;
        vec3 k = abs(id) - pos * id;
        float kMin = min(min(k.x, k.y), k.z);
        
        // 计算光线与房间内部的相交点
        pos += kMin * viewDir;
        
        // 为每个房间生成随机旋转和翻转
        #ifdef USE_OBJECTSPACE
            vec3 r = rand3(roomCell.x + roomCell.y + roomCell.z);
        #else
            vec3 r = rand3(roomCell.xy);
        #endif
        
        // 添加随机变换
        if(roomVariety > 0.0) {
            // 基于roomVariety参数控制随机程度
            float variety = clamp(roomVariety, 0.0, 1.0);
            
            // 随机翻转和旋转
            vec2 flip = floor(r.xy * 2.0) * 2.0 - 1.0;
            pos.xz *= mix(vec2(1.0), flip, variety);
            
            // 随机交换轴
            if(r.z > 0.5 && variety > 0.5) {
                pos.xz = pos.zx;
            }
        }
    #endif
    
    // 采样获取房间内部颜色
    vec4 roomColor;
    
    if (useSingleTexture) {
        // 使用单张图片立方体贴图
        roomColor = sampleSingleTextureCube(roomMap, pos);
    } else {
        // 使用立方体贴图
        roomColor = textureCube(roomCube, pos);
    }
    
    gl_FragColor = vec4(roomColor.rgb, 1.0);
} 