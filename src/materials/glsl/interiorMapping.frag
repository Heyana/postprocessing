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
uniform float roomsX;
uniform float roomsY;
uniform float gapSize;
uniform vec3 gapColor;
uniform float glassStrength;
uniform vec3 glassColor;
uniform float glassBlurStrength;
uniform bool enhancedDepth; // 新增：增强深度模式标志

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

// 计算玻璃反射效果
vec3 calculateGlassEffect(vec3 baseColor, vec3 normal, vec3 viewDir) {
    // 法线和视线方向都需要归一化
    vec3 N = normalize(normal);
    vec3 V = normalize(-viewDir);
    
    // 计算菲涅尔效应 - 使用改进的Schlick近似
    float cosTheta = max(0.0, dot(N, V));
    // 基础反射率 - 即使在0度角也有一些反射
    float baseReflectivity = 0.04; 
    float fresnel = baseReflectivity + (1.0 - baseReflectivity) * pow(1.0 - cosTheta, 5.0);
    
    // 确保反射效果明显可见
    fresnel = max(fresnel, 0.1); 
    
    // 基于菲涅尔和反射强度混合玻璃颜色
    float reflectionFactor = fresnel * glassStrength;
    
    // 添加基于视角的高光效果 - 降低高光指数使效果更柔和
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5)); // 假设的光源方向
    float specular = pow(max(0.0, dot(reflect(-lightDir, N), V)), 16.0) * glassStrength;
    
    // 防止玻璃颜色太暗导致画面变黑
    // 对白色(1,1,1)和接近白色的颜色进行特殊处理，确保高亮效果
    vec3 safeGlassColor;
    float colorBrightness = dot(glassColor, vec3(0.299, 0.587, 0.114));
    
    if (colorBrightness > 0.9) {
        // 对于接近白色的颜色，保持其亮度但略微增加高光
        safeGlassColor = glassColor + vec3(0.1);
    } else {
        // 对其他颜色设置最低亮度下限
        safeGlassColor = max(glassColor, vec3(0.3));
    }
    
    // 混合反射和基础颜色 - 使用加性混合保持亮度
    vec3 reflection = safeGlassColor * (reflectionFactor + specular);
    vec3 finalColor = mix(baseColor, baseColor + reflection, glassStrength);
    
    // 亮度保护 - 防止颜色过暗
    float originalLuminance = dot(baseColor, vec3(0.299, 0.587, 0.114));
    float newLuminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
    
    // 如果亮度降低超过30%，进行亮度补偿
    if (newLuminance < originalLuminance * 0.7) {
        finalColor = finalColor * (originalLuminance * 0.7 / max(newLuminance, 0.001));
    }
    
    return finalColor;
}

// 对立方体贴图应用模糊效果
vec4 sampleCubeWithBlur(samplerCube cube, vec3 dir, float blurStrength) {
    if (blurStrength <= 0.001) {
        return textureCube(cube, dir);
    }

    // 创建正交基向量，用于在球面上采样
    vec3 tangent, bitangent;
    
    // 找到与dir不平行的向量用来构建正交基
    if (abs(dir.x) < 0.8) {
        tangent = normalize(cross(vec3(1.0, 0.0, 0.0), dir));
    } else {
        tangent = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
    }
    
    bitangent = normalize(cross(dir, tangent));
    
    // 采样点数 - 越多越平滑但性能越低
    const int numSamples = 5;
    
    // 根据模糊强度计算采样范围，最大可达0.15弧度
    float radius = blurStrength * 0.15;
    
    vec4 result = vec4(0.0);
    float weight = 0.0;
    
    // 中心点权重最高
    result += textureCube(cube, dir) * 1.0;
    weight += 1.0;
    
    // 环绕中心点采样
    for (int i = 0; i < numSamples; i++) {
        // 计算随机偏移角度
        float angle = float(i) / float(numSamples) * 2.0 * 3.14159265359;
        float dist = radius * (0.5 + float(i % 3) / 3.0);
        
        vec3 offset = tangent * cos(angle) * dist + bitangent * sin(angle) * dist;
        vec3 sampleDir = normalize(dir + offset);
        
        // 权重根据距离中心的远近递减
        float sampleWeight = 1.0 - dist / radius * 0.5;
        result += textureCube(cube, sampleDir) * sampleWeight;
        weight += sampleWeight;
    }
    
    // 标准化结果
    return result / weight;
}

