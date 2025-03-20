---
layout: single
collection: sections
title: Multi-Color Outline
draft: false
menu:
  demos:
    parent: utility
    weight: 31
script: outline-multi
---

# Multi-Color Outline

The OutlineMultiEffect extends the original OutlineEffect by adding support for multiple outline colors. This makes it possible to assign different colors to different objects in the same scene.

## Features

- Support for multiple color sets (visible and hidden edge colors)
- Simple API for adding, removing, and assigning color sets
- Integration with the original outline effect functionality
- Customizable via GUI controls

## Usage

Click on different objects to select them. Each object will be assigned a different outline color in sequence. You can customize the outline colors using the Color Sets controls in the menu.

### Example

```javascript
// Create the outline multi effect
const effect = new OutlineMultiEffect(scene, camera, {
  edgeStrength: 1.0,
  pulseSpeed: 0.0,
  blur: true
});

// Add color sets
effect.addColorSet("red", 0xff0000, 0x330000);
effect.addColorSet("green", 0x00ff00, 0x003300);
effect.addColorSet("blue", 0x0000ff, 0x000033);

// Assign color sets to objects
effect.assignColorSet(redObject, "red");
effect.assignColorSet(greenObject, "green");
effect.assignColorSet(blueObject, "blue");

// Add objects to selection
effect.selection.add(redObject);
effect.selection.add(greenObject);
effect.selection.add(blueObject);
``` 