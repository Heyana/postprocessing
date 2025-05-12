uniform samplerCube roomCube;
uniform sampler2D roomMap;
uniform bool useSingleTexture;
uniform float roomScale;
uniform float roomVariety;
uniform float roomDepth; // 房间深度 - 标准值为0.5
uniform float roomsX;
uniform float roomsY;
uniform float gapSize;
uniform vec3 gapColor;
uniform float glassStrength;
uniform vec3 glassColor;
uniform bool flipTextureY;
uniform float time;
uniform bool handleBackFaces; // 是否特殊处理背面
uniform bool invert3DDepthOnBackFace; // 是否在背面时反转3D深度方向
uniform bool useOriginalRaytracing; // 是否使用原始光线追踪算法

varying vec2 vUv;
varying vec3 vViewDir;
varying vec3 vNormal;
varying vec3 vWorldPosition;

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
    if (flipTextureY) {
        // Y坐标翻转
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

void main() {
    // 规范化视线方向
    vec3 viewDir = normalize(vViewDir);
    
    // 应用深度缩放
    // 将[0,1]范围的roomDepth重映射到[+inf,0]
    // 如果roomDepth = 0 -> depthScale = 0（无限深度房间）
    // 如果roomDepth = 0.5 -> depthScale = 1（正常深度）
    // 如果roomDepth = 1 -> depthScale = +inf（零体积房间）
    float depthScale = 1.0 / (1.0 - roomDepth) - 1.0;
    vec3 adjustedViewDir = viewDir;
    adjustedViewDir.z *= depthScale;
    
    // 可选的背面处理 - 根据handleBackFaces参数决定
    bool isBackFace = adjustedViewDir.z < 0.0;
    
    // 如果需要处理背面
    if (handleBackFaces && isBackFace) {
        // 背面处理方法：对整个方向向量进行调整
        // 这样光线追踪算法可以正确处理背面
        
        // 首先确保深度方向为正 - 这是必须的
        adjustedViewDir.z = abs(adjustedViewDir.z);
        
        // 如果需要，还可以翻转Y轴（适用于一些情况）
        if (invert3DDepthOnBackFace) {
            adjustedViewDir.y = -adjustedViewDir.y;
        }
    }
    
    // 处理多房间逻辑
    vec2 roomCell = vec2(0.0);
    vec2 roomUV = vUv;
    
    // 如果需要绘制多个房间
    bool isInGap = false;
    
    if (roomsX > 1.0 || roomsY > 1.0) {
        // 计算单个房间的大小
        float roomWidth = 1.0 / roomsX;
        float roomHeight = 1.0 / roomsY;
        
        // 计算当前所在的房间索引 (0-based)
        roomCell = floor(vUv / vec2(roomWidth, roomHeight));
        roomUV = fract(vUv / vec2(roomWidth, roomHeight));
        
        // 处理间隔
        if (gapSize > 0.0) {
            // 计算在当前房间UV空间中的位置 (0-1)
            float gapWidthHalf = gapSize * 0.5;
            float gapHeightHalf = gapSize * 0.5;
            
            // 检查是否在间隙内
            bool inHorizontalGap = roomUV.x < gapWidthHalf || roomUV.x > (1.0 - gapWidthHalf);
            bool inVerticalGap = roomUV.y < gapHeightHalf || roomUV.y > (1.0 - gapHeightHalf);
            
            isInGap = inHorizontalGap || inVerticalGap;
            
            // 调整房间UV，去除间隙区域
            float roomCenterX = 0.5;
            float roomCenterY = 0.5;
            
            // 重新映射UV到间隙内部区域 (gapWidthHalf, 1-gapWidthHalf)
            roomUV = (roomUV - vec2(roomCenterX, roomCenterY)) / (1.0 - gapSize) + vec2(roomCenterX, roomCenterY);
        }
    }
    
    // 如果在间隔内，直接返回间隔颜色
    if (isInGap) {
        gl_FragColor = vec4(gapColor, 1.0);
        return;
    }
    
    // 切线空间光线追踪
    // 有两种模式：原始模式和增强深度模式
    vec3 pos;
    
    if (useOriginalRaytracing) {
        // 原始光线追踪算法使用-1.0的z值
        pos = vec3(roomUV * 2.0 - 1.0, -1.0);
        
        // 两步处理：
        // 1. 首先翻转方向 - 这样才能产生室内效果
        adjustedViewDir.xy = -adjustedViewDir.xy;
        
        // 2. 视角压缩 - 让相机旋转产生更平缓的效果变化
        // 计算原始视角（与Z轴的夹角）
        float viewAngle = acos(abs(adjustedViewDir.z));
        // 进行视角压缩 - 实际效果角度只有真实角度的一半
        float compressedAngle = viewAngle * 0.5;
        // 重建视线方向
        float xyMagnitude = length(adjustedViewDir.xy);
        if (xyMagnitude > 0.0) {
            // 计算新的xy分量和z分量
            float compressedZ = cos(compressedAngle);
            float compressedXYScale = sin(compressedAngle) / xyMagnitude;
            
            // 保持xy方向不变，只调整大小
            adjustedViewDir.xy *= compressedXYScale;
            adjustedViewDir.z = adjustedViewDir.z >= 0.0 ? compressedZ : -compressedZ;
            
            // 再应用放大效果
            float scaleFactor = 1.0 + 1.5 * sin(compressedAngle);
            adjustedViewDir.xy *= scaleFactor;
        }
        
        // 重新归一化
        adjustedViewDir = normalize(adjustedViewDir);
    } else {
        // 增强深度模式：z分量固定为-1.0，表示朝向房间内部
        pos = vec3(roomUV * 2.0 - 1.0, -1.0);
        
        // 同样使用视角压缩
        // 1. 翻转方向
        adjustedViewDir.xy = -adjustedViewDir.xy;
        
        // 2. 视角压缩处理
        float viewAngle = acos(abs(adjustedViewDir.z));
        // 压缩视角 - 只有实际角度的60%
        float compressedAngle = viewAngle * 0.4;
        // 重建视线方向
        float xyMagnitude = length(adjustedViewDir.xy);
        if (xyMagnitude > 0.0) {
            // 计算新的分量
            float compressedZ = cos(compressedAngle);
            float compressedXYScale = sin(compressedAngle) / xyMagnitude;
            
            // 保持xy方向不变，只调整大小
            adjustedViewDir.xy *= compressedXYScale;
            adjustedViewDir.z = adjustedViewDir.z >= 0.0 ? compressedZ : -compressedZ;
            
            // 再应用较小的放大效果
            float scaleFactor = 1.0 + sin(compressedAngle);
            adjustedViewDir.xy *= scaleFactor;
        }
        
        // 重新归一化
        adjustedViewDir = normalize(adjustedViewDir);
    }
    
    // 光线追踪参数计算 - 完全匹配Unity中的计算方式
    vec3 id = 1.0 / adjustedViewDir;
    vec3 k = abs(id) - pos * id;
    float kMin = min(min(k.x, k.y), k.z);
    
    // 计算光线与立方体内部的交点
    pos += kMin * adjustedViewDir;
    
    // 为房间添加随机变化
    if (roomVariety > 0.0) {
        // 使用房间单元坐标生成随机值
        vec3 r = rand3(roomCell);
        
        // 计算实际应用的随机程度
        float variety = clamp(roomVariety, 0.0, 1.0);
        
        // 随机选择房间方向和翻转 - 匹配Unity版本的随机化逻辑
        float faceChoice = floor(r.x * 4.0);
        
        // 只在随机值小于variety时应用随机变换
        if (r.y < variety) {
            // 存储原始位置
            vec3 origPos = pos;
            
            if (faceChoice < 0.5) {
                // -X 面（左侧）作为正面
                pos = vec3(-origPos.z, origPos.y, origPos.x);
            } else if (faceChoice < 1.5) {
                // +Z 面（前面）作为正面 - 保持不变
                // pos = origPos;
            } else if (faceChoice < 2.5) {
                // +X 面（右侧）作为正面
                pos = vec3(origPos.z, origPos.y, -origPos.x);
            } else {
                // -Z 面（后面）作为正面
                pos = vec3(-origPos.x, origPos.y, -origPos.z);
            }
            
            // 随机X-Z翻转 - 匹配Unity版本的随机化
            vec2 cubeflip = floor(r.xy * 2.0) * 2.0 - 1.0;
            pos.xz *= cubeflip;
            
            if (r.z > 0.5) {
                // 交换X和Z坐标
                float temp = pos.x;
                pos.x = pos.z;
                pos.z = temp;
            }
        }
    }
    
    // 采样获取房间内部颜色
    vec4 roomColor;
    
    if (useSingleTexture) {
        roomColor = sampleSingleTextureCube(roomMap, pos);
    } else {
        roomColor = textureCube(roomCube, pos);
    }
    
    // 应用玻璃效果
    vec3 finalColor = roomColor.rgb;
    if (glassStrength > 0.0) {
        vec3 normal = normalize(vNormal);
        finalColor = calculateGlassEffect(finalColor, normal, normalize(vWorldPosition - cameraPosition));
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
} 