// 对单张图片立方体贴图应用模糊效果
vec4 sampleSingleTextureWithBlur(sampler2D tex, vec3 dir, float blurStrength) {
    if (blurStrength <= 0.001) {
        return sampleSingleTextureCube(tex, dir);
    }

    // 创建正交基向量，用于在球面上采样
    vec3 tangent, bitangent;
    
    // 找到与dir不平行的向量用来构建正交基
    if (abs(dir.x) < 0.8) {
        tangent = normalize(cross(vec3(1.0, 0.0, 0.0), dir));
    } else {
        tangent = normalize(cross(vec3(0.0, 1.0, 0.0), dir));
    }
    
    bitangent = normalize(cross(dir, tangent));
    
    // 采样点数 - 越多越平滑但性能越低
    const int numSamples = 5;
    
    // 根据模糊强度计算采样范围，最大可达0.15弧度
    float radius = blurStrength * 0.15;
    
    vec4 result = vec4(0.0);
    float weight = 0.0;
    
    // 中心点权重最高
    result += sampleSingleTextureCube(tex, dir) * 1.0;
    weight += 1.0;
    
    // 环绕中心点采样
    for (int i = 0; i < numSamples; i++) {
        // 计算随机偏移角度
        float angle = float(i) / float(numSamples) * 2.0 * 3.14159265359;
        float dist = radius * (0.5 + float(i % 3) / 3.0);
        
        vec3 offset = tangent * cos(angle) * dist + bitangent * sin(angle) * dist;
        vec3 sampleDir = normalize(dir + offset);
        
        // 权重根据距离中心的远近递减
        float sampleWeight = 1.0 - dist / radius * 0.5;
        result += sampleSingleTextureCube(tex, sampleDir) * sampleWeight;
        weight += sampleWeight;
    }
    
    // 标准化结果
    return result / weight;
}

