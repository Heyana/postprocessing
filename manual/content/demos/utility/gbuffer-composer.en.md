---
layout: single
collection: sections
title: G-Buffer Composer
draft: false
menu:
  demos:
    parent: utility
    weight: 101
script: gbuffer-composer
---

# G-Buffer with Effect Composer

This demo showcases an advanced rendering architecture where **Multiple Render Targets (MRT) G-Buffer serves as the core data provider** for multiple post-processing effects. Instead of rendering the scene multiple times, this approach renders once to G-Buffer and shares the data across different effects.

## 🏗️ **Architecture Benefits**

### **Performance Optimization**
- **Single Scene Render**: Scene geometry is rendered only once to G-Buffer
- **Data Sharing**: Multiple post-processing effects share the same G-Buffer data
- **Reduced Overdraw**: Eliminates redundant geometry processing

### **Extensibility**
- **Modular Design**: New post-processing effects can easily tap into G-Buffer data
- **Consistent Data**: All effects work with the same high-quality geometry information
- **Flexible Pipeline**: Easy to enable/disable effects without affecting data generation

### **Quality Improvement**
- **High-Precision Data**: Float-type textures preserve geometric detail
- **Consistent Normals**: All effects use the same normal information
- **Accurate Depth**: Linear depth values for precise calculations

## 📊 **G-Buffer Layout**

The G-Buffer contains 4 render targets with different geometric information:

| Buffer | Content | Format | Usage |
|--------|---------|--------|--------|
| **gColor** | Base color + texture | RGBA Float | Material albedo, lighting base |
| **gNormal** | View-space normals | RGB Float | SSAO, lighting, reflections |
| **gDepth** | Linear depth values | R Float | Depth testing, fog, DOF |
| **gPosition** | View-space positions | RGB Float | Screen-space effects, reconstruction |

## 🔧 **Technical Implementation**

### **G-Buffer Pass**
```javascript
// G-Buffer Pass renders scene geometry to multiple textures
const gBufferPass = new GBufferPass(scene, camera, {
    resolutionScale: 1.0
});
composer.addPass(gBufferPass);

// Get G-Buffer textures for other effects
const gBufferTextures = gBufferPass.getGBufferTextures();
```

### **SSAO Integration**
```javascript
// SSAO Effect uses G-Buffer normal data
const ssaoEffect = new SSAOEffect(camera, gBufferTextures.gNormal, {
    blendFunction: BlendFunction.MULTIPLY,
    samples: 16,
    radius: 0.15,
    intensity: 1.0
});
```

### **SSR Integration** (Planned)
```javascript
// Selective SSR can use G-Buffer depth and normals
const ssrPass = new SelectiveSSRPass({
    scene, camera, renderer,
    normalTexture: gBufferTextures.gNormal,
    depthTexture: gBufferTextures.gDepth
});
```

## 🎮 **Interactive Controls**

- **G-Buffer Visualization**: Toggle between normal rendering and G-Buffer data display
- **Buffer Selection**: View individual G-Buffer components (Color, Normal, Depth, Position)
- **SSAO Parameters**: Real-time adjustment of ambient occlusion settings
- **Animation Controls**: Object rotation and speed settings

## 🔬 **Deferred Rendering Pipeline**

This demo implements a **deferred rendering** approach:

1. **Geometry Pass**: Render all scene geometry to G-Buffer (MRT)
2. **Lighting Pass**: Use G-Buffer data for lighting calculations
3. **Post-Processing**: Apply effects using shared G-Buffer information
4. **Final Composition**: Combine all results for final output

## 🚀 **Performance Considerations**

### **Memory Usage**
- **4x Render Targets**: Higher memory consumption for G-Buffer storage
- **Float Precision**: Better quality but increased memory bandwidth
- **Resolution Scaling**: Optional lower resolution for mobile optimization

### **Bandwidth Optimization**
- **Selective Updates**: Only update G-Buffer when scene changes
- **Smart Caching**: Reuse G-Buffer data across multiple frames
- **LOD Integration**: Different detail levels for distant objects

## 🔮 **Future Extensions**

This architecture enables easy integration of additional effects:

- **Screen Space Reflections**: Using normal and depth data
- **Screen Space Global Illumination**: Leveraging position and normal information  
- **Motion Blur**: Using position differences between frames
- **Volumetric Lighting**: Utilizing depth for ray marching
- **Advanced Shadows**: Screen-space shadow techniques

## 💡 **Use Cases**

This approach is ideal for applications requiring:
- **Multiple Post-Processing Effects**: Games, architectural visualization
- **High-Quality Rendering**: Film rendering, product visualization  
- **Performance-Critical Applications**: Real-time applications with complex shading
- **Flexible Pipelines**: Tools requiring runtime effect customization

## External Resources

* [Deferred Shading Techniques](https://learnopengl.com/Advanced-Lighting/Deferred-Shading)
* [Multiple Render Targets in WebGL](https://webgl2fundamentals.org/webgl/lessons/webgl-multiple-render-targets.html)
* [G-Buffer Optimization Strategies](https://www.guerrilla-games.com/read/the-rendering-technology-of-killzone-shadow-fall)
