/**
 * Run once from the mobile/ directory:
 *   node create-placeholder-images.js
 *
 * Creates tiny 1×1 dark-pixel placeholder JPGs so the app bundles without
 * errors. Replace each file with a real compressed photo from Unsplash:
 *
 *   recovery_high.jpg  — dark mountain peak golden hour
 *   recovery_low.jpg   — misty dark forest path
 *   sleep.jpg          — northern lights arctic night
 *   activity.jpg       — underwater ocean wave dark blue
 *   nutrition.jpg      — dark storm clouds green hills
 *   wellness.jpg       — desert canyon dusk orange
 *   workout.jpg        — rocky mountain trail clouds
 *   hrv.jpg            — dark lake night stars reflection
 *   streak.jpg         — empty road dark mountains
 *   recap.jpg          — aerial dark ocean waves
 *
 * Compress each real image to <200 KB at imagecompressor.com before replacing.
 */

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'assets', 'images', 'cards');
fs.mkdirSync(dir, { recursive: true });

// Minimal valid 1×1 dark-grey JPEG (109 bytes)
const placeholder = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAHhAA' +
  'AgIDAQEBAAAAAAAAAAAAAQIDBAUREiH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAA' +
  'AAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKzp2rbXRp1xoq+0LJsHxwlQpH2ABwD5r//Z',
  'base64'
);

const files = [
  'recovery_high.jpg',
  'recovery_low.jpg',
  'sleep.jpg',
  'activity.jpg',
  'nutrition.jpg',
  'wellness.jpg',
  'workout.jpg',
  'hrv.jpg',
  'streak.jpg',
  'recap.jpg',
];

files.forEach((file) => {
  const filePath = path.join(dir, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, placeholder);
    console.log(`✓ Created placeholder: ${file}`);
  } else {
    console.log(`· Skipping (already exists): ${file}`);
  }
});

console.log('\nDone. Replace placeholders with real Unsplash images when ready.');
