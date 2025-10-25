---
layout: single
collection: sections
title: MRT G-Buffer
draft: false
menu:
  demos:
    parent: utility
    weight: 100
script: mrt-gbuffer
---

# Multiple Render Targets G-Buffer

This demo showcases the use of Multiple Render Targets (MRT) with G-Buffer rendering technique in WebGL 2.0. The G-Buffer approach allows for deferred shading by rendering scene geometry information to multiple textures in a single pass, which can then be used for various post-processing effects.

## Features

- **Multiple Render Targets**: Renders to 4 different textures simultaneously:
  - Color Buffer: Base color information
  - Normal Buffer: View-space normals
  - Depth Buffer: Linear depth values
  - Position Buffer: View-space positions

- **Screen Space Ambient Occlusion (SSAO)**: Uses the G-Buffer data to compute ambient occlusion
- **Edge Detection**: Combines normal and depth information for edge detection
- **Interactive Display Modes**: Switch between different buffer visualizations
- **Real-time Parameters**: Adjust SSAO settings and animation parameters

## Display Modes

Press the display mode selector to cycle through:

1. **Final Effect**: Combined color, AO, and edge detection
2. **Color Buffer**: Raw color information
3. **Normal Buffer**: View-space normals visualization
4. **Depth Buffer**: Linear depth visualization  
5. **AO Only**: Ambient occlusion effect only
6. **Split View**: All buffers displayed in quadrants

## Technical Details

### G-Buffer Layout

The G-Buffer uses 4 render targets with floating-point precision:
- `gColor`: RGB color + alpha
- `gNormal`: View-space normals (mapped from [-1,1] to [0,1])
- `gDepth`: Linear depth values
- `gPosition`: View-space position

### SSAO Implementation

The Screen Space Ambient Occlusion effect samples surrounding pixels in screen space to approximate ambient lighting occlusion. The implementation includes:
- Configurable sample count (4-32 samples)
- Adjustable sampling radius
- Intensity control for the occlusion effect

### Performance Benefits

Using MRT allows the scene to be rendered only once while outputting multiple pieces of information, which is more efficient than multiple rendering passes. This is particularly beneficial for complex scenes with many objects.

## Controls

- **Mouse**: Orbit camera around the scene
- **Mouse Wheel**: Zoom in/out  
- **Display Mode**: Switch between different buffer visualizations
- **AO Settings**: Adjust ambient occlusion parameters
- **Animation**: Control object rotation and speed

## External Resources

* [Multiple Render Targets in WebGL 2.0](https://webgl2fundamentals.org/webgl/lessons/webgl-multiple-render-targets.html)
* [Deferred Shading Techniques](https://learnopengl.com/Advanced-Lighting/Deferred-Shading)
* [Screen Space Ambient Occlusion](https://learnopengl.com/Advanced-Lighting/SSAO)