void main() {
    vec3 viewDir = normalize(vViewDir);
    vec3 pos;
    
    #ifdef FILL_FACE
        // ===== 在fillFace模式下处理多房间分布 =====
        
        // 确定当前所在的面
        vec3 absNormal = abs(vNormal);
        float maxComp = max(max(absNormal.x, absNormal.y), absNormal.z);
        
        // 初始化立方体表面点 - 这个点将在立方体表面
        vec3 cubePos;
        vec3 normal = normalize(vNormal);
        
        // 创建一个正交坐标系来处理任何角度的平面
        vec3 upVector = abs(normal.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 rightVector = normalize(cross(upVector, normal));
        vec3 upVectorOrtho = normalize(cross(normal, rightVector));
        
        // 计算多房间布局
        // 将UV坐标从[0,1]映射到[-1,1]
        float u = vUv.x * 2.0 - 1.0; 
        float v = vUv.y * 2.0 - 1.0;
        
        // 如果需要绘制多个房间
        bool isInGap = false;
        vec2 roomUVOrig = vec2(u, v);
        
        // 用于存储房间ID，以便生成随机值
        vec2 roomId = vec2(0.0, 0.0);
        
        if ((roomsX > 1.0 || roomsY > 1.0) && gapSize > 0.0) {
            // 计算单个房间的大小
            float roomWidth = 2.0 / roomsX;
            float roomHeight = 2.0 / roomsY;
            
            // 计算当前所在的房间索引 (0-based)
            roomId = floor((vec2(u, v) + 1.0) / vec2(roomWidth, roomHeight));
            
            // 检查是否在最外层边缘
            bool isOnLeftEdge = roomId.x == 0.0;
            bool isOnRightEdge = roomId.x == roomsX - 1.0;
            bool isOnTopEdge = roomId.y == 0.0;
            bool isOnBottomEdge = roomId.y == roomsY - 1.0;
            
            // 计算在整个UV空间中，当前房间的左右上下边界
            float leftBound = -1.0 + roomId.x * roomWidth;
            float rightBound = -1.0 + (roomId.x + 1.0) * roomWidth;
            float topBound = -1.0 + roomId.y * roomHeight;
            float bottomBound = -1.0 + (roomId.y + 1.0) * roomHeight;
            
            // 计算每个房间的间隔区域宽度
            float gapWidthHalf = roomWidth * gapSize * 0.5;
            float gapHeightHalf = roomHeight * gapSize * 0.5;
            
            // 只有不在边缘的右侧和下侧才需要添加间隔
            bool inRightGap = !isOnRightEdge && u > (rightBound - gapWidthHalf);
            bool inLeftGap = !isOnLeftEdge && u < (leftBound + gapWidthHalf);
            bool inTopGap = !isOnTopEdge && v < (topBound + gapHeightHalf);
            bool inBottomGap = !isOnBottomEdge && v > (bottomBound - gapHeightHalf);
            
            // 判断是否在间隔区域
            isInGap = inRightGap || inLeftGap || inTopGap || inBottomGap;
            
            // 计算房间中心点
            vec2 roomCenter = vec2(
                leftBound + roomWidth * 0.5,
                topBound + roomHeight * 0.5
            );
            
            // 计算房间内的局部坐标 (不考虑间隔)
            u = (u - roomCenter.x) / (roomWidth * 0.5 - gapWidthHalf) * roomWidth * 0.5;
            v = (v - roomCenter.y) / (roomHeight * 0.5 - gapHeightHalf) * roomHeight * 0.5;
            
            // 限制局部坐标范围
            u = clamp(u, -1.0, 1.0);
            v = clamp(v, -1.0, 1.0);
        } else if (roomsX > 1.0 || roomsY > 1.0) {
            // 没有间隔但有多个房间的情况
            float roomWidth = 2.0 / roomsX;
            float roomHeight = 2.0 / roomsY;
            
            // 计算当前所在的房间索引 (0-based)
            roomId = floor((vec2(u, v) + 1.0) / vec2(roomWidth, roomHeight));
            
            // 计算房间中心点
            vec2 roomCenter = vec2(
                -1.0 + (roomId.x + 0.5) * roomWidth,
                -1.0 + (roomId.y + 0.5) * roomHeight
            );
            
            // 计算房间内的局部坐标
            u = (u - roomCenter.x) / (roomWidth * 0.5) * 1.0;
            v = (v - roomCenter.y) / (roomHeight * 0.5) * 1.0;
            
            // 限制局部坐标范围
            u = clamp(u, -1.0, 1.0);
            v = clamp(v, -1.0, 1.0);
        }
        
        // 如果在间隔内，直接返回间隔颜色
        if (isInGap) {
            gl_FragColor = vec4(gapColor, 1.0);
            return;
        }
        
        // 应用房间纵横比
        u *= roomAspect;
        
        // 计算立方体表面上的点
        vec3 planePos = rightVector * u + upVectorOrtho * v;
        
        // 沿着法线方向突出到立方体表面
        float cubeSurfaceOffset = 1.0;
        cubePos = normal * cubeSurfaceOffset + planePos;
        
        // 标准化到单位立方体大小
        cubePos = normalize(cubePos);
        
        // 计算光线方向和相交
        vec3 rayDir = normalize(viewDir);
        vec3 invRayDir = 1.0 / rayDir;  
        vec3 tMax = (sign(rayDir) - cubePos) * invRayDir;
        float t = min(min(tMax.x, tMax.y), tMax.z);
        
        // 保持较小的roomDepth值以避免异常球形
        t = min(t, roomDepth);
        
        // 使用视觉深度参数来创建深度感
        float visualScale = visualDepth / max(roomDepth, 0.001);
        
        // 计算最终的采样位置
        pos = cubePos + rayDir * t;
        
        // 应用视觉深度缩放，但只缩放与表面法线垂直的分量
        vec3 normalComponent = normal * dot(pos - cubePos, normal);
        vec3 tangentComponent = (pos - cubePos) - normalComponent;
        pos = cubePos + normalComponent + tangentComponent * visualScale;
        
        // 为每个房间应用随机朝向（仅在需要变化时）
        if (roomVariety > 0.0 && (roomsX > 1.0 || roomsY > 1.0)) {
            // 使用房间ID为种子生成随机值
            vec3 r = rand3(roomId);
            
            // 基于roomVariety参数控制随机程度
            float variety = clamp(roomVariety, 0.0, 1.0);
            
            // 随机选择四个侧面之一作为房间正面（-X, +Z, +X, -Z）
            // 我们将随机值映射到0-3之间，对应四个侧面
            float faceChoice = floor(r.x * 4.0);
            
            // 只有当随机值小于variety时才应用随机朝向，以便可以控制随机程度
            if (r.y < variety) {
                // 创建一个临时变量存储原始pos
                vec3 origPos = pos;
                
                if (faceChoice < 0.5) {
                    // -X 面（左侧）作为正面
                    // x=-z, y=y, z=x
                    pos = vec3(-origPos.z, origPos.y, origPos.x);
                } else if (faceChoice < 1.5) {
                    // +Z 面（前面）作为正面
                    // 保持不变
                    // pos = origPos;
                } else if (faceChoice < 2.5) {
                    // +X 面（右侧）作为正面
                    // x=z, y=y, z=-x
                    pos = vec3(origPos.z, origPos.y, -origPos.x);
                } else {
                    // -Z 面（后面）作为正面
                    // x=-x, y=y, z=-z
                    pos = vec3(-origPos.x, origPos.y, -origPos.z);
                }
            }
        }
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
        
        // 计算深度增强因子（新增）
        vec3 adjustedViewDir = viewDir;
        if(enhancedDepth) {
            // 增强的深度计算 - 参考用户提供的代码
            // 将[0,1]范围的roomDepth重映射到[+inf,0]
            // 如果roomDepth = 0 -> depthScale = 0（无限深度房间）
            // 如果roomDepth = 0.5 -> depthScale = 1（正常深度）
            // 如果roomDepth = 1 -> depthScale = +inf（零体积房间）
            float depthScale = 1.0 / (1.0 - roomDepth) - 1.0;
            
            // 只缩放视线的z分量，保持x,y不变
            adjustedViewDir.z *= depthScale;
        }
        
        // 将房间UV从[0,1]映射到[-1,1]范围
        // 使用增强的初始z值(新增)
        pos = enhancedDepth ? 
              vec3(roomUV * 2.0 - 1.0, 1.0) :  // 增强模式：z初始值为1.0
              roomUV * 2.0 - 1.0;             // 原始模式：所有分量从-1到1
        
        // 光线追踪参数
        vec3 id = 1.0 / adjustedViewDir;
        vec3 k = abs(id) - pos * id;
        float kMin = min(min(k.x, k.y), k.z);
        
        // 计算光线与房间内部的相交点
        pos += kMin * adjustedViewDir;
        
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
            
            // 随机选择四个侧面之一作为房间正面（-X, +Z, +X, -Z）
            // 我们将随机值映射到0-3之间，对应四个侧面
            float faceChoice = floor(r.x * 4.0);
            
            // 只有当随机值小于variety时才应用随机朝向，以便可以控制随机程度
            if (r.y < variety) {
                // 创建一个临时变量存储原始pos
                vec3 origPos = pos;
                
                if (faceChoice < 0.5) {
                    // -X 面（左侧）作为正面
                    // x=-z, y=y, z=x
                    pos = vec3(-origPos.z, origPos.y, origPos.x);
                } else if (faceChoice < 1.5) {
                    // +Z 面（前面）作为正面
                    // 保持不变
                    // pos = origPos;
                } else if (faceChoice < 2.5) {
                    // +X 面（右侧）作为正面
                    // x=z, y=y, z=-x
                    pos = vec3(origPos.z, origPos.y, -origPos.x);
                } else {
                    // -Z 面（后面）作为正面
                    // x=-x, y=y, z=-z
                    pos = vec3(-origPos.x, origPos.y, -origPos.z);
                }
            }
        }
    #endif
    
    // 采样获取房间内部颜色
    vec4 roomColor;
    
    if (useSingleTexture) {
        // 使用单张图片立方体贴图，应用模糊效果
        roomColor = sampleSingleTextureWithBlur(roomMap, pos, glassBlurStrength);
    } else {
        // 使用立方体贴图，应用模糊效果
        roomColor = sampleCubeWithBlur(roomCube, pos, glassBlurStrength);
    }
    
    // 应用玻璃效果
    vec3 finalColor = roomColor.rgb;
    if (glassStrength > 0.0) {
        vec3 normal = normalize(vNormal);
        finalColor = calculateGlassEffect(finalColor, normal, viewDir);
        
        // 确保颜色亮度不会大幅度降低
        float originalLuminance = dot(roomColor.rgb, vec3(0.299, 0.587, 0.114));
        float newLuminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
        if (newLuminance < originalLuminance * 0.7) {
            // 如果亮度降低太多，进行补偿
            finalColor = finalColor * (originalLuminance * 0.7 / max(newLuminance, 0.001));
        }
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
} 