---
layout: single
collection: sections
title: Custom SSGI
draft: false
menu:
  demos:
    parent: utility
    weight: 36
script: custom-ssgi
---

# Custom SSGI (No Black Artifacts)

Custom Screen Space Global Illumination is an improved version of SSGI that eliminates black artifacts and flickering by skipping the denoising process while maintaining the global illumination quality.

## Key Features

- **No Black Artifacts** - Completely eliminates the black spots and flickering common in standard SSGI
- **Indirect Lighting** - Simulates light bounces in the scene, providing natural ambient lighting
- **Realistic Reflections** - Delivers surface reflections based on material properties
- **Color Bleeding** - Simulates color transfer between surfaces
- **Physically-based** - Responds properly to material roughness and metalness
- **Performance Options** - Provides parameters to balance visual quality and performance

## Usage Guide

This demo showcases Custom SSGI applied to a 3D scene. You can adjust various parameters through the control panel:

### Basic Parameters

- **Distance** - Controls the maximum distance for ray tracing
- **Thickness** - Adjusts the depth tolerance for ray marching
- **Resolution Scale** - Controls the internal rendering resolution (lower values improve performance)

### Sampling Settings

- **Steps** - Adjusts the number of ray marching steps
- **Refine Steps** - Controls additional precision steps
- **Missed Rays** - Enables filling in of missed ray hits
- **Importance Sampling** - Uses biased sampling for better results

### Light Settings

- **Main Light Intensity** - Adjusts the brightness of the primary light source
- **Ambient Light Intensity** - Controls the base ambient brightness

## Technical Implementation

The Custom SSGI implementation is based on standard SSGI but with a crucial modification:

1. **G-Buffer Generation** - First generates a G-Buffer with depth, normals, roughness info
2. **Ray Marching** - Shoots rays from each pixel and marches them in screen space
3. **Indirect Lighting Sampling** - Samples scene color at intersection points
4. **Direct Output** - **Unlike standard SSGI, skips the denoising phase entirely**
5. **Composition** - Combines the indirect lighting with direct lighting

## Performance Tips

Custom SSGI is computationally intensive. Consider these optimization tips:

1. **Lower Resolution Scale** - Use 0.5 or 0.75 resolution scale for significant performance gains
2. **Reduce Ray Steps** - Lower step count improves performance at the cost of accuracy
3. **Optimize Scene** - Reduce unnecessary complex geometry and materials
4. **Enhance Lighting** - Increase ambient lighting to reduce dependency on indirect lighting 