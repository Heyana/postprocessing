// 假室内材质的片段着色器 - 单房间版本
// 基于Interior Mapping技术

uniform float time;
uniform vec3 roomSize;
uniform sampler2D wallTexture;
uniform bool useLayoutTexture;

// 墙壁颜色
uniform vec3 ceilingColor;
uniform vec3 floorColor;
uniform vec3 rightWallColor;
uniform vec3 leftWallColor;
uniform vec3 frontWallColor;
uniform vec3 backWallColor;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;

// 立方体内部映射 - 计算射线与房间的交点
vec3 interiorMapping(vec3 rayOrigin, vec3 rayDir) {
    // 反转射线方向，使其看起来是"凹进去"的而不是"突出来"的
    rayDir = -rayDir;
    
    // 计算单元格尺寸和局部坐标
    vec3 cellSize = roomSize;
    vec3 localPos = mod(rayOrigin, cellSize);
    
    // 计算到下一个单元格边界的距离
    vec3 nextBoundary = step(0.0, rayDir) * cellSize - mod(localPos, cellSize);
    vec3 prevBoundary = step(0.0, -rayDir) * cellSize - mod(localPos, cellSize);
    
    // 计算射线与单元格边界的相交
    vec3 intersectMax = nextBoundary / abs(rayDir);
    vec3 intersectMin = prevBoundary / abs(rayDir);
    
    // 找到最小的相交时间（即最近的交点）
    vec3 largestRayParams = max(intersectMax, intersectMin);
    float dist = min(min(largestRayParams.x, largestRayParams.y), largestRayParams.z);
    
    // 计算交点位置
    vec3 intersectPos = rayOrigin + rayDir * dist;
    
    // 计算交点在当前单元格中的相对位置，标准化到[-1,1]范围
    vec3 cellPoint = mod(intersectPos, cellSize) / cellSize * 2.0 - 1.0;
    
    return cellPoint;
}

// 2D映射 - 将立方体内部点映射到2D纹理坐标
vec2 mapToTexture(vec3 cubePoint, out int faceID) {
    // 计算每个面的贡献权重
    float eps = 0.001;
    
    // 确定哪个面被击中 (x, y, 或 z 轴)
    vec3 absPoint = abs(cubePoint);
    float maxCoord = max(max(absPoint.x, absPoint.y), absPoint.z);
    
    // 初始化2D纹理坐标
    vec2 texCoord;
    
    // 确定是哪个面，并计算对应的纹理坐标
    if(abs(maxCoord - absPoint.x) < eps) {
        // X轴墙面 (左右墙)
        texCoord = vec2(cubePoint.z, cubePoint.y);
        faceID = cubePoint.x > 0.0 ? 3 : 4; // +X右墙, -X左墙
    } else if(abs(maxCoord - absPoint.y) < eps) {
        // Y轴墙面 (天花板地板)
        texCoord = vec2(cubePoint.x, cubePoint.z);
        faceID = cubePoint.y > 0.0 ? 1 : 2; // +Y天花板, -Y地板
    } else {
        // Z轴墙面 (前后墙)
        texCoord = vec2(cubePoint.x, cubePoint.y);
        faceID = cubePoint.z > 0.0 ? 5 : 6; // +Z前墙, -Z后墙
    }
    
    // 将坐标范围从[-1,1]映射到[0,1]用于纹理采样
    texCoord = (texCoord + 1.0) * 0.5;
    
    // 如果使用布局纹理，则转换到相应的布局位置
    if(useLayoutTexture) {
        // 从布局贴图中获取对应面的纹理坐标
        // 布局:
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
        vec2 scale = vec2(0.25, 0.333333); // 1/4, 1/3
        vec2 offset;
        
        // 本地UV坐标需要翻转以匹配布局
        vec2 flippedUV = texCoord;
        
        if(faceID == 1) {  // +Y (天花板)
            offset = vec2(0.25, 0.0);
        } else if(faceID == 2) {  // -Y (地板)
            offset = vec2(0.25, 0.666667);
            flippedUV.y = 1.0 - flippedUV.y; // 翻转Y轴
        } else if(faceID == 3) {  // +X (右墙)
            offset = vec2(0.5, 0.333333);
        } else if(faceID == 4) {  // -X (左墙)
            offset = vec2(0.0, 0.333333);
            flippedUV.x = 1.0 - flippedUV.x; // 翻转X轴
        } else if(faceID == 5) {  // +Z (前墙)
            offset = vec2(0.25, 0.333333);
        } else if(faceID == 6) {  // -Z (后墙)
            offset = vec2(0.75, 0.333333);
            flippedUV.x = 1.0 - flippedUV.x; // 翻转X轴
        }
        
        // 计算在整个贴图中的坐标
        texCoord = offset + flippedUV * scale;
    }
    
    return texCoord;
}

// 根据面ID获取对应墙面的颜色
vec3 getFaceColor(int faceID) {
    if(faceID == 1) return ceilingColor;       // 天花板
    if(faceID == 2) return floorColor;         // 地板
    if(faceID == 3) return rightWallColor;     // 右墙
    if(faceID == 4) return leftWallColor;      // 左墙
    if(faceID == 5) return frontWallColor;     // 前墙
    if(faceID == 6) return backWallColor;      // 后墙
    
    return vec3(0.8); // 默认浅灰色
}

void main() {
    // 计算从表面点到相机的射线
    vec3 rayOrigin = vWorldPosition;
    vec3 rayDir = normalize(vViewDirection);
    
    // 室内点映射
    vec3 roomPoint = interiorMapping(rayOrigin, rayDir);
    
    // 确定是哪个面被击中（注意：我们现在直接在mapToTexture中计算faceID）
    int faceID = 0;
    vec2 texCoord = mapToTexture(roomPoint, faceID);
    
    // 采样纹理
    vec3 texColor = texture2D(wallTexture, texCoord).rgb;
    
    // 获取面颜色
    vec3 faceColor = getFaceColor(faceID);
    
    // 合成最终颜色
    vec3 finalColor = texColor * faceColor;
    
    // 添加光照效果以提高亮度
    // 简化的环境光遮蔽，让场景更亮
    float ao = 1.0 - 0.1 * (abs(roomPoint.x) + abs(roomPoint.y) + abs(roomPoint.z)) / 3.0;
    
    // 添加简单的环境光
    float ambientLight = 0.9; // 提高环境光强度
    
    // 主光源方向（简单定向光）
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
    float diff = max(dot(normalize(vNormal), lightDir), 0.0);
    
    // 合成最终亮度
    float lighting = ambientLight + diff * 0.3;
    
    // 应用光照效果
    finalColor = finalColor * ao * lighting * 2.0; // 整体亮度提高
    
    // 输出最终颜色
    gl_FragColor = vec4(finalColor, 1.0);
}